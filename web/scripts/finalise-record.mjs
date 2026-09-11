/**
 * Turn the raw multi-engine capture into the two committed files.
 *
 *   docs/run-record.json  -- the archive: every decoded event from every engine, one stream
 *   web/lib/record.json   -- the display slice the site imports
 *
 * Both carry the same header: the engines, the block range, event counts, refusals by reason
 * and the window mix. Everything a page states as a run-wide total must come from the header,
 * not from the slice -- the slice keeps every cover and settlement but only a recent sample of
 * refusals, so counting refusals from it reported "No exposure 47" for a run that refused 640
 * times for that reason.
 *
 *   node scripts/freeze-record.mjs && node scripts/finalise-record.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const rec = JSON.parse(readFileSync(new URL("../lib/.record-raw.json", import.meta.url), "utf8"));
const all = rec.events;

const counts = {};
for (const e of all) counts[e.name] = (counts[e.name] ?? 0) + 1;

const skipReasons = {};
for (const e of all) if (e.name === "CoverSkipped") skipReasons[e.reason] = (skipReasons[e.reason] ?? 0) + 1;

// Window lengths of the account's covers, by seconds. Opened and settled are counted apart:
// a settled count is what the sample caveat is about.
const windowMix = { opened: {}, settled: {} };
for (const e of all) {
  if (!e.window) continue;
  const k = String(e.window.seconds);
  if (e.name === "CoverOpened") windowMix.opened[k] = (windowMix.opened[k] ?? 0) + 1;
  if (e.name === "CoverSettled") windowMix.settled[k] = (windowMix.settled[k] ?? 0) + 1;
}

const perEngine = {};
for (const e of all) {
  const p = (perEngine[e.engine] ??= {});
  p[e.name] = (p[e.name] ?? 0) + 1;
}

const header = {
  engines: rec.engines, chainId: rec.chainId, fromBlock: rec.fromBlock, toBlock: rec.toBlock,
  capturedAt: rec.capturedAt, firstEventAt: rec.firstEventAt, lastEventAt: rec.lastEventAt,
  counts, skipReasons, windowMix, perEngine, totalEvents: all.length,
};

const full = {
  ...header,
  events: all,
  note: "Complete on-chain record of the account's cover, across every engine Ballast has deployed, as one history. Each event names the engine that emitted it.",
};
// Compact: the archive is tens of thousands of events, and indentation alone would add
// megabytes to a public repository for no reader's benefit.
writeFileSync(new URL("../../docs/run-record.json", import.meta.url), JSON.stringify(full));

// Display slice. Everything that carries an outcome, a real contiguous excerpt around the most
// recent purchase, and a recent sample of each remaining kind so every section has genuine
// data. Taking "the last N events" instead once produced 139 window-opened rows and no
// refusals at all.
const lastCoverIdx = all.findLastIndex((e) => e.name === "CoverOpened");
const contiguous = lastCoverIdx >= 0 ? all.slice(Math.max(0, lastCoverIdx - 20), lastCoverIdx + 20) : [];
const lastOf = (name, n) => all.filter((e) => e.name === name).slice(-n);

// Every covered market brings its WindowEnqueued: that event carries the asset key and the
// opening price, which is how a position names its window and measures the move.
const coveredMarkets = new Set(
  all.filter((e) => e.name === "CoverOpened" || e.name === "CoverSettled").map((e) => e.marketId),
);
const picked = new Set([
  ...all.filter((e) => e.name === "WindowEnqueued" && coveredMarkets.has(e.marketId)),
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

writeFileSync(new URL("../lib/record.json", import.meta.url), JSON.stringify({ ...header, events }, null, 1));

console.log(`archive : docs/run-record.json  ${all.length} events`);
console.log(`display : web/lib/record.json    ${events.length} events`);
console.log("counts  :", counts);
console.log("skips   :", skipReasons);
console.log("windows :", windowMix);
console.log("engines :", Object.fromEntries(Object.entries(perEngine).map(([k, v]) => [k.slice(0, 10), `${v.CoverOpened ?? 0} opened, ${v.CoverSettled ?? 0} settled, ${v.CallbackRan ?? 0} scans`])));
