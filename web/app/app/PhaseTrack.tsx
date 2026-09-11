"use client";

import { useLive } from "./live";

/**
 * Where the current window is, for the connected wallet, as a track of states.
 *
 * The shape is the catalogue's `multi-step-loader`; the states are the ones the chain can
 * actually show. "Buying" is not one of them: the engine evaluates and buys inside a single
 * transaction, so there is no observable moment between deciding and having bought. What is
 * observable is: the window has opened and the engine has not yet tried; it is evaluating
 * (its attempt is due and no decision has landed); it bought, or it declined; the window
 * closed and awaits the venue's resolution; the market resolved; the position was settled.
 *
 * The current step is marked by colour and a filled dot; nothing here is hidden before it
 * happens, and the change from one step to the next is a colour transition, not an entrance.
 */
const STEPS = ["Open", "Evaluating", "Protected", "Closed", "Resolved", "Settled"] as const;

export default function PhaseTrack() {
  const { mounted, current, previous, trackOf, phase, now } = useLive();
  if (!mounted || (!current && !previous)) return null;

  // The window this track describes: the open one, or -- for the moment after it closes,
  // until the next opens -- the one that just closed.
  const w = current ?? previous;
  const t = trackOf(w);
  const closed = !!w && now >= w.close;
  let at = 0; let label = STEPS[0] as string; let tone: "" | "up" | "down" = "";
  if (!closed) {
    if (t.opened) { at = 2; label = "Protected"; tone = "up"; }
    else if (phase === "declined" || phase === "gaveUp") { at = 2; label = phase === "gaveUp" ? "Gave up" : "Declined"; tone = "down"; }
    else if (phase === "evaluating") { at = 1; label = "Evaluating"; }
    else { at = 0; label = "Open"; }
  } else if (t.settled) { at = 5; label = "Settled"; tone = t.settled.proceeds > 0n ? "up" : ""; }
  else if (t.outcome !== 0) { at = 4; label = t.outcome === 1 ? "Resolved · Down won" : t.outcome === 2 ? "Resolved · Up won" : "Voided"; tone = t.outcome === 1 ? "up" : ""; }
  else { at = 3; label = "Closed"; }

  return (
    <ol className="phase" aria-label={`Window state: ${label}`} data-tone={tone}>
      {STEPS.map((s, i) => (
        <li key={s} className={i < at ? "past" : i === at ? "now" : ""} aria-current={i === at ? "step" : undefined}>
          <span className="phaseDot" aria-hidden="true" />
          <span className="phaseLabel">{i === at ? label : s}</span>
        </li>
      ))}
    </ol>
  );
}
