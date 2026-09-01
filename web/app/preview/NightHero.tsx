import type { LiveWindow } from "@/lib/chain";

/**
 * The bridge's main instrument, full-bleed.
 *
 * Same Plimsoll geometry as the live gauge — the strike engraved as a lit rule, the load line
 * glowing, water filling downward from the strike as the price falls away from it — but sized
 * to lead the page rather than to sit inside a column. The countdown runs at 96px beside it.
 *
 * The two placement fixes from the light version are carried over deliberately: the left pad
 * is wide enough that mark labels never clip, and when the price sits within 20px of the
 * strike the readout is nudged clear on a leader line instead of overprinting it.
 */

const W = 1180;
const H = 372;
const PAD = { l: 300, r: 196, t: 30, b: 30 };
const GW = W - PAD.l - PAD.r;
const GH = H - PAD.t - PAD.b;

const TOP = -0.008;
const BOTTOM = 0.034;

export default function NightHero({ w }: { w: LiveWindow | null }) {
  if (!w) {
    return (
      <div className="hero-bleed">
        <div className="hero-inner"><div className="hero-empty">
          <p className="big">No window is queued right now.</p>
          <p className="silt-text">
            The engine reacts when dreamDEX rolls the next one. Windows run every 60 seconds on
            the short series, so this fills within about a minute.
          </p>
        </div>
      </div></div>
    );
  }

  const y = (fall: number) => PAD.t + ((fall - TOP) / (BOTTOM - TOP)) * GH;
  const strikeY = y(0);
  const loadY = y(w.makeWholeBps / 10_000);
  const fall = w.moveDown;
  const nowY = fall === null ? null : y(Math.max(TOP, Math.min(BOTTOM, fall)));

  const beyond = fall !== null && fall > w.makeWholeBps / 10_000;
  const priceKnown = w.now !== null;
  const crowded = nowY !== null && Math.abs(nowY - strikeY) < 20;
  const nowTextY = crowded ? (nowY! < strikeY ? nowY! - 24 : nowY! + 34) : nowY!;

  return (
    <div className="hero-bleed">
      <div className="hero-inner">
      <div className="hero-grid">
        <svg viewBox={`0 0 ${W} ${H}`} className="hero-svg wide" role="img"
          aria-label={`Load-line gauge for the current ${w.asset} window. Strike ${w.strike.toFixed(2)}, covered down to ${w.loadPrice.toFixed(2)}.`}>
          <defs>
            {/* The covered band is a fade, not a flat fill: strongest at the strike, gone by
                the load line, so the eye reads depth rather than a coloured rectangle. */}
            <linearGradient id="coveredFade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2FBFA3" stopOpacity="0.20" />
              <stop offset="100%" stopColor="#2FBFA3" stopOpacity="0" />
            </linearGradient>
          </defs>

          <rect x={PAD.l} y={PAD.t} width={GW} height={GH} className="g-col" />
          <rect x={PAD.l} y={strikeY} width={GW} height={Math.max(0, loadY - strikeY)} className="g-band" />

          {/* Graduations. An instrument face is read against its scale, not against a void. */}
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

          {/* strike — engraved as a lit rule */}
          <line x1={PAD.l - 26} y1={strikeY} x2={PAD.l + GW + 26} y2={strikeY} className="g-strike" />
          <text x={PAD.l - 36} y={strikeY - 9} className="g-label" textAnchor="end">strike &middot; the window&rsquo;s open</text>
          <text x={PAD.l - 36} y={strikeY + 18} className="g-value" textAnchor="end">{w.strike.toFixed(2)}</text>

          {/* the load line, glowing */}
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
              {crowded && (
                <line x1={PAD.l + GW + 12} y1={nowY} x2={PAD.l + GW + 30} y2={nowTextY - 7} className="g-leader" />
              )}
              <text x={PAD.l + GW + 34} y={nowTextY - 8} className="g-label">now</text>
              <text x={PAD.l + GW + 34} y={nowTextY + 15} className="g-value">{w.now!.toFixed(2)}</text>
            </>
          )}

          {!priceKnown && (
            <text x={PAD.l + GW / 2} y={PAD.t + GH / 2} className="g-label" textAnchor="middle">
              spot book unpriceable
            </text>
          )}
          {crowded && priceKnown && (
            <text x={PAD.l + GW / 2} y={strikeY - 11} className="g-hint" textAnchor="middle">
              sitting at the strike
            </text>
          )}
        </svg>

        <NarrowGauge w={w} />

        <div className="hero-count">
          <p className="hc-asset">{w.asset} &middot; {w.intervalLabel}</p>
          <p className="hc-label">{w.secondsLeft > 0 ? "closes in" : "closed"}</p>
          <p className={`hc-big ${w.secondsLeft > 0 ? "" : "hc-word"}`}>{w.secondsLeft > 0 ? fmtLeft(w.secondsLeft) : "settling"}</p>
          <p className="hc-sub">{w.secondsLeft > 0 ? "until it settles" : "awaiting settlement"}</p>
          <p className={`hc-moved ${fall === null ? "" : fall > 0 ? "heel-num" : "waterline-num"}`}>
            {fall === null ? "move unknown" : `${Math.abs(fall * 100).toFixed(3)}% ${fall > 0 ? "down" : "up"}`}
          </p>
        </div>
      </div>

      <p className="hero-note">
        {beyond
          ? "Past the load line: the payout no longer covers the whole fall. The instrument says so rather than claiming otherwise."
          : "Inside the load line. A fall to the mark is fully covered; beyond it, the fixed payout stops keeping pace."}
      </p>
      </div>
    </div>
  );
}


