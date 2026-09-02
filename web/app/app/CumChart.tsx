import type { CumPoint } from "@/lib/portfolio";

/**
 * Cumulative net across settled positions.
 *
 * A step line, not a smoothed curve: the money moves at a settlement and is flat between
 * them, and interpolating would draw a trend that did not happen. Zero is marked, because
 * where the line crosses it is the only thing most readers want from this chart.
 *
 * Inline SVG, no JavaScript — identical with scripting disabled.
 */
const W = 900, H = 300;
const PAD = { l: 62, r: 22, t: 22, b: 40 };

export default function CumChart({ points }: { points: CumPoint[] }) {
  if (points.length < 2) return null;
  const pw = W - PAD.l - PAD.r, ph = H - PAD.t - PAD.b;

  const nets = points.map((p) => p.net);
  const hi = Math.max(...nets, 0), lo = Math.min(...nets, 0);
  const pad = (hi - lo) * 0.12 || 10;
  const top = hi + pad, bot = lo - pad;

  const sx = (i: number) => PAD.l + (i / (points.length - 1)) * pw;
  const sy = (v: number) => PAD.t + ph - ((v - bot) / (top - bot)) * ph;
  const zeroY = sy(0);

  // Step: hold the previous level to the next settlement, then move.
  const d: string[] = [`M ${sx(0)} ${sy(0)}`];
  points.forEach((p, i) => { d.push(`L ${sx(i)} ${sy(i === 0 ? 0 : points[i - 1].net)}`, `L ${sx(i)} ${sy(p.net)}`); });
  const line = d.join(" ");
  const area = `${line} L ${sx(points.length - 1)} ${zeroY} L ${sx(0)} ${zeroY} Z`;
  const end = points[points.length - 1].net;
  const up = end >= 0;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="cum" role="img"
      aria-label={`Cumulative net across ${points.length} settled positions, ending at ${end.toFixed(2)} tUSDC`}>
      <rect x={PAD.l} y={PAD.t} width={pw} height={ph} className="cumBg" />
      {[top, (top + bot) / 2, bot].map((v) => (
        <g key={v}>
          <line x1={PAD.l} y1={sy(v)} x2={PAD.l + pw} y2={sy(v)} className="cumGrid" />
          <text x={PAD.l - 10} y={sy(v) + 4} className="cumAxis" textAnchor="end">{Math.round(v)}</text>
        </g>
      ))}
      <line x1={PAD.l} y1={zeroY} x2={PAD.l + pw} y2={zeroY} className="cumZero" />
      <text x={PAD.l - 10} y={zeroY + 4} className="cumAxis" textAnchor="end">0</text>

      <path d={area} className={`cumArea ${up ? "up" : "down"}`} />
      <path d={line} className={`cumLine ${up ? "up" : "down"}`} fill="none" />

      {points.map((p, i) => (
        <circle key={i} cx={sx(i)} cy={sy(p.net)} r={2.6}
          className={`cumDot ${p.outcome === "Won" ? "won" : "lost"}`} />
      ))}

      <text x={PAD.l} y={H - 12} className="cumAxis">first settlement</text>
      <text x={PAD.l + pw} y={H - 12} className="cumAxis" textAnchor="end">most recent</text>
      <text x={sx(points.length - 1) - 6} y={sy(end) - 10} textAnchor="end"
        className={`cumEnd ${up ? "up" : "down"}`}>
        {up ? "+" : "−"}{Math.abs(end).toFixed(2)} tUSDC
      </text>
    </svg>
  );
}
