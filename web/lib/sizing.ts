/**
 * How a make-whole point becomes a position, and which limit bound it.
 *
 * Extracted from the landing page's dial unchanged so the dashboard cannot drift from it.
 * The order of the checks is the order the engine applies them, and `binding` names the first
 * one that actually bit — which is the number the UI must show, because a position that
 * quietly delivers less than asked is the failure this product exists to avoid.
 *
 *   N = exposure · x* / (1 − q)     premium = N·q     achieved = N(1 − q)·10000 / exposure
 */
export type Sized = {
  qty: number;
  premium: number;
  achievedBps: number;
  binding: string | null;
  exposure: number;
};

export function size(i: {
  exposure: number; coverPrice: number; lotSize: number; bookQty: number;
  premiumCeilingBps: number; notionalCapUsd: number; bps: number;
}): Sized {
  const q = i.coverPrice;
  const x = i.bps / 10_000;
  const wantQty = (i.exposure * x) / (1 - q);
  let qty = wantQty;
  let binding: string | null = null;

  const premiumCap = (i.exposure * i.premiumCeilingBps) / 10_000;
  if (qty * q > premiumCap) {
    qty = premiumCap / q;
    binding = `your premium ceiling of ${i.premiumCeilingBps} bps binds first`;
  }
  if (qty * q > i.notionalCapUsd) {
    qty = i.notionalCapUsd / q;
    binding = "your per-window cap binds first";
  }
  if (qty > i.bookQty) {
    qty = i.bookQty;
    binding = `the book only offers ${i.bookQty.toFixed(0)} contracts`;
  }
  if (i.lotSize > 0) qty = Math.floor(qty / i.lotSize) * i.lotSize;

  const premium = qty * q;
  const achieved = i.exposure > 0 ? Math.round((qty * (1 - q) * 10_000) / i.exposure) : 0;
  return { qty, premium, achievedBps: achieved, binding, exposure: i.exposure };
}
