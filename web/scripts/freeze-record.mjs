/**
 * Freeze the account's full on-chain history, across every engine, into the repository.
 *
 * One continuous history. The engine has been redeployed five times, but the vault, the demo
 * account and the product are the same throughout — so the record is every engine's events in
 * one stream, each tagged with the engine that emitted it, rather than one engine's run with
 * a few retired positions stitched on.
 *
 * The live page reads a rolling ~1000-block tail, which on this chain is about a hundred
 * seconds. This is the history behind it, committed as data, so it survives any stop.
 *
 * Every covered or settled market also carries its window — open, close and length — read from
 * the module, because the mix of 60 s, 5 m, 15 m and 1 h windows is part of what the record
 * shows. Logs the ABI cannot decode are counted per engine and reported, never dropped
 * silently: the earliest engines predate some of today's events.
 *
 *   node scripts/freeze-record.mjs            -> web/lib/.record-raw.json
 *   node scripts/finalise-record.mjs          -> docs/run-record.json + web/lib/record.json
 */
import { createPublicClient, http, decodeEventLog, parseAbi } from "viem";
import { readFileSync, writeFileSync } from "node:fs";

const RPC = "https://dream-rpc.somnia.network/";
const MODULE = "0x3ecC694Cef705358864a646142ac17A90E29e388";
const ENGINES = [
  "0xB095Aacf9D2e3B12717C2a58B4C6b3afdDf053b0",
  "0x9cf2fBC0C2d6Db45799e52f54347ad7B97801581",
  "0x8ff058704823A6711A456beAfbEd6509F4845f13",
  "0x9026b93dc240244A34B3568aF704a60f4703a115",
  "0x234520a8265CeD9a668874aF8aF4f4897822945A",
  "0xFE7250509634ABb94b3cDbd72eb122feCcaC157c",
];
const CHUNK = 990n;   // eth_getLogs is capped at 1000 blocks on this RPC
const PARALLEL = 8;

// The current engine's full event set, from the build — a superset of what earlier engines emit.
const artifact = JSON.parse(readFileSync(new URL("../../out/HedgeEngine.sol/HedgeEngine.json", import.meta.url), "utf8"));
const abi = artifact.abi.filter((x) => x.type === "event");
const moduleAbi = parseAbi([
  "struct MarketRow { uint256 oracleQuestionId; uint8 outcomeSlotCount; uint8 voidPolicy; address collateral; uint32 originOperatorId; bytes32 originVenueId; address oracleAdapter; address creator; address market; address pool; uint256 yesId; uint256 noId; uint64 tradingStart; uint64 expiry; }",
  "function markets(bytes32) view returns (MarketRow)",
]);

const SKIP_REASON = ["None","PolicyInactiveOrExpired","BelowEnrolmentFloor","NoExposure","NoLiquidity","CoverTooExpensive","NoHeadroom","BelowMinimumLot","AlreadyCovered","PlacementFailed","NoOpenPrice","WouldMisrepresent"];
const OUTCOME = ["Unsettled","Won","Lost","Voided"];

