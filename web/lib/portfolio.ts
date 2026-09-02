import raw from "./record.json";

/**
 * Position history for an account, derived from the frozen record.
 *
 * Not from a live log tail: the engine is stopped, and `eth_getLogs` is capped at 1000 blocks
 * (about 100 seconds here), so a rolling window would show an empty portfolio by the 9th.
 * Live data wins whenever the engine is running; this carries it otherwise, labelled.
 */

const ASSET: Record<string, string> = {
  "0xaaaebeba3810b1e6b70781f14b2d72c1cb89c0b2b320c43bb67ff79f562f5ff4": "ETH",
  "0xe98e2830be1a7e4156d656a7505e65d08c67660dc618072422e9c78053c261e9": "BTC",
};

type RawEvent = {
  name: string; block: number; ts: number | null; tx: string;
  marketId: string | null; user: string | null; outcome?: string;
  args: Record<string, string | number | boolean>;
};

const rec = raw as unknown as { events: RawEvent[] };

export type PositionRow = {
  marketId: string;
  asset: string;
  openedAt: number | null;
  openedBlock: number;
  openedTx: string;
  premium: number;
  quantity: number;
  requestedBps: number;
  achievedBps: number;
  /** Why achieved fell short of requested, or null when it did not. */
  shortfall: string | null;
  outcome: "Won" | "Lost" | "Voided" | "Open";
  proceeds: number | null;
  /** Payout minus premium. Null while the position is still open. */
  net: number | null;
  settledTx: string | null;
  settledAt: number | null;
};

const n = (v: unknown) => Number(v ?? 0);

/** The premium ceiling in force on this account, in basis points of exposure. */
const PREMIUM_CEILING_BPS = 300;

/**
 * Which constraint actually shortened the position.
 *
 * `degraded` on the event is `desiredPremium > limit || achievedBps < requestedBps` -- it
 * fires on either condition and records which one nowhere. But the cause IS recoverable from
 * the event alone: exposure = qty·(1−q)·10000/achievedBps, so the ceiling in collateral terms
 * is exposure × ceilingBps, and a premium comfortably under that means the ceiling was not
 * what bound it. Across this account's history that is 39 of 40 -- the book, not the policy,
 * which is what the landing page says too.
 */
function boundBy(
  args: Record<string, string | number | boolean>,
  requestedBps: number, achievedBps: number, premium: number,
): string | null {
  if (achievedBps >= requestedBps) return null;
  const qty = n(args.quantity) / 1e6;
  const q = n(args.coverPrice) / 1e6;
  if (!achievedBps || !qty) return "the size was bound";
  const exposure = (qty * (1 - q) * 10_000) / achievedBps;
  const ceiling = (exposure * PREMIUM_CEILING_BPS) / 10_000;
  if (ceiling <= 0) return "the size was bound";
  return premium >= ceiling * 0.995
    ? "premium ceiling bound the size"
    : "the book offered less than the ask";
}

/** The window metadata a cover needs to name itself. */
const windows = new Map<string, { asset: string; openPrice: number }>();
for (const e of rec.events) {
  if (e.name !== "WindowEnqueued" || !e.marketId) continue;
  windows.set(e.marketId.toLowerCase(), {
    asset: ASSET[String(e.args.assetKey).toLowerCase()] ?? "—",
    openPrice: n(e.args.openPrice) / 1e18,
  });
}

const settlements = new Map<string, RawEvent>();
for (const e of rec.events) {
  if (e.name === "CoverSettled" && e.marketId && e.user) {
    settlements.set(`${e.user.toLowerCase()}|${e.marketId.toLowerCase()}`, e);
  }
}

export function positionsFor(user: string): PositionRow[] {
  const who = user.toLowerCase();
  const rows: PositionRow[] = [];

  for (const e of rec.events) {
    if (e.name !== "CoverOpened" || !e.marketId || !e.user) continue;
    if (e.user.toLowerCase() !== who) continue;

    const key = `${who}|${e.marketId.toLowerCase()}`;
    const s = settlements.get(key);
    const premium = n(e.args.premium) / 1e6;
    const proceeds = s ? n(s.args.proceeds) / 1e6 : null;
    const requestedBps = n(e.args.requestedBps);
    const achievedBps = n(e.args.achievedBps);

    rows.push({
      marketId: e.marketId,
      asset: windows.get(e.marketId.toLowerCase())?.asset ?? "—",
      openedAt: e.ts, openedBlock: e.block, openedTx: e.tx,
      premium, quantity: n(e.args.quantity) / 1e6,
      requestedBps, achievedBps,
      shortfall: boundBy(e.args, requestedBps, achievedBps, premium),
      outcome: (s?.outcome as PositionRow["outcome"]) ?? "Open",
      proceeds,
      net: proceeds === null ? null : proceeds - premium,
      settledTx: s?.tx ?? null,
      settledAt: s?.ts ?? null,
    });
  }

  return rows.sort((a, b) => b.openedBlock - a.openedBlock);
}

export type Totals = {
  positions: number; settled: number; open: number;
  /** Premium on SETTLED positions only, and the payout against it. */
  settledPremium: number; paidOut: number; settledNet: number;
  /** Premium on positions whose outcome is not yet known. Never counted as a loss. */
  committedPremium: number;
  premiumEver: number;
  paid: number; hitRate: number | null;
};

export function totalsFor(rows: PositionRow[]): Totals {
  const settled = rows.filter((r) => r.outcome !== "Open");
  const open = rows.filter((r) => r.outcome === "Open");
  const paid = settled.filter((r) => (r.proceeds ?? 0) > 0).length;

  // Net is computed against SETTLED positions only. Forty-three of these windows expired
  // without settle() being called, and their premium is spent but their outcome is not
  // known -- folding them into a net figure would report unknowns as losses.
  const settledPremium = settled.reduce((a, r) => a + r.premium, 0);
  const paidOut = settled.reduce((a, r) => a + (r.proceeds ?? 0), 0);

  return {
    positions: rows.length,
    settled: settled.length,
    open: open.length,
    settledPremium, paidOut, settledNet: paidOut - settledPremium,
    committedPremium: open.reduce((a, r) => a + r.premium, 0),
    premiumEver: rows.reduce((a, r) => a + r.premium, 0),
    paid,
    // A hit rate over two settled positions is noise dressed as a statistic.
    hitRate: settled.length >= 5 ? paid / settled.length : null,
  };
}
