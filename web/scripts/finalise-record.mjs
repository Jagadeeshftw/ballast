/**
 * Complete the frozen record and split it in two.
 *
 * 1. The live engine was deployed after both settled positions were opened, so the scan of
 *    its own history contains zero CoverSettled events. The outcomes -- the best evidence in
 *    the submission -- live on two retired engines. Pull those four transactions directly.
 * 2. The full capture is 3 MB. That belongs in the repository as the archive, but importing
 *    it into a page would ship 3 MB of JSON to every visitor. So the app gets a display
 *    slice, and docs/ gets the whole thing.
 */
import { createPublicClient, http, decodeEventLog, parseAbi } from "viem";
import { readFileSync, writeFileSync } from "node:fs";

const client = createPublicClient({ transport: http("https://dream-rpc.somnia.network/") });
const rec = JSON.parse(readFileSync(new URL("../lib/.record-raw.json", import.meta.url), "utf8"));

const abi = parseAbi([
  "event CoverOpened(address indexed user, bytes32 indexed marketId, uint256 quantity, uint256 premium, uint256 coverPrice, uint16 requestedBps, uint16 achievedBps, bool degraded)",
  "event CoverSettled(address indexed user, bytes32 indexed marketId, uint8 outcome, uint256 quantity, uint256 premium, uint256 proceeds)",
]);
const OUTCOME = ["Unsettled", "Won", "Lost", "Voided"];

const EXTRA = [
  "0xa7398198a56e982b0a026a613cecfc269dd16a798a7e8522948901b10cf120cf",
  "0xac81f1fe91f1eb8d9e21f88140bce12abe23bef698f73760f5f6796f9960c2fb",
  "0xdf3cef7e35293f516973eea140e76565162ba85dc5608b5d9112eac1c1ebc5b7",
  "0x5bbe1e6005513a4d88ad993d4042f55bba86e9e0547fc3033a667f53c19c305a",
];

const added = [];
for (const tx of EXTRA) {
  try {
    const r = await client.getTransactionReceipt({ hash: tx });
    const blk = await client.getBlock({ blockNumber: r.blockNumber });
    for (const l of r.logs) {
      try {
        const d = decodeEventLog({ abi, data: l.data, topics: l.topics });
        const a = d.args ?? {};
        added.push({
          name: d.eventName, block: Number(r.blockNumber), ts: Number(blk.timestamp),
          tx, marketId: a.marketId ?? null, user: a.user ?? null,
          engine: l.address,
          outcome: d.eventName === "CoverSettled" ? (OUTCOME[Number(a.outcome)] ?? "Unknown") : undefined,
          args: Object.fromEntries(Object.entries(a).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v])),
        });
      } catch { /* not one of ours */ }
    }
  } catch (e) { console.error("  could not fetch", tx.slice(0, 12), String(e).slice(0, 60)); }
}
console.log(`recovered ${added.length} events from the retired engines`);
for (const e of added) console.log(`  ${e.name}${e.outcome ? " · " + e.outcome : ""}  block ${e.block}`);

// Dedupe defensively: a rerun must produce the same archive, not a longer one.
const byKey = new Map();
for (const e of [...rec.events, ...added]) {
  byKey.set(`${e.name}|${e.tx}|${e.block}|${e.marketId ?? ""}|${e.user ?? ""}`, e);
}
const all = [...byKey.values()].sort((a, b) => a.block - b.block);
const counts = {};
for (const e of all) counts[e.name] = (counts[e.name] ?? 0) + 1;
const withTs = all.filter((e) => e.ts);

const full = {
  ...rec, counts, events: all,
  firstEventAt: withTs.length ? new Date(withTs[0].ts * 1000).toISOString() : null,
  lastEventAt: withTs.length ? new Date(withTs[withTs.length - 1].ts * 1000).toISOString() : null,
  note: "Complete on-chain record of the Ballast engine's run. Includes the two settled positions opened by retired engines, which predate the live engine's deployment.",
};
writeFileSync(new URL("../../docs/run-record.json", import.meta.url), JSON.stringify(full, null, 1));

// Display slice. Taking "the last N events" produced 139 window-opened rows and no
// refusals at all, because the minutes before shutdown were quiet -- which would have left
// "And it refuses" empty, the exact failure this whole exercise exists to prevent. So the
// slice is composed: everything that carries an outcome, a real contiguous excerpt around a
// purchase, and a recent sample of each remaining kind so every section has genuine data.
const lastCoverIdx = all.findLastIndex((e) => e.name === "CoverOpened");
const contiguous = lastCoverIdx >= 0
  ? all.slice(Math.max(0, lastCoverIdx - 20), lastCoverIdx + 20)
  : [];

const lastOf = (name, n) => all.filter((e) => e.name === name).slice(-n);

// Every market that has a cover must bring its WindowEnqueued with it: that event carries
// the assetKey and the opening price, which is how the portfolio names the window and
// computes the move. Without it a position row would say "unknown asset".
const coveredMarkets = new Set(
  all.filter((e) => e.name === "CoverOpened" || e.name === "CoverSettled").map((e) => e.marketId),
);
const windowsForCovers = all.filter(
  (e) => e.name === "WindowEnqueued" && coveredMarkets.has(e.marketId),
);

const picked = new Set([
  ...windowsForCovers,
  ...all.filter((e) => e.name === "CoverOpened" || e.name === "CoverSettled"),
  ...contiguous,
  ...lastOf("CoverSkipped", 80),
  ...lastOf("WindowGaveUp", 40),
  ...lastOf("WindowAttempted", 40),
  ...lastOf("WindowEnqueued", 40),
  ...lastOf("TickScheduled", 10),
  ...all.filter((e) => ["TickExpired", "SubscriptionOpened", "SubscriptionClosed", "Enrolled", "ToppedUp"].includes(e.name)),
]);
const events = [...picked].sort((a, b) => a.block - b.block);

const slim = {
  engine: full.engine, chainId: full.chainId, fromBlock: full.fromBlock, toBlock: full.toBlock,
  capturedAt: full.capturedAt, firstEventAt: full.firstEventAt, lastEventAt: full.lastEventAt,
  counts, totalEvents: all.length, events,
};
writeFileSync(new URL("../lib/record.json", import.meta.url), JSON.stringify(slim, null, 1));

console.log(`\narchive : docs/run-record.json  ${all.length} events`);
console.log(`display : web/lib/record.json    ${events.length} events`);
console.log("counts  :", counts);
