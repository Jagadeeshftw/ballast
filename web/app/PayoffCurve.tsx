import type { Position } from "@/lib/chain";

/**
 * The three-region payoff of parametric cover, with both settled positions plotted.
 *
 * There is no flat net line anywhere and there cannot be: an at-the-money binary pays a
 * fixed amount on a trigger, so the step at the strike is pinned. The dial moves the
 * break-even, not the step.
 *
 * Inline SVG, no JavaScript — identical with scripting disabled.
 */

type Box = { w: number; h: number; l: number; r: number; t: number; b: number };

const MAIN: Box = { w: 880, h: 400, l: 78, r: 130, t: 34, b: 62 };
const INSET: Box = { w: 340, h: 250, l: 62, r: 22, t: 30, b: 56 };

/** Main view. x is the fractional move; negative = price rose, positive = price fell. */
const MAIN_X = { min: -0.008, max: 0.03 };
/** The realised scale. Both settled windows moved less than a tenth of a percent, so at the
 *  main scale they sit on top of the origin — D3. */
const INSET_X = { min: -0.0012, max: 0.0012 };

export default function PayoffCurve({ positions }: { positions: Position[] }) {
  return (
    <figure className="hero">
      <div className="chartrow">
        <Chart positions={positions} box={MAIN} range={MAIN_X} variant="main" />
        <Chart positions={positions} box={INSET} range={INSET_X} variant="inset" />
      </div>
      <figcaption>
        Two settled positions, both real, on opposite sides of the same payoff. The step at
        the strike is the payout landing; it is pinned there because the strike is the
        window&rsquo;s opening price and cannot be moved. What the dial sets is the{" "}
        <strong>break-even</strong>, marked on each curve.
      </figcaption>
    </figure>
  );
}

