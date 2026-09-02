import type { CumPoint } from "@/lib/portfolio";

/**
 * Cumulative net across settled positions.
 *
 * A step line, not a smoothed curve: money moves at a settlement and is flat between them, so
 * interpolating would draw a trend that never happened. Inline SVG with no JavaScript, so it
 * is identical with scripting disabled.
 */
const W = 640, H = 220, PAD = { l: 8, r: 8, t: 18, b: 14 };

export default function CumulativeNet({ points }: { points: CumPoint[] }) {
  if (points.length < 2) return null;
  const pw = W - PAD.l - PAD.r, ph = H - PAD.t - PAD.b;
  const nets = points.map((p) => p.net);
  const hi = Math.max(...nets, 0), lo = Math.min(...nets, 0);
  const pad = (hi - lo) * 0.14 || 10;
  const top = hi + pad, bot = lo - pad;
  const sx = (i: number) => PAD.l + (i / (points.length - 1)) * pw;
  const sy = (v: number) => PAD.t + ph - ((v - bot) / (top - bot)) * ph;
  const zero = sy(0);

  const d: string[] = [`M ${sx(0)} ${sy(0)}`];
  points.forEach((p, i) => {
    d.push(`L ${sx(i)} ${sy(i === 0 ? 0 : points[i - 1].net)}`, `L ${sx(i)} ${sy(p.net)}`);
  });
  const line = d.join(" ");
  const end = points[points.length - 1].net;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img"
      aria-label={`Cumulative net across ${points.length} settled positions, ending at ${end.toFixed(2)} tUSDC`}>
      <line x1={PAD.l} y1={zero} x2={W - PAD.r} y2={zero} stroke="#9A9384" strokeWidth="1" strokeDasharray="4 4" opacity=".7" />
      <path d={`${line} L ${sx(points.length - 1)} ${zero} L ${sx(0)} ${zero} Z`} fill="#6FB98F" opacity=".13" />
      <path d={line} fill="none" stroke="#6FB98F" strokeWidth="2" />
      {points.map((p, i) => (
        <circle key={i} cx={sx(i)} cy={sy(p.net)} r="2.4" fill={p.outcome === "Won" ? "#6FB98F" : "#D1674F"} />
      ))}
      <text x={W - PAD.r} y={sy(end) - 10} textAnchor="end" fill="#6FB98F"
        fontSize="15" fontWeight="600" fontFamily="var(--font-plex-mono), monospace">
        +{end.toFixed(2)} tUSDC
      </text>
    </svg>
  );
}
