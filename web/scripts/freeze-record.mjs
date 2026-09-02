/**
 * Freeze the engine's full on-chain history into the repository.
 *
 * The live page reads a rolling ~1000-block tail, which on this chain is about a hundred
 * seconds. Once the engine stops, that tail is empty -- not because anything is broken, but
 * because a judge is looking at a hundred seconds in which nothing happened. The best
 * evidence in the submission would silently disappear.
 *
 * So: scan every block the engine has existed for, decode every event, and commit the result
 * as data. The page renders it only when the live tail is empty, labelled as the recorded run
 * with its date range. Live always wins when the engine is running.
 *
 *   node scripts/freeze-record.mjs
 */
import { createPublicClient, http, decodeEventLog, parseAbi } from "viem";
import { writeFileSync } from "node:fs";

const RPC = "https://dream-rpc.somnia.network/";
const ENGINE = "0x9026b93dc240244A34B3568aF704a60f4703a115";
const FROM_BLOCK = 477068803n; // engine deployment, from broadcast/Deploy.s.sol
const CHUNK = 990n;            // eth_getLogs is capped at 1000 on this RPC

const abi = parseAbi([
  "event Enrolled(address indexed user)",
  "event SubscriptionOpened(uint256 indexed subscriptionId, address emitter, bytes32 topic0)",
  "event SubscriptionClosed(uint256 indexed subscriptionId)",
  "event ToppedUp(address indexed from, uint256 amount, uint256 balance)",
  "event CallbackRan(bytes32 indexed marketId, uint256 scanned, uint256 covered, uint256 cursorAfter)",
  "event CoverOpened(address indexed user, bytes32 indexed marketId, uint256 quantity, uint256 premium, uint256 coverPrice, uint16 requestedBps, uint16 achievedBps, bool degraded)",
  "event CoverSkipped(address indexed user, bytes32 indexed marketId, uint8 reason)",
  "event CoverSettled(address indexed user, bytes32 indexed marketId, uint8 outcome, uint256 quantity, uint256 premium, uint256 proceeds)",
  "event WindowEnqueued(bytes32 indexed marketId, bytes32 assetKey, uint256 openPrice, uint64 firstAttemptAt)",
  "event TickScheduled(uint256 timestampMillis, uint256 pendingWindows)",
  "event TickExpired(uint256 wasScheduledFor, uint256 pendingWindows)",
  "event WindowAttempted(bytes32 indexed marketId, uint8 attempt, uint256 covered)",
  "event WindowGaveUp(bytes32 indexed marketId, uint8 attempts)",
  "event Poked(bytes32 indexed marketId, address indexed by, uint256 covered)",
  "event PendingPruned(bytes32 indexed marketId)",
  "event SettleFailed(address indexed user, bytes32 indexed marketId, uint8 kind, bytes4 selector)",
]);

const SKIP_REASON = ["None","PolicyInactiveOrExpired","BelowEnrolmentFloor","NoExposure","NoLiquidity","CoverTooExpensive","NoHeadroom","BelowMinimumLot","AlreadyCovered","PlacementFailed","NoOpenPrice","WouldMisrepresent"];
const OUTCOME = ["Unsettled","Won","Lost","Voided"];

const client = createPublicClient({ transport: http(RPC) });

const head = await client.getBlockNumber();
console.log(`scanning ${FROM_BLOCK} -> ${head}  (${head - FROM_BLOCK} blocks)`);

const raw = [];
let from = FROM_BLOCK;
let chunks = 0;
while (from <= head) {
  const to = from + CHUNK > head ? head : from + CHUNK;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const logs = await client.getLogs({ address: ENGINE, fromBlock: from, toBlock: to });
      raw.push(...logs);
      break;
    } catch (e) {
      if (attempt === 3) console.error(`  chunk ${from}-${to} failed: ${String(e).slice(0, 80)}`);
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  chunks++;
  if (chunks % 40 === 0) process.stdout.write(`  ${from}  (${raw.length} logs)\n`);
  from = to + 1n;
}
console.log(`raw logs: ${raw.length} over ${chunks} chunks`);

// Timestamps only for blocks that actually carry events.
const blocks = [...new Set(raw.map((l) => l.blockNumber))].sort((a, b) => (a < b ? -1 : 1));
console.log(`fetching ${blocks.length} block timestamps…`);
const ts = new Map();
for (let i = 0; i < blocks.length; i += 24) {
  const slice = blocks.slice(i, i + 24);
  await Promise.all(slice.map(async (b) => {
    try { ts.set(b, Number((await client.getBlock({ blockNumber: b })).timestamp)); } catch { /* skip */ }
  }));
  if (i % 480 === 0 && i) process.stdout.write(`  ${i}/${blocks.length}\n`);
}

const events = [];
for (const l of raw) {
  try {
    const d = decodeEventLog({ abi, data: l.data, topics: l.topics });
    const a = d.args ?? {};
    events.push({
      name: d.eventName,
      block: Number(l.blockNumber),
      ts: ts.get(l.blockNumber) ?? null,
      tx: l.transactionHash,
      marketId: a.marketId ?? null,
      user: a.user ?? null,
      reason: d.eventName === "CoverSkipped" ? (SKIP_REASON[Number(a.reason)] ?? "Unknown") : undefined,
      outcome: d.eventName === "CoverSettled" ? (OUTCOME[Number(a.outcome)] ?? "Unknown") : undefined,
      args: Object.fromEntries(Object.entries(a).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v])),
    });
  } catch { /* foreign or unknown log */ }
}
events.sort((x, y) => x.block - y.block);

const counts = {};
for (const e of events) counts[e.name] = (counts[e.name] ?? 0) + 1;
const withTs = events.filter((e) => e.ts);

const record = {
  engine: ENGINE,
  chainId: 50312,
  fromBlock: Number(FROM_BLOCK),
  toBlock: Number(head),
  capturedAt: new Date().toISOString(),
  firstEventAt: withTs.length ? new Date(withTs[0].ts * 1000).toISOString() : null,
  lastEventAt: withTs.length ? new Date(withTs[withTs.length - 1].ts * 1000).toISOString() : null,
  counts,
  events,
};

writeFileSync(new URL("../lib/.record-raw.json", import.meta.url), JSON.stringify(record, null, 1));
console.log("\ncounts:", counts);
console.log(`range: ${record.firstEventAt} -> ${record.lastEventAt}`);
console.log(`written: web/lib/.record-raw.json  (${events.length} events)`);
