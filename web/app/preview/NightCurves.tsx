import type { Position } from "@/lib/chain";

/**
 * The payoff, redrawn for the bridge and at the size of an argument rather than a footnote.
 *
 * Unchanged from the light version in every way that matters: three regions, no flat net line
 * anywhere, the step at the strike drawn solid because it is the thesis, and the break-even
 * marked because that — not the step — is what the dial moves. What is new is a 20% fill under
 * each curve, which on a dark ground is what separates the two positions at a glance.
 */

type Box = { w: number; h: number; l: number; r: number; t: number; b: number };

const MAIN: Box = { w: 1180, h: 560, l: 96, r: 168, t: 44, b: 84 };
const INSET: Box = { w: 520, h: 380, l: 84, r: 30, t: 44, b: 78 };

const MAIN_X = { min: -0.008, max: 0.03 };
const INSET_X = { min: -0.0012, max: 0.0012 };

export default function NightCurves({ positions }: { positions: Position[] }) {
  return (
    <figure className="nc-fig">
      <div className="nc-row">
        <Chart positions={positions} box={MAIN} range={MAIN_X} variant="main" />
        <Chart positions={positions} box={INSET} range={INSET_X} variant="inset" />
      </div>
      <figcaption className="nc-cap">
        Two settled positions, both real, on opposite sides of the same payoff. The step at the
        strike is the payout landing; it is pinned there because the strike is the window&rsquo;s
        opening price and cannot be moved. What the dial sets is the <strong>break-even</strong>,
        marked on each curve.
      </figcaption>
    </figure>
  );
}