/** Narrow geometry for phones. Same instrument, same marks, but labels sit above their rule
 *  inside the column instead of to the left of it, because at 375px there is no room for a
 *  300-unit label gutter without clipping -- and clipped labels are the defect we already
 *  fixed once. */
function NarrowGauge({ w }: { w: LiveWindow }) {
  const NW = 420, NH = 320;
  const P = { l: 12, r: 12, t: 34, b: 26 };
  const gw = NW - P.l - P.r, gh = NH - P.t - P.b;
  const y = (fall: number) => P.t + ((fall - TOP) / (BOTTOM - TOP)) * gh;
  const strikeY = y(0);
  const loadY = y(w.makeWholeBps / 10_000);
  const fall = w.moveDown;
  const nowY = fall === null ? null : y(Math.max(TOP, Math.min(BOTTOM, fall)));
  const beyond = fall !== null && fall > w.makeWholeBps / 10_000;

  return (
    <svg viewBox={`0 0 ${NW} ${NH}`} className="hero-svg narrow" role="img"
      aria-label={`Load-line gauge for the current ${w.asset} window. Strike ${w.strike.toFixed(2)}, covered down to ${w.loadPrice.toFixed(2)}.`}>
      <rect x={P.l} y={P.t} width={gw} height={gh} className="g-col" />
      <rect x={P.l} y={strikeY} width={gw} height={Math.max(0, loadY - strikeY)} className="g-band" />
      {nowY !== null && nowY > strikeY && (
        <rect x={P.l} y={strikeY} width={gw} height={nowY - strikeY} className={beyond ? "g-water beyond" : "g-water"} />
      )}
      {[0.01, 0.02, 0.03].map((f) => (
        <line key={f} x1={P.l} y1={y(f)} x2={P.l + gw} y2={y(f)} className="g-grad" />
      ))}

      {/* Marks read left, the live price reads right. Nothing shares a gutter, so nothing can
          collide or run off the edge the way a right-hand value column did. */}
      <line x1={P.l} y1={strikeY} x2={P.l + gw} y2={strikeY} className="g-strike" />
      <text x={P.l + 10} y={strikeY - 8} className="g-label nlab">strike &middot; the open</text>
      <text x={P.l + 10} y={strikeY + 24} className="g-value nval">{w.strike.toFixed(2)}</text>

      <line x1={P.l} y1={loadY} x2={P.l + gw} y2={loadY} className="g-load-halo" />
      <line x1={P.l} y1={loadY} x2={P.l + gw} y2={loadY} className="g-load" />
      <text x={P.l + 10} y={loadY - 8} className="g-label nlab">load line &middot; covered to here</text>
      <text x={P.l + 10} y={loadY + 24} className="g-value nval lit">{w.loadPrice.toFixed(2)}</text>
      <text x={P.l + gw - 10} y={loadY - 8} className="g-bps nbps" textAnchor="end">
        &minus;{(w.makeWholeBps / 100).toFixed(2)}%
      </text>

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

function fmtLeft(s: number) {
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