const client = createPublicClient({ transport: http(RPC) });
const retry = async (fn, what) => {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      if (i === 5) throw new Error(`${what}: ${String(e).slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
};

/** First block with code at `a`, by bisection — no deploy block has to be remembered. */
async function deployBlock(a) {
  let lo = 0n, hi = await client.getBlockNumber();
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const code = await retry(() => client.getBytecode({ address: a, blockNumber: mid }), "code").catch(() => undefined);
    if (code && code !== "0x") hi = mid; else lo = mid + 1n;
  }
  return lo;
}

const deployed = {};
for (const e of ENGINES) deployed[e.toLowerCase()] = await deployBlock(e);
const FROM = Object.values(deployed).reduce((a, b) => (a < b ? a : b));
const head = await client.getBlockNumber();
console.log("deployed at:", Object.fromEntries(Object.entries(deployed).map(([k, v]) => [k.slice(0, 10), Number(v)])));
console.log(`scanning ${FROM} -> ${head} (${head - FROM} blocks) for ${ENGINES.length} engines at once`);

const ranges = [];
for (let f = FROM; f <= head; f += CHUNK + 1n) ranges.push([f, f + CHUNK > head ? head : f + CHUNK]);
const raw = [];
let done = 0;
for (let i = 0; i < ranges.length; i += PARALLEL) {
  const batch = ranges.slice(i, i + PARALLEL);
  const got = await Promise.all(batch.map(([f, t]) =>
    retry(() => client.getLogs({ address: ENGINES, fromBlock: f, toBlock: t }), `logs ${f}-${t}`)));
  for (const g of got) raw.push(...g);
  done += batch.length;
  if (done % 800 < PARALLEL) console.log(`  ${done}/${ranges.length} chunks, ${raw.length} logs`);
}
console.log(`raw logs: ${raw.length}`);

const events = [];
const undecoded = {};
for (const l of raw) {
  const engine = l.address.toLowerCase();
  let d;
  try { d = decodeEventLog({ abi, data: l.data, topics: l.topics }); }
  catch { const k = `${engine.slice(0, 10)} ${l.topics[0]?.slice(0, 10)}`; undecoded[k] = (undecoded[k] ?? 0) + 1; continue; }
  const a = d.args ?? {};
  events.push({
    name: d.eventName,
    engine,
    block: Number(l.blockNumber),
    ts: null,
    tx: l.transactionHash,
    marketId: a.marketId ?? null,
    user: a.user ?? null,
    reason: d.eventName === "CoverSkipped" ? (SKIP_REASON[Number(a.reason)] ?? "Unknown") : undefined,
    outcome: d.eventName === "CoverSettled" ? (OUTCOME[Number(a.outcome)] ?? "Unknown") : undefined,
    args: Object.fromEntries(Object.entries(a).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v])),
  });
}
events.sort((x, y) => x.block - y.block);

// Timestamps: every block that carries an event, fetched rather than interpolated.
const blocks = [...new Set(events.map((e) => e.block))];
console.log(`fetching ${blocks.length} block timestamps…`);
const ts = new Map();
for (let i = 0; i < blocks.length; i += 32) {
  const slice = blocks.slice(i, i + 32);
  await Promise.all(slice.map(async (b) => {
    const blk = await retry(() => client.getBlock({ blockNumber: BigInt(b) }), `block ${b}`);
    ts.set(b, Number(blk.timestamp));
  }));
  if (i % 3200 === 0 && i) console.log(`  ${i}/${blocks.length}`);
}
for (const e of events) e.ts = ts.get(e.block) ?? null;
const missingTs = events.filter((e) => e.ts === null).length;

// The window of every market the account was covered on.
const covered = [...new Set(events.filter((e) => e.name === "CoverOpened" || e.name === "CoverSettled").map((e) => e.marketId))];
const win = new Map();
for (let i = 0; i < covered.length; i += 16) {
  await Promise.all(covered.slice(i, i + 16).map(async (m) => {
    const r = await retry(() => client.readContract({ address: MODULE, abi: moduleAbi, functionName: "markets", args: [m] }), `market ${m}`);
    win.set(m, { start: Number(r.tradingStart), close: Number(r.expiry), seconds: Number(r.expiry - r.tradingStart) });
  }));
}
for (const e of events) if (win.has(e.marketId) && (e.name === "CoverOpened" || e.name === "CoverSettled")) e.window = win.get(e.marketId);

const counts = {};
for (const e of events) counts[e.name] = (counts[e.name] ?? 0) + 1;
const withTs = events.filter((e) => e.ts);

const record = {
  engines: ENGINES.map((a) => ({ address: a, deployedAt: Number(deployed[a.toLowerCase()]) })),
  chainId: 50312,
  fromBlock: Number(FROM),
  toBlock: Number(head),
  capturedAt: new Date().toISOString(),
  firstEventAt: withTs.length ? new Date(withTs[0].ts * 1000).toISOString() : null,
  lastEventAt: withTs.length ? new Date(withTs[withTs.length - 1].ts * 1000).toISOString() : null,
  counts,
  undecoded,
  events,
};

writeFileSync(new URL("../lib/.record-raw.json", import.meta.url), JSON.stringify(record));
console.log("\ncounts:", counts);
console.log("undecoded logs (engine topic0 -> n):", Object.keys(undecoded).length ? undecoded : "none");
console.log(`events missing a timestamp: ${missingTs} | covered markets with a window: ${win.size}/${covered.length}`);
console.log(`range: ${record.firstEventAt} -> ${record.lastEventAt}`);
console.log(`written: web/lib/.record-raw.json  (${events.length} events)`);
