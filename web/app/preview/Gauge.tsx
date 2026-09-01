import type { LiveWindow } from "@/lib/chain";

/**
 * The load-line gauge, geometry only.
 *
 * Both design directions render this. Colour lives entirely in each direction's stylesheet,
 * keyed off these class names, so the two can look nothing alike without the measurement
 * logic being written twice -- and so the two fixes baked in here are inherited by both:
 * a left gutter wide enough that mark labels never clip, and a nudge-with-leader when the
 * live price sits within 20 units of the strike instead of overprinting it.
 */

const TOP = -0.008;
const BOTTOM = 0.034;

export function WideGauge({ w }: { w: LiveWindow }) {
  const W = 1180, H = 372;
  const PAD = { l: 300, r: 196, t: 30, b: 30 };
  const GW = W - PAD.l - PAD.r, GH = H - PAD.t - PAD.b;
  const y = (f: number) => PAD.t + ((f - TOP) / (BOTTOM - TOP)) * GH;
  const strikeY = y(0), loadY = y(w.makeWholeBps / 10_000);
  const fall = w.moveDown;
  const nowY = fall === null ? null : y(Math.max(TOP, Math.min(BOTTOM, fall)));
  const beyond = fall !== null && fall > w.makeWholeBps / 10_000;
  const crowded = nowY !== null && Math.abs(nowY - strikeY) < 20;
  const nowTextY = crowded ? (nowY! < strikeY ? nowY! - 24 : nowY! + 34) : nowY!;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="gg wide" role="img"
      aria-label={`Load-line gauge for the current ${w.asset} window. Strike ${w.strike.toFixed(2)}, covered down to ${w.loadPrice.toFixed(2)}.`}>
      <defs>
        <linearGradient id="ggBand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="gg-band-a" />
          <stop offset="100%" className="gg-band-b" />
        </linearGradient>
      </defs>

      <rect x={PAD.l} y={PAD.t} width={GW} height={GH} className="g-col" />
      <rect x={PAD.l} y={strikeY} width={GW} height={Math.max(0, loadY - strikeY)} className="g-band" />
      {[0.005, 0.01, 0.015, 0.02, 0.025, 0.03].map((f) => (
        <g key={f}>
          <line x1={PAD.l} y1={y(f)} x2={PAD.l + GW} y2={y(f)} className="g-grad" />
          <text x={PAD.l + 10} y={y(f) - 6} className="g-gradlabel">{(f * 100).toFixed(1)}%</text>
        </g>
      ))}
      {nowY !== null && nowY > strikeY && (
        <rect x={PAD.l} y={strikeY} width={GW} height={nowY - strikeY}
          className={beyond ? "g-water beyond" : "g-water"} />
      )}

      <line x1={PAD.l - 26} y1={strikeY} x2={PAD.l + GW + 26} y2={strikeY} className="g-strike" />
      <text x={PAD.l - 36} y={strikeY - 9} className="g-label" textAnchor="end">strike &middot; the window&rsquo;s open</text>
      <text x={PAD.l - 36} y={strikeY + 18} className="g-value" textAnchor="end">{w.strike.toFixed(2)}</text>

      <line x1={PAD.l - 26} y1={loadY} x2={PAD.l + GW + 26} y2={loadY} className="g-load-halo" />
      <line x1={PAD.l - 26} y1={loadY} x2={PAD.l + GW + 26} y2={loadY} className="g-load" />
      <text x={PAD.l - 36} y={loadY - 9} className="g-label" textAnchor="end">load line &middot; covered down to here</text>
      <text x={PAD.l - 36} y={loadY + 18} className="g-value lit" textAnchor="end">{w.loadPrice.toFixed(2)}</text>
      <text x={PAD.l + GW + 34} y={loadY + 5} className="g-bps">&minus;{(w.makeWholeBps / 100).toFixed(2)}%</text>

      {nowY !== null && (
        <>
          <line x1={PAD.l} y1={nowY} x2={PAD.l + GW} y2={nowY} className={beyond ? "g-now beyond" : "g-now"} />
          <polygon points={`${PAD.l + GW},${nowY} ${PAD.l + GW + 12},${nowY - 6} ${PAD.l + GW + 12},${nowY + 6}`}
            className={beyond ? "g-arrow beyond" : "g-arrow"} />
          {crowded && <line x1={PAD.l + GW + 12} y1={nowY} x2={PAD.l + GW + 30} y2={nowTextY - 7} className="g-leader" />}
          <text x={PAD.l + GW + 34} y={nowTextY - 8} className="g-label">now</text>
          <text x={PAD.l + GW + 34} y={nowTextY + 15} className="g-value">{w.now!.toFixed(2)}</text>
        </>
      )}
      {crowded && w.now !== null && (
        <text x={PAD.l + GW / 2} y={strikeY - 11} className="g-hint" textAnchor="middle">sitting at the strike</text>
      )}
    </svg>
  );
}

