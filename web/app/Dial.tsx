"use client";

import { useMemo, useState } from "react";

/**
 * Drag the make-whole point and watch the position recompute against the live book.
 *
 * Read-only: no wallet, no transaction, no signature. It exists because the hardest idea in
 * the product — that the dial moves a break-even, not the step — is far easier to operate
 * than to read.
 *
 * Progressive enhancement: the server renders this at the policy's own setting, so with
 * JavaScript disabled it is a correct, static readout rather than a broken control.
 */

const W = 720;
const H = 300;
const PAD = { l: 66, r: 40, t: 24, b: 46 };
const PW = W - PAD.l - PAD.r;
const PH = H - PAD.t - PAD.b;
const X_MIN = -0.006;
const X_MAX = 0.05;

export default function Dial({
  exposure,
  coverPrice,
  lotSize,
  bookQty,
  premiumCeilingBps,
  notionalCapUsd,
  initialBps,
}: {
  exposure: number;
  coverPrice: number;
  lotSize: number;
  bookQty: number;
  premiumCeilingBps: number;
  notionalCapUsd: number;
  initialBps: number;
}) {
  const [bps, setBps] = useState(initialBps);
  const s = useMemo(
    () => size({ exposure, coverPrice, lotSize, bookQty, premiumCeilingBps, notionalCapUsd, bps }),
    [exposure, coverPrice, lotSize, bookQty, premiumCeilingBps, notionalCapUsd, bps],
  );

  const ys = [netAt(s, X_MIN), netAt(s, X_MAX), netAt(s, 1e-9), netAt(s, -1e-9)];
  const hi = Math.max(...ys, 10) * 1.15;
  const lo = Math.min(...ys, -10) * 1.15;
  const sx = (x: number) => PAD.l + ((x - X_MIN) / (X_MAX - X_MIN)) * PW;
  const sy = (y: number) => PAD.t + PH - ((y - lo) / (hi - lo)) * PH;
  const zeroY = sy(0);
  const strikeX = sx(0);
  const tone = s.binding ? "heel" : "waterline";

  return (
    <div className="dial-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" className="curve dialcurve"
        aria-label={`Payoff at a ${s.achievedBps} basis point break-even`}>
        <rect x={PAD.l} y={PAD.t} width={PW} height={PH} className="plotbg" />
        <rect x={strikeX} y={PAD.t} width={PAD.l + PW - strikeX} height={PH} className="region-fell" />
        <line x1={PAD.l} y1={zeroY} x2={PAD.l + PW} y2={zeroY} className="datum" />
        <line x1={strikeX} y1={PAD.t} x2={strikeX} y2={PAD.t + PH} className="strike" />

        {[0, 0.01, 0.02, 0.03, 0.04, 0.05].map((t) => (
          <text key={t} x={sx(t)} y={PAD.t + PH + 19} className="axis" textAnchor="middle">
            {t === 0 ? "0" : `${(t * 100).toFixed(0)}%`}
          </text>
        ))}

        <line x1={sx(X_MIN)} y1={sy(netAt(s, X_MIN))} x2={strikeX} y2={sy(netAt(s, -1e-9))} className={`curveline ${tone}`} />
        <line x1={strikeX} y1={sy(netAt(s, 1e-9))} x2={sx(X_MAX)} y2={sy(netAt(s, X_MAX))} className={`curveline ${tone}`} />
        <line x1={strikeX} y1={sy(netAt(s, -1e-9))} x2={strikeX} y2={sy(netAt(s, 1e-9))} className={`riser ${tone}`} />

        <circle cx={sx(s.achievedBps / 10_000)} cy={zeroY} r={5} className={`breakeven ${tone}`} />
        <text x={sx(s.achievedBps / 10_000)} y={zeroY - 13} className={`belabel ${tone}`} textAnchor="middle">
          {s.achievedBps} bps
        </text>
        <text x={PAD.l + PW / 2} y={H - 8} className="axistitle" textAnchor="middle">
          how far the window falls from its open
        </text>
      </svg>

      <div className="dial-controls">
        <label htmlFor="mw">
          make-whole point
          <span className="dial-current">{bps} bps</span>
        </label>
        <input
          id="mw"
          type="range"
          min={25}
          max={800}
          step={25}
          value={bps}
          onChange={(e) => setBps(Number(e.target.value))}
          aria-describedby="dial-readout"
        />
        <dl id="dial-readout" className="dial-readout">
          <div>
            <dt>contracts</dt>
            <dd>{s.qty.toFixed(0)}</dd>
          </div>
          <div>
            <dt>premium</dt>
            <dd>{s.premium.toFixed(2)} tUSDC</dd>
          </div>
          <div>
            <dt>you actually get</dt>
            <dd className={s.binding ? "heel-num" : "waterline-num"}>{s.achievedBps} bps</dd>
          </div>
        </dl>
        <p className={`dial-why ${s.binding ? "binding" : ""}`}>
          {s.binding
            ? `Cannot reach ${bps} bps — ${s.binding}. The figure shown is what could actually be bought.`
            : `Reaches the full ${bps} bps at the book's current price of ${coverPrice.toFixed(3)}.`}
        </p>
      </div>
    </div>
  );
}

type Sized = { qty: number; premium: number; achievedBps: number; binding: string | null; exposure: number };

/** The engine's own arithmetic: N = exposure × x / (1 − q), then the ceilings and lot grid. */
function size(i: {
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

function netAt(s: Sized, x: number) {
  const payout = x > 0 ? s.qty : 0;
  return -s.exposure * x + payout - s.premium;
}
