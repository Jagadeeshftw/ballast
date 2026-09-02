import type { Position } from "@/lib/chain";

/**
 * The payoff, drawn once on entry: the step at the strike first, then the two regions, then
 * the real settled outcomes landing on the curve.
 *
 * The order is the argument. The step is what the instrument pays; the regions are what it
 * costs either side of the load line; the points are what actually happened. Teaching, not
 * decoration.
 *
 * There is no flat net line and there cannot be -- an at-the-money binary pays a fixed amount
 * on a trigger, so the step at the strike is pinned.
 */

const W = 900, H = 420;
const PAD = { l: 74, r: 150, t: 34, b: 66 };
const X = { min: -0.008, max: 0.03 };

export default function PayoffA({ positions }: { positions: Position[] }) {
  const pw = W - PAD.l - PAD.r, ph = H - PAD.t - PAD.b;

  const ys: number[] = [];
  for (const p of positions) {
    ys.push(netAt(p, X.min), netAt(p, X.max), netAt(p, 1e-9), netAt(p, -1e-9));
    if (p.netTotal !== null) ys.push(p.netTotal);
  }
  const hi = Math.max(...ys, 10) * 1.16;
  const lo = Math.min(...ys, -10) * 1.16;
  const sx = (x: number) => PAD.l + ((x - X.min) / (X.max - X.min)) * pw;
  const sy = (y: number) => PAD.t + ph - ((y - lo) / (hi - lo)) * ph;
  const zeroY = sy(0), strikeX = sx(0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="pa" role="img"
      aria-label="Payoff of parametric cover, with both settled positions plotted">
      <rect x={PAD.l} y={PAD.t} width={pw} height={ph} className="pa-bg" />
      {[-0.005, 0, 0.01, 0.02, 0.03].map((t) => (
        <g key={t}>
          <line x1={sx(t)} y1={PAD.t} x2={sx(t)} y2={PAD.t + ph} className="pa-grid" />
          <text x={sx(t)} y={PAD.t + ph + 22} className="pa-axis" textAnchor="middle">
            {t === 0 ? "0" : `${fmtPct(Math.abs(t * 100))}%`}
          </text>
        </g>
      ))}
      <line x1={PAD.l} y1={zeroY} x2={PAD.l + pw} y2={zeroY} className="pa-datum" />
      <text x={PAD.l - 10} y={zeroY + 4} className="pa-axis" textAnchor="end">0</text>
      <line x1={strikeX} y1={PAD.t} x2={strikeX} y2={PAD.t + ph} className="pa-strike" />

      {positions.map((p, i) => {
        const cls = p.outcome === "Won" ? "won" : "lost";
        const upEnd = netAt(p, -1e-9), downStart = netAt(p, 1e-9);
        const floor = PAD.t + ph;
        return (
          <g key={p.label} className={`pa-series s${i}`}>
            <polygon className={`pa-fill ${cls}`} points={[
              `${sx(X.min)},${floor}`, `${sx(X.min)},${sy(netAt(p, X.min))}`,
              `${strikeX},${sy(upEnd)}`, `${strikeX},${sy(downStart)}`,
              `${sx(X.max)},${sy(netAt(p, X.max))}`, `${sx(X.max)},${floor}`,
            ].join(" ")} />
            <line pathLength={1} x1={sx(X.min)} y1={sy(netAt(p, X.min))} x2={strikeX} y2={sy(upEnd)}
              className={`pa-line ${cls}`} />
            <line pathLength={1} x1={strikeX} y1={sy(downStart)} x2={sx(X.max)} y2={sy(netAt(p, X.max))}
              className={`pa-line ${cls}`} />
            {/* the step: drawn first, because it is the thesis */}
            <line pathLength={1} x1={strikeX} y1={sy(upEnd)} x2={strikeX} y2={sy(downStart)}
              className={`pa-riser ${cls}`} />
            <circle cx={sx(p.breakEven)} cy={zeroY} r={4.5} className={`pa-be ${cls}`} />
            {p.moveDown !== null && p.netTotal !== null && (
              <circle cx={sx(p.moveDown)} cy={sy(p.netTotal)} r={6} className={`pa-pt ${cls}`} />
            )}
            <text x={PAD.l + pw + 12} y={sy(netAt(p, X.max)) + 4} className={`pa-label ${cls}`}>
              {p.label} &middot; {p.achievedBps} bps
            </text>
          </g>
        );
      })}

      <text x={strikeX} y={PAD.t + ph + 42} className="pa-strikelabel" textAnchor="middle">
        strike &middot; the window&rsquo;s open
      </text>
      <text x={sx(-0.004)} y={PAD.t + 16} className="pa-region" textAnchor="middle">price rose</text>
      <text x={sx(0.019)} y={PAD.t + 16} className="pa-region" textAnchor="middle">price fell</text>
      <text x={PAD.l + pw / 2} y={H - 8} className="pa-axis" textAnchor="middle">
        how far the window moved from its open
      </text>
    </svg>
  );
}

/** Whole numbers stay whole; a half-percent tick must not round to one. */
function fmtPct(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** Net across spot + cover. x is the fractional move; positive = price fell. */
function netAt(p: Position, x: number): number {
  const qty = Number(p.quantity) / 1e6;
  const premium = Number(p.premium) / 1e6;
  return -p.exposureAtOpen * x + (x > 0 ? qty : 0) - premium;
}
