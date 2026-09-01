import type { LiveWindow } from "@/lib/chain";

/**
 * The load-line gauge: a Plimsoll mark for a cover position.
 *
 * A load line is painted on a hull to show how deep the ship may safely sit. A make-whole
 * point is the same statement about a window: down to here, you are fine. The strike is
 * engraved at the top as the reference the venue actually settles against; the water fills
 * downward as the price falls away from it.
 */

const W = 840;
const H = 280;
/** Generous left margin: the mark labels live there and must never clip. */
const PAD = { l: 214, r: 150, t: 26, b: 26 };
const GW = W - PAD.l - PAD.r;
const GH = H - PAD.t - PAD.b;

/** Fractional fall shown. Negative is above the strike — the price rose. */
const TOP = -0.008;
const BOTTOM = 0.034;

export default function LoadLine({ w }: { w: LiveWindow | null }) {
  if (!w) {
    return (
      <div className="gauge-empty">
        <p>No window is queued right now.</p>
        <p className="silt-text">
          The engine reacts when dreamDEX rolls the next one. Windows run every 60 seconds
          on the short series.
        </p>
      </div>
    );
  }

  const y = (fall: number) => PAD.t + ((fall - TOP) / (BOTTOM - TOP)) * GH;
  const strikeY = y(0);
  const loadY = y(w.makeWholeBps / 10_000);
  const fall = w.moveDown;
  const nowY = fall === null ? null : y(Math.max(TOP, Math.min(BOTTOM, fall)));

  const beyond = fall !== null && fall > w.makeWholeBps / 10_000;
  const priceKnown = w.now !== null;
  /** The strike and the current price are routinely a few hundredths of a percent apart,
   *  which at this scale is the same pixel. Nudge the readout clear rather than overprint. */
  const crowded = nowY !== null && Math.abs(nowY - strikeY) < 20;
  const nowTextY = crowded ? (nowY! < strikeY ? nowY! - 22 : nowY! + 30) : nowY!;

  return (
    <div className="gauge">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" className="gaugesvg"
        aria-label={`Load-line gauge for the current ${w.asset} window. Strike ${w.strike.toFixed(2)}, covered down to ${w.loadPrice.toFixed(2)}.`}>
        {/* the hull column */}
        <rect x={PAD.l} y={PAD.t} width={GW} height={GH} className="hull" />

        {/* covered band: strike down to the load line */}
        <rect x={PAD.l} y={strikeY} width={GW} height={Math.max(0, loadY - strikeY)} className="covered-band" />

        {/* water: fills from the strike down to wherever the price now is */}
        {nowY !== null && nowY > strikeY && (
          <rect x={PAD.l} y={strikeY} width={GW} height={nowY - strikeY}
            className={beyond ? "water beyond" : "water"} />
        )}

        {/* strike — engraved, the reference the venue settles against */}
        <line x1={PAD.l - 22} y1={strikeY} x2={PAD.l + GW + 22} y2={strikeY} className="mark-strike" />
        <text x={PAD.l - 30} y={strikeY - 7} className="mark-label" textAnchor="end">strike &middot; the window&rsquo;s open</text>
        <text x={PAD.l - 30} y={strikeY + 14} className="mark-value" textAnchor="end">{w.strike.toFixed(2)}</text>

        {/* the load line itself */}
        <line x1={PAD.l - 22} y1={loadY} x2={PAD.l + GW + 22} y2={loadY} className="mark-load" />
        <text x={PAD.l - 30} y={loadY - 7} className="mark-label" textAnchor="end">load line &middot; covered down to here</text>
        <text x={PAD.l - 30} y={loadY + 14} className="mark-value" textAnchor="end">{w.loadPrice.toFixed(2)}</text>
        <text x={PAD.l + GW + 28} y={loadY + 4} className="mark-bps">−{(w.makeWholeBps / 100).toFixed(2)}%</text>

        {/* the waterline: where the price actually is */}
        {nowY !== null && (
          <>
            <line x1={PAD.l} y1={nowY} x2={PAD.l + GW} y2={nowY}
              className={beyond ? "mark-now beyond" : "mark-now"} />
            <polygon points={`${PAD.l + GW},${nowY} ${PAD.l + GW + 11},${nowY - 5} ${PAD.l + GW + 11},${nowY + 5}`}
              className={beyond ? "now-arrow beyond" : "now-arrow"} />
            {crowded && (
              <line x1={PAD.l + GW + 11} y1={nowY} x2={PAD.l + GW + 24} y2={nowTextY - 6}
                className="now-leader" />
            )}
            <text x={PAD.l + GW + 28} y={nowTextY - 8} className="now-label">now</text>
            <text x={PAD.l + GW + 28} y={nowTextY + 11} className="now-value">{w.now!.toFixed(2)}</text>
          </>
        )}

        {!priceKnown && (
          <text x={PAD.l + GW / 2} y={PAD.t + GH / 2} className="mark-label" textAnchor="middle">
            spot book unpriceable
          </text>
        )}
        {crowded && priceKnown && (
          <text x={PAD.l + GW / 2} y={strikeY - 9} className="mark-hint" textAnchor="middle">
            sitting at the strike
          </text>
        )}
      </svg>

      <dl className="gauge-read">
        <div>
          <dt>window</dt>
          <dd>{w.asset} · {w.intervalLabel}</dd>
        </div>
        <div>
          <dt>{w.secondsLeft > 0 ? "closes in" : "closed"}</dt>
          <dd className="gauge-count">{w.secondsLeft > 0 ? fmtLeft(w.secondsLeft) : "settling"}</dd>
        </div>
        <div>
          <dt>moved</dt>
          <dd className={fall === null ? "" : fall > 0 ? "heel-num" : "waterline-num"}>
            {fall === null ? "unknown" : `${Math.abs(fall * 100).toFixed(3)}% ${fall > 0 ? "down" : "up"}`}
          </dd>
        </div>
      </dl>

      <p className="gauge-note">
        {beyond
          ? "Past the load line: the payout no longer covers the whole fall. The position says so rather than claiming otherwise."
          : "Inside the load line. A fall to the mark is fully covered; beyond it, the fixed payout stops keeping pace."}
      </p>
    </div>
  );
}

function fmtLeft(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}:${String(r).padStart(2, "0")}`;
}