function Chart({ positions, box, range, variant }: {
  positions: Position[]; box: Box; range: { min: number; max: number }; variant: "main" | "inset";
}) {
  const pw = box.w - box.l - box.r;
  const ph = box.h - box.t - box.b;
  const inset = variant === "inset";

  const ys: number[] = [];
  for (const p of positions) {
    ys.push(netAt(p, range.min), netAt(p, range.max), netAt(p, 1e-9), netAt(p, -1e-9));
    if (p.netTotal !== null) ys.push(p.netTotal);
  }
  const hi = Math.max(...ys, 10) * 1.14;
  const lo = Math.min(...ys, -10) * 1.14;

  const sx = (x: number) => box.l + ((x - range.min) / (range.max - range.min)) * pw;
  const sy = (y: number) => box.t + ph - ((y - lo) / (hi - lo)) * ph;
  const zeroY = sy(0);
  const strikeX = sx(0);
  const ticks = inset ? [-0.001, 0, 0.001] : [-0.005, 0, 0.01, 0.02, 0.03];

  return (
    <svg viewBox={`0 0 ${box.w} ${box.h}`} role="img" className={`nc-svg ${variant}`}
      aria-label={inset
        ? "The same payoff magnified to the scale the two windows actually moved"
        : "Payoff of parametric cover, with two settled positions plotted"}>
      <rect x={box.l} y={box.t} width={pw} height={ph} className="plotbg" />
      <rect x={strikeX} y={box.t} width={box.l + pw - strikeX} height={ph} className="region-fell" />

      {ticks.map((t) => (
        <g key={t}>
          <line x1={sx(t)} y1={box.t} x2={sx(t)} y2={box.t + ph} className="grid" />
          <text x={sx(t)} y={box.t + ph + 26} className="axis" textAnchor="middle">
            {t === 0 ? "0" : `${Math.abs(t * 100).toFixed(inset ? 1 : 0)}%`}
          </text>
        </g>
      ))}

      <line x1={box.l} y1={zeroY} x2={box.l + pw} y2={zeroY} className="datum" />
      <text x={box.l - 12} y={zeroY + 5} className="axis" textAnchor="end">0</text>
      {!inset && (
        <>
          <text x={box.l - 12} y={sy(hi * 0.72) + 5} className="axis" textAnchor="end">+{Math.round(hi * 0.72)}</text>
          <text x={box.l - 12} y={sy(lo * 0.72) + 5} className="axis" textAnchor="end">&minus;{Math.abs(Math.round(lo * 0.72))}</text>
        </>
      )}

      <line x1={strikeX} y1={box.t} x2={strikeX} y2={box.t + ph} className="strike" />

      {positions.map((p) => {
        const cls = p.outcome === "Won" ? "won" : "lost";
        const upEnd = netAt(p, -1e-9);
        const downStart = netAt(p, 1e-9);
        const yMin = box.t + ph;
        return (
          <g key={p.label}>
            {/* 20% fill under each curve, clipped to the plot floor. */}
            <polygon className={`nc-fill ${cls}`} points={[
              `${sx(range.min)},${yMin}`,
              `${sx(range.min)},${sy(netAt(p, range.min))}`,
              `${strikeX},${sy(upEnd)}`,
              `${strikeX},${sy(downStart)}`,
              `${sx(range.max)},${sy(netAt(p, range.max))}`,
              `${sx(range.max)},${yMin}`,
            ].join(" ")} />
            <line x1={sx(range.min)} y1={sy(netAt(p, range.min))} x2={strikeX} y2={sy(upEnd)} className={`nc-line ${cls}`} />
            <line x1={strikeX} y1={sy(downStart)} x2={sx(range.max)} y2={sy(netAt(p, range.max))} className={`nc-line ${cls}`} />
            <line x1={strikeX} y1={sy(upEnd)} x2={strikeX} y2={sy(downStart)} className={`nc-riser ${cls}`} />
            <polygon points={`${strikeX - 5},${sy(downStart) + 11} ${strikeX + 5},${sy(downStart) + 11} ${strikeX},${sy(downStart) + 1}`}
              className={`nc-head ${cls}`} />
            {!inset && <circle cx={sx(p.breakEven)} cy={zeroY} r={5} className={`nc-be ${cls}`} />}
            {p.moveDown !== null && p.netTotal !== null && (
              <>
                <circle cx={sx(p.moveDown)} cy={sy(p.netTotal)} r={inset ? 7 : 6} className={`nc-pt ${cls}`} />
                {inset && (
                  <text x={sx(p.moveDown) + 14} y={sy(p.netTotal) + 5} className={`nc-ptlabel ${cls}`}>{p.label}</text>
                )}
              </>
            )}
          </g>
        );
      })}

      {!inset && (
        <>
          <text x={strikeX} y={box.t + ph + 50} className="nc-strikelabel" textAnchor="middle">strike &middot; the window&rsquo;s open</text>
          <text x={sx(-0.004)} y={box.t + 20} className="nc-region" textAnchor="middle">price rose</text>
          <text x={sx(0.019)} y={box.t + 20} className="nc-region" textAnchor="middle">price fell</text>
          <text x={strikeX + 14} y={box.t + ph - 14} className="nc-riserlabel">the payout lands here</text>
          {positions.map((p) => (
            <text key={p.label} x={box.l + pw + 12} y={sy(netAt(p, MAIN_X.max)) + 5}
              className={`nc-series ${p.outcome === "Won" ? "won" : "lost"}`}>
              {p.label} &middot; {p.achievedBps} bps
            </text>
          ))}
          <text x={box.l + pw / 2} y={box.h - 12} className="axistitle" textAnchor="middle">how far the window moved from its open</text>
          <text x={20} y={box.t + ph / 2} className="axistitle" textAnchor="middle"
            transform={`rotate(-90 20 ${box.t + ph / 2})`}>net with spot, tUSDC</text>
        </>
      )}

      {inset && (
        <>
          <text x={box.l + pw / 2} y={box.t - 16} className="nc-insettitle" textAnchor="middle">magnified to what actually happened</text>
          <text x={sx(-0.0006)} y={box.t + ph + 50} className="nc-region" textAnchor="middle">rose</text>
          <text x={sx(0.0006)} y={box.t + ph + 50} className="nc-region" textAnchor="middle">fell</text>
          {positions.map((p) => (
            <text key={p.label} x={sx(p.moveDown ?? 0)} y={p.outcome === "Won" ? box.t + 20 : box.t + ph - 8}
              className={`nc-note ${p.outcome === "Won" ? "won" : "lost"}`} textAnchor="middle">
              {p.label} {p.outcome === "Won" ? "fell" : "rose"} {Math.abs((p.moveDown ?? 0) * 100).toFixed(3)}%
            </text>
          ))}
        </>
      )}
    </svg>
  );
}

function netAt(p: Position, x: number): number {
  const qty = Number(p.quantity) / 1e6;
  const premium = Number(p.premium) / 1e6;
  const payout = x > 0 ? qty : 0;
  return -p.exposureAtOpen * x + payout - premium;
}
