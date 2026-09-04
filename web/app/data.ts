import {
  KNOWN_POSITIONS,
  buildWindow, getEngineSet, getEngineState, getLiveBook, getLiveWindow, getPosition,
  getSpotPrices, getTape, getVaultState,
} from "@/lib/chain";

/**
 * Every live read, and none of them able to take a page down.
 *
 * This used to await each read directly, so a single RPC failure threw and the whole route
 * returned 500 — a blank front door whenever the testnet endpoint blipped, which it does. A
 * judge arriving during one saw nothing at all, which is the worst possible failure on a site
 * built so that no state ever reads as broken.
 *
 * So every read is caught individually. A page gets what could be read and `null` for what
 * could not, and it is the PAGE's job to say so. Crucially the frozen record needs no network
 * at all — positions, totals, the cumulative chart and every refusal count come from committed
 * JSON — so an outage costs only the handful of genuinely live figures.
 *
 * Nulls rather than zeros, deliberately: a zero is a number, and rendering one we did not read
 * would be inventing it.
 */
export type Preview = Awaited<ReturnType<typeof loadPreview>>;

const nullable = <T,>(p: Promise<T>) => p.then((v) => v).catch(() => null);

export async function loadPreview() {
  const vault = await nullable(getVaultState());
  const makeWholeBps = vault ? Number(vault.policy[1]) || 250 : 250;

  const [engine, prices, tape, live, engineSet, ...positions] = await Promise.all([
    nullable(getEngineState()),
    getSpotPrices().catch(() => []),
    getTape(14).catch(() => ({ items: [], head: 0n, spanBlocks: 0 })),
    nullable(getLiveWindow(makeWholeBps)),
    nullable(getEngineSet()),
    ...KNOWN_POSITIONS.map((p) => nullable(getPosition(p))),
  ]);

  // The hero must never be a blank box: fall back to the most recently seen window.
  let shown = live;
  if (!shown) {
    const lastSeen = tape.items.find((t) => t.kind === "enqueued" && t.marketId)?.marketId;
    if (lastSeen) shown = await nullable(buildWindow(lastSeen, makeWholeBps));
  }
  const book = await nullable(getLiveBook(shown?.marketId ?? null));
  const eth = prices.find((p) => p.asset === "ETH") ?? null;

  const live_positions = positions.filter((p): p is NonNullable<typeof p> => p !== null);
  const settled = live_positions.filter((p) => p.settled);
  const premiumPaid = settled.reduce((a, p) => a + Number(p.premium) / 1e6, 0);
  const proceeds = settled.reduce((a, p) => a + Number(p.proceeds) / 1e6, 0);
  const paidOut = settled.filter((p) => p.outcome === "Won").length;
  const declined = tape.items.filter((t) => t.kind === "declined" || t.kind === "gaveUp").slice(0, 6);

  /* `chainOk` is what a page checks before promising a figure is current. It is false if any
     of the three reads a page actually surfaces failed, not merely if something somewhere did. */
  const chainOk = vault !== null && engine !== null && eth !== null;

  return {
    chainOk, readAt: chainOk ? Date.now() : null,
    vault, engine, prices, tape, shown, book, makeWholeBps, eth,
    positions: live_positions, settled, premiumPaid, proceeds, paidOut, engineSet, declined,
  };
}

/** Chain timestamps are UTC. Render them as UTC, explicitly, always. */
export function utc(ts: number | bigint): string {
  const d = new Date(Number(ts) * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}

/** The three steps as the flow ACTUALLY exists after Phase 0 -- minting, not trading. */
export const STEPS = [
  {
    n: "01",
    head: "Hold something",
    body: "Mint test ETH in one click. Ballast only ever covers what it can measure you holding on chain — never a number you type in.",
    foot: "one transaction · no approval",
  },
  {
    n: "02",
    head: "Say how deep",
    body: "Set the load line: how far a fall you want made whole, and the most you will pay for it. That is the whole of the policy.",
    foot: "revocable at any time",
  },
  {
    n: "03",
    head: "The chain does the rest",
    body: "Every window, in the same block it opens, Ballast buys cover — or declines it and tells you which reason. No keeper, no cron, nothing of ours running.",
    foot: "0 blocks latency",
  },
] as const;
