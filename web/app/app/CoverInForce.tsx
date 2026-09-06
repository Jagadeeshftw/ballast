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
  const { settled, sErr, hasProvider, account, chainOk, s, refresh, connect, connecting } = useWallet();

  /* Unknown is a third state, and two separate windows produce it. In both, the honest
     answer is "not yet known" -- never "you have none", which is an assertion about the
     reader that may be false at the moment it is painted:
       1. a provider exists but the initial eth_accounts check has not resolved, so we do
          not yet know whether anyone is connected. `ready` used to stand in for this and
          could not: it is set synchronously, before that request comes back.
       2. a wallet IS connected but its first chain read has not landed, so we know who is
          asking and nothing whatsoever about their position. Rendering that as "not
          covered" is the same false assertion wearing different words.
     Same rule as nulls rather than zeros: absence of an answer is not a negative answer. */
  const pending = (hasProvider && !settled) || (settled && !!account && chainOk && !s && !sErr);
  const connected = settled && !!account && chainOk;
  const policy = s?.policy;
  const hasPolicy = !!policy?.[0] && Number(policy[3]) * 1000 > Date.now();
  const exposure = s && s.priceable ? (Number(s.weth) / 1e18) * (Number(s.ethPrice) / 1e18) : null;
  const yourMakeWhole = hasPolicy ? Number(policy![1]) / 10_000 : null;
  const yourPays = exposure !== null && yourMakeWhole !== null ? exposure * yourMakeWhole : null;

  return (
    <div className="coverPanel" data-own="" aria-busy={pending || undefined}>
      {pending ? (
        /* ---- state 0: we are still asking. Hold the panel's shape and claim nothing. ---- */
        <>
          <p className="srOnly" role="status">Checking your wallet and reading your position.</p>
          <div className="skel skelEyebrow" />
          <div className="skel skelBig" />
          <div className="skel skelLine w90" />
          <div className="skel skelLine w75" />
          <div className="skel skelLine w45" />
        </>
      ) : connected && sErr && !s ? (
        /* ---- state 0a: we asked the chain and it did not answer. Not "no cover". ---- */
        <>
          <div className="coverEyebrow">Your cover</div>
          <div className="coverBig">Can&rsquo;t read your position</div>
          <p className="coverLede">
            The chain did not answer, so Ballast cannot say what this wallet holds or whether
            it is covered. Nothing has changed on chain — this is a read failing, not cover
            lapsing. Whatever is in force stays in force.
          </p>
          <button type="button" className="btn" onClick={() => { void refresh(); }}>Try again</button>
        </>
      ) : !connected && !!account && !chainOk ? (
        /* ---- state 0b: connected to the wrong chain. We cannot read their position, so we
               do not get to say they have no cover -- only that we cannot see it. ---- */
        <>
          <div className="coverEyebrow">Your cover</div>
          <div className="coverBig">Can&rsquo;t read your position</div>
          <p className="coverLede">
            This wallet is connected to a different network, so Ballast cannot see what it
            holds. Switch it to <strong>Somnia Shannon</strong> and this panel will answer for
            your address. Whether you have cover is unknown until then — not none.
          </p>
        </>
      ) : !connected ? (
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