function Chart({
  positions,
  box,
  range,
  variant,
}: {
  positions: Position[];
  box: Box;
  range: { min: number; max: number };
  variant: "main" | "inset";
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

  // D4: unsigned percentages, with the direction said in words either side of the strike.
  const ticks = inset ? [-0.001, 0, 0.001] : [-0.005, 0, 0.01, 0.02, 0.03];

  return (
    <svg
      viewBox={`0 0 ${box.w} ${box.h}`}
      role="img"
      className={`curve ${variant}`}
      aria-label={
        inset
          ? "The same payoff magnified to the scale the two windows actually moved"
          : "Payoff of parametric cover, with two settled positions plotted"
      }
    >
      <rect x={box.l} y={box.t} width={pw} height={ph} className="plotbg" />
      <rect x={strikeX} y={box.t} width={box.l + pw - strikeX} height={ph} className="region-fell" />

      {ticks.map((t) => (
        <g key={t}>
          <line x1={sx(t)} y1={box.t} x2={sx(t)} y2={box.t + ph} className="grid" />
          <text x={sx(t)} y={box.t + ph + 20} className="axis" textAnchor="middle">
            {t === 0 ? "0" : `${Math.abs(t * 100).toFixed(inset ? 1 : 0)}%`}
          </text>
        </g>
      ))}

      <line x1={box.l} y1={zeroY} x2={box.l + pw} y2={zeroY} className="datum" />
      <text x={box.l - 10} y={zeroY + 4} className="axis" textAnchor="end">0</text>
      {!inset && (
        <>
          <text x={box.l - 10} y={sy(hi * 0.72) + 4} className="axis" textAnchor="end">
            +{Math.round(hi * 0.72)}
          </text>
          <text x={box.l - 10} y={sy(lo * 0.72) + 4} className="axis" textAnchor="end">
            −{Math.abs(Math.round(lo * 0.72))}
          </text>
        </>
      )}

      <line x1={strikeX} y1={box.t} x2={strikeX} y2={box.t + ph} className="strike" />

      {positions.map((p) => {
        const cls = p.outcome === "Won" ? "waterline" : "heel";
        const upEnd = netAt(p, -1e-9);
        const downStart = netAt(p, 1e-9);
        return (
          <g key={p.label}>
            <line x1={sx(range.min)} y1={sy(netAt(p, range.min))} x2={strikeX} y2={sy(upEnd)} className={`curveline ${cls}`} />
            <line x1={strikeX} y1={sy(downStart)} x2={sx(range.max)} y2={sy(netAt(p, range.max))} className={`curveline ${cls}`} />
            {/* D2: the step IS the thesis. Draw it, solid, as a riser with an arrow head. */}
            <line x1={strikeX} y1={sy(upEnd)} x2={strikeX} y2={sy(downStart)} className={`riser ${cls}`} />
            <polygon
              points={`${strikeX - 4},${sy(downStart) + 9} ${strikeX + 4},${sy(downStart) + 9} ${strikeX},${sy(downStart) + 1}`}
              className={`riserhead ${cls}`}
            />
            {!inset && (
              <circle cx={sx(p.breakEven)} cy={zeroY} r={4} className={`breakeven ${cls}`} />
            )}
            {p.moveDown !== null && p.netTotal !== null && (
              <>
                <circle cx={sx(p.moveDown)} cy={sy(p.netTotal)} r={inset ? 6 : 5} className={`point ${cls}`} />
                {inset && (
                  <text x={sx(p.moveDown) + 12} y={sy(p.netTotal) + 4} className={`pointlabel ${cls}`}>
                    {p.label}
                  </text>
                )}
              </>
            )}
          </g>
        );
      })}

      {/* D1: labels placed where nothing else is, not stacked on the origin. */}
      {!inset && (
        <>
          <text x={strikeX} y={box.t + ph + 38} className="strike-label" textAnchor="middle">
            strike · the window&rsquo;s open
          </text>
          <text x={sx(-0.004)} y={box.t + 16} className="region-note" textAnchor="middle">
            price rose
          </text>
          <text x={sx(0.019)} y={box.t + 16} className="region-note" textAnchor="middle">
            price fell
          </text>
          <text x={strikeX + 12} y={box.t + ph - 10} className="riser-label">
            the payout lands here
          </text>
          {positions.map((p, i) => (
            <text
              key={p.label}
              x={box.l + pw + 10}
              y={sy(netAt(p, MAIN_X.max)) + 4 + i * 0}
              className={`serieslabel ${p.outcome === "Won" ? "waterline" : "heel"}`}
            >
              {p.label} · {p.achievedBps} bps
            </text>
          ))}
          <text x={box.l + pw / 2} y={box.h - 8} className="axistitle" textAnchor="middle">
            how far the window moved from its open
          </text>
          <text
            x={15}
            y={box.t + ph / 2}
            className="axistitle"
            textAnchor="middle"
            transform={`rotate(-90 15 ${box.t + ph / 2})`}
          >
            net with spot, tUSDC
          </text>
        </>
      )}

      {inset && (
        <>
          <text x={box.l + pw / 2} y={box.t - 12} className="insettitle" textAnchor="middle">
            magnified to what actually happened
          </text>
          <text x={sx(-0.0006)} y={box.t + ph + 38} className="region-note" textAnchor="middle">
            rose
          </text>
          <text x={sx(0.0006)} y={box.t + ph + 38} className="region-note" textAnchor="middle">
            fell
          </text>
          {positions.map((p) => (
            <text
              key={p.label}
              x={sx(p.moveDown ?? 0)}
              y={p.outcome === "Won" ? box.t + 16 : box.t + ph - 6}
              className={`insetnote ${p.outcome === "Won" ? "waterline" : "heel"}`}
              textAnchor="middle"
            >
              {p.label} {p.outcome === "Won" ? "fell" : "rose"}{" "}
              {Math.abs((p.moveDown ?? 0) * 100).toFixed(3)}%
            </text>
          ))}
        </>
      )}
    </svg>
  );
}

/** Net across spot + cover. x is the fractional move; positive = price fell. */
function netAt(p: Position, x: number): number {
  const qty = Number(p.quantity) / 1e6;
  const premium = Number(p.premium) / 1e6;
  const payout = x > 0 ? qty : 0;
  return -p.exposureAtOpen * x + payout - premium;
}
