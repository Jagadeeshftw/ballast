import { SKIP_MEANING, type TapeItem } from "./chain";
import raw from "./record.json";

/**
 * The frozen record of the engine's run.
 *
 * The live page reads a rolling ~1000-block tail, which on this chain is about a hundred
 * seconds. With the engine stopped that tail is empty — not because anything is broken, but
 * because you are looking at a hundred seconds in which nothing happened. This is the same
 * history, captured from the chain and committed as data, so the evidence survives the
 * subscription.
 *
 * It is never mixed with live data and never disguised as live: the page shows it only when
 * the live tail is empty, and always says which run it is and when it ran.
 */

type RawEvent = {
  name: string; block: number; ts: number | null; tx: string;
  marketId: string | null; user: string | null;
  reason?: string; outcome?: string;
  args: Record<string, string | number | boolean>;
};

const rec = raw as unknown as {
  engine: string; fromBlock: number; toBlock: number; capturedAt: string;
  firstEventAt: string | null; lastEventAt: string | null;
  counts: Record<string, number>; events: RawEvent[];
};

/** Same phrasing as the live tape, so a reader cannot tell the two apart on wording alone. */
function toItem(e: RawEvent): TapeItem | null {
  const base = { block: BigInt(e.block), tx: e.tx, marketId: e.marketId };
  const a = e.args;
  switch (e.name) {
    case "WindowEnqueued":
      return { ...base, kind: "enqueued", tone: "silt", headline: "window opened",
        detail: "dreamDEX rolled a new window; Ballast reacted in the same block" };
    case "TickScheduled":
      return { ...base, kind: "tick", tone: "silt", headline: "tick scheduled",
        detail: `${a.pendingWindows} window(s) waiting for a book` };
    case "TickExpired":
      return { ...base, kind: "tickExpired", tone: "heel", headline: "tick lost, replaced",
        detail: "a scheduled callback never arrived; the ladder rescheduled itself" };
    case "WindowAttempted":
      return { ...base, kind: "attempt", tone: "silt", headline: `attempt ${a.attempt}`,
        detail: Number(a.covered) > 0 ? `covered ${a.covered}` : "book not priceable yet" };
    case "WindowGaveUp":
      return { ...base, kind: "gaveUp", tone: "heel", headline: "gave up",
        detail: `${a.attempts} attempts, book never became priceable` };
    case "CoverOpened":
      return { ...base, kind: "opened", tone: "waterline", headline: "cover opened",
        detail: `${(Number(a.premium) / 1e6).toFixed(2)} tUSDC · asked ${a.requestedBps} bps, got ${a.achievedBps} bps` };
    case "CoverSkipped":
      return { ...base, kind: "declined", tone: "heel", headline: e.reason ?? "Unknown",
        detail: SKIP_MEANING[e.reason ?? ""] ?? "" };
    case "CallbackRan":
      return { ...base, kind: "callback", tone: "silt", headline: "batch ran",
        detail: `scanned ${a.scanned}, covered ${a.covered}` };
    case "CoverSettled":
      return { ...base, kind: "settled", tone: e.outcome === "Won" ? "waterline" : "heel",
        headline: `settled · ${e.outcome ?? "?"}`,
        detail: `${(Number(a.proceeds) / 1e6).toFixed(2)} tUSDC paid out` };
    default:
      return null;
  }
}

const items: TapeItem[] = rec.events
  .map(toItem)
  .filter((x): x is TapeItem => x !== null)
  .sort((x, y) => Number(y.block - x.block));

const dayOf = (iso: string | null) =>
  iso ? new Date(iso).toISOString().slice(0, 10) : null;

/**
 * A contiguous excerpt around the most recent cover, rather than the last N events.
 *
 * The final moments before the engine stopped were all window-opened rows, so "the ten most
 * recent" reads as ten identical lines and proves nothing. This is a real, unreordered slice
 * of history that happens to contain a purchase -- the same evidence the live tape shows when
 * the engine is running, and honest because nothing is rearranged.
 */
function excerptAroundCover(n = 12): TapeItem[] {
  const chron = [...items].sort((a, b) => Number(a.block - b.block));
  const at = chron.findLastIndex((i) => i.kind === "opened");
  if (at < 0) return items.slice(0, n);
  const start = Math.max(0, at - Math.floor(n / 2));
  return chron.slice(start, start + n).sort((a, b) => Number(b.block - a.block));
}

export const RECORD = {
  engine: rec.engine,
  fromBlock: rec.fromBlock,
  toBlock: rec.toBlock,
  capturedAt: rec.capturedAt,
  firstDay: dayOf(rec.firstEventAt),
  lastDay: dayOf(rec.lastEventAt),
  counts: rec.counts,
  total: items.length,
  items,
  excerpt: excerptAroundCover(12),
  declined: items.filter((i) => i.kind === "declined" || i.kind === "gaveUp"),
  covers: items.filter((i) => i.kind === "opened"),
  settled: items.filter((i) => i.kind === "settled"),
};

/** A human range like "1–2 September 2026", or null if the capture is empty. */
export function recordRange(): string | null {
  if (!rec.firstEventAt || !rec.lastEventAt) return null;
  const f = new Date(rec.firstEventAt), l = new Date(rec.lastEventAt);
  const mon = (d: Date) => d.toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
  const sameMonth = f.getUTCMonth() === l.getUTCMonth() && f.getUTCFullYear() === l.getUTCFullYear();
  return sameMonth
    ? `${f.getUTCDate()}–${l.getUTCDate()} ${mon(l)} ${l.getUTCFullYear()}`
    : `${f.getUTCDate()} ${mon(f)} – ${l.getUTCDate()} ${mon(l)} ${l.getUTCFullYear()}`;
}