/** Phones. Marks read left, the live price reads right, so nothing shares a gutter and
 *  nothing can collide or run off the edge. */
export function NarrowGauge({ w }: { w: LiveWindow }) {
  const NW = 420, NH = 320;
  const P = { l: 12, r: 12, t: 34, b: 26 };
  const gw = NW - P.l - P.r, gh = NH - P.t - P.b;
  const y = (f: number) => P.t + ((f - TOP) / (BOTTOM - TOP)) * gh;
  const strikeY = y(0), loadY = y(w.makeWholeBps / 10_000);
  const fall = w.moveDown;
  const nowY = fall === null ? null : y(Math.max(TOP, Math.min(BOTTOM, fall)));
  const beyond = fall !== null && fall > w.makeWholeBps / 10_000;

  return (
    <svg viewBox={`0 0 ${NW} ${NH}`} className="gg narrow" role="img"
      aria-label={`Load-line gauge for the current ${w.asset} window. Strike ${w.strike.toFixed(2)}, covered down to ${w.loadPrice.toFixed(2)}.`}>
      <rect x={P.l} y={P.t} width={gw} height={gh} className="g-col" />
      <rect x={P.l} y={strikeY} width={gw} height={Math.max(0, loadY - strikeY)} className="g-band" />
      {[0.01, 0.02, 0.03].map((f) => <line key={f} x1={P.l} y1={y(f)} x2={P.l + gw} y2={y(f)} className="g-grad" />)}
      {nowY !== null && nowY > strikeY && (
        <rect x={P.l} y={strikeY} width={gw} height={nowY - strikeY} className={beyond ? "g-water beyond" : "g-water"} />
      )}

      <line x1={P.l} y1={strikeY} x2={P.l + gw} y2={strikeY} className="g-strike" />
      <text x={P.l + 10} y={strikeY - 8} className="g-label nlab">strike &middot; the open</text>
      <text x={P.l + 10} y={strikeY + 24} className="g-value nval">{w.strike.toFixed(2)}</text>

      <line x1={P.l} y1={loadY} x2={P.l + gw} y2={loadY} className="g-load-halo" />
      <line x1={P.l} y1={loadY} x2={P.l + gw} y2={loadY} className="g-load" />
      <text x={P.l + 10} y={loadY - 8} className="g-label nlab">load line &middot; covered to here</text>
      <text x={P.l + 10} y={loadY + 24} className="g-value nval lit">{w.loadPrice.toFixed(2)}</text>
      <text x={P.l + gw - 10} y={loadY - 8} className="g-bps nbps" textAnchor="end">&minus;{(w.makeWholeBps / 100).toFixed(2)}%</text>

      {nowY !== null && (
        <>
          <line x1={P.l} y1={nowY} x2={P.l + gw} y2={nowY} className={beyond ? "g-now beyond" : "g-now"} />
          <text x={P.l + gw - 10} y={nowY - 22} className="g-label nlab" textAnchor="end">now</text>
          <text x={P.l + gw - 10} y={nowY - 4} className="g-value nval" textAnchor="end">{w.now!.toFixed(2)}</text>
        </>
      )}
    </svg>
  );
}

export function fmtLeft(s: number) {
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
