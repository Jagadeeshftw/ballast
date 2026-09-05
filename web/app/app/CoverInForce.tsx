"use client";

import { useWallet } from "./wallet";
import { ADDR, EXPLORER } from "@/lib/chain";

/**
 * "What am I covered for right now" — and the honest answer depends on who is asking.
 *
 * This panel used to show the demonstration account's exposure and policy unconditionally, at
 * display size, as the first thing on the page. A label was not enough: showing someone else's
 * HISTORY is fine when attributed, which is why the totals and Recent activity work, but
 * showing someone else's PRESENT STATE in a panel whose whole job is to answer a question
 * about the viewer is a different thing. For a disconnected visitor the true answer is
 * "nothing", and no caption makes a live statement about another account into that.
 *
 * So it has three states, and the demo position survives only as an explicitly-framed worked
 * example beneath them.
 *
 * The server renders the disconnected state, which is correct rather than merely convenient:
 * a reader with no JavaScript has no wallet connected, so "you have no cover" is true for
 * them, and the panel is populated in the HTML either way.
 */
const n2 = (v: number) => v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CoverInForce({
  demoExposure, demoMakeWhole, demoPremiumCap, demoExpiry, demoOpen,
}: {
  demoExposure: number | null; demoMakeWhole: number; demoPremiumCap: string;
  demoExpiry: string; demoOpen: number;
}) {
  const { ready, hasProvider, account, chainOk, s, connect, connecting } = useWallet();

  const connected = ready && !!account && chainOk;
  const policy = s?.policy;
  const hasPolicy = !!policy?.[0] && Number(policy[3]) * 1000 > Date.now();
  const exposure = s && s.priceable ? (Number(s.weth) / 1e18) * (Number(s.ethPrice) / 1e18) : null;
  const yourMakeWhole = hasPolicy ? Number(policy![1]) / 10_000 : null;
  const yourPays = exposure !== null && yourMakeWhole !== null ? exposure * yourMakeWhole : null;

  return (
    <div className="coverPanel">
      {!connected ? (
        /* ---- state 1: nobody is connected, so there is no cover to describe ---- */
        <>
          <div className="coverEyebrow">Your cover</div>
          <div className="coverBig">You have no cover</div>
          <p className="coverLede">
            Nothing here is yours yet. Once a wallet is connected this panel answers one
            question — how much of your position is covered, to what depth of fall, and what
            that pays — read from the chain for <em>your</em> address.
          </p>
          {hasProvider ? (
            <button type="button" className="btn" onClick={connect} disabled={connecting}>
              {connecting ? "Connecting…" : "Connect a wallet"}
            </button>
          ) : (
            <p className="coverNote">
              No EVM wallet in this browser. Everything below is readable without one.
            </p>
          )}
        </>
      ) : !hasPolicy ? (
        /* ---- state 2: connected, but nothing authorises cover yet ---- */
        <>
          <div className="coverEyebrow">Your cover</div>
          <div className="coverBig">Not covered</div>
          <p className="coverLede">
            This wallet has <strong>no active policy</strong>, so the engine has no consent and
            will do nothing for it. A policy is what says how deep a fall you want made whole
            and the most you will pay per window.
          </p>
          <a className="btn" href="/app/policy">Set a load line</a>
        </>
      ) : exposure === null || exposure === 0 ? (
        /* ---- state 3: consent exists, but there is nothing measurable to cover ---- */
        <>
          <div className="coverEyebrow">Your cover</div>
          <div className="coverBig">Nothing to cover</div>
          <p className="coverLede">
            Your policy is active — made whole on a fall of{" "}
            <strong>{(yourMakeWhole! * 100).toFixed(2)}%</strong> — but this wallet holds no
            measured exposure, so there is nothing to size cover against. Ballast only covers a
            position it can read on chain.
          </p>
          <a className="btn ghost" href="/app/funds">Mint test exposure</a>
        </>
      ) : (
        /* ---- state 4: genuinely theirs ---- */
        <>
          <div className="coverEyebrow">Your cover · in force</div>
          <div className="coverBig">
            {n2(exposure)}<span className="coverUnit">tUSDC of ETH</span>
          </div>
          <p className="coverLede">
            Made whole on a fall of{" "}
            <strong>{(yourMakeWhole! * 100).toFixed(2)}%</strong>, which on this position pays{" "}
            <strong className="text-paid">{n2(yourPays!)}</strong> tUSDC.
          </p>
        </>
      )}

      {/* The demonstration account survives as a worked example, framed as one. */}
      <details className="coverDemo">
        <summary>See a worked example on the demonstration account</summary>
        <div>
          {demoExposure === null ? (
            <p>
              The book is one-sided right now, so even the example cannot be priced. That is
              what the engine does with a book it cannot price: it waits.
            </p>
          ) : (
            <p>
              <a className="mono" href={`${EXPLORER}/address/${ADDR.demoUser}`}>{ADDR.demoUser.slice(0, 10)}…</a>{" "}
              holds <strong>{n2(demoExposure)}</strong> tUSDC of ETH, made whole on a fall of{" "}
              <strong>{(demoMakeWhole * 100).toFixed(2)}%</strong> — which pays{" "}
              <strong>{n2(demoExposure * demoMakeWhole)}</strong> tUSDC — for at most{" "}
              {demoPremiumCap}% per window, to {demoExpiry}. It has{" "}
              <strong>{demoOpen}</strong> window{demoOpen === 1 ? "" : "s"} still to settle.{" "}
              <strong>This is not your position.</strong> It is the account whose recorded run
              the rest of this dashboard reports.
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
