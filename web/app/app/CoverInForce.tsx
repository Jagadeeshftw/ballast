"use client";

import { useWallet } from "./wallet";
import { ADDR, EXPLORER } from "@/lib/chain";
import { explainShort } from "@/lib/window";
import { REASON, useLive } from "./live";
import Num from "./Num";

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
  const live = useLive();

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
              No EVM wallet in this browser, so there is nothing to connect — everything below
              is readable without one.{" "}
              <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">Install one</a>{" "}
              and point it at Somnia Shannon testnet, chain 50312, or open this on a device
              where you already have a wallet.
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
      ) : s && s.weth > 0n && !s.priceable ? (
        /* ---- state 3a: holds ETH, but the book cannot price it right now. Not "nothing to
               cover" -- the position exists; its value is what cannot be read. ---- */
        <>
          <div className="coverEyebrow">Your cover</div>
          <div className="coverBig">Can&rsquo;t price your ETH</div>
          <p className="coverLede">
            This wallet holds <strong>{(Number(s.weth) / 1e18).toFixed(4)} WETH</strong>, but the spot book is
            one-sided right now, so its tUSDC value — and the size of any cover — cannot be read. Ballast
            waits for a price rather than inventing one.
          </p>
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
        /* ---- state 4: genuinely theirs. The hierarchy: how much of the position is protected
               right now (in force), then the ask beside it, then the money, then the detail. The
               ask and the in-force figure stay labelled apart -- shown together unlabelled they
               read as a contradiction -- and "in force" only ever carries what was bought. ---- */
        <Cover exposure={exposure} weth={Number(s!.weth) / 1e18} policy={policy!} enrolled={s!.enrolled} />
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

const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;

/** State 4, laid out by weight. Every figure is the wallet's own, read from the chain. */
function Cover({ exposure, weth, policy, enrolled }: {
  exposure: number; weth: number; policy: readonly [boolean, number, number, bigint, bigint]; enrolled: boolean;
}) {
  const { mounted, current, trackOf, quote, phase, cfg } = useLive();
  const askBps = Number(policy[1]);
  const askLoss = exposure * askBps / 10_000;
  const t = trackOf(current);
  const o = t.opened;
  const gross = o ? Number(o.qty) / 1e6 : null, premium = o ? Number(o.premium) / 1e6 : null;
  /* Net of premium: the engine's achieved figure is qty·(1−q)/exposure, the payout after the
     premium it cost. Both the ask and the in-force figure are stated the same way. */
  const net = gross !== null && premium !== null ? gross - premium : null;
  const short = !!o && o.achievedBps < o.requestedBps;
  const why = o ? explainShort(o, Number(policy[2]), policy[4]) : null;
  const downNow = o ? Number(o.coverPrice) / 1e6
    : quote?.kind === "buy" ? Number(quote.coverPrice) / 1e6
    : quote?.kind === "decline" && quote.coverPrice !== null ? Number(quote.coverPrice) / 1e6 : null;
  const inForce = o ? o.achievedBps : 0;
  const win = current ? `#${parseInt(current.marketId, 16)}` : null;

  const status: [string, string] = !enrolled ? ["Not enrolled", "dim"]
    : !mounted || !current ? ["Watching", ""]
    : o ? ["Protected", "up"]
    : phase === "gaveUp" ? ["Gave up", "down"]
    : phase === "declined" ? ["Declined", "down"]
    : phase === "unscheduled" ? ["Engine cannot schedule", "down"]
    : phase === "evaluating" ? ["Evaluating", ""]
    : ["Waiting", ""];

  return (
    <>
      <div className="coverEyebrow">Your cover{win ? <> · in force this window {win}</> : null}</div>
      <div className="coverHero">
        <div className="coverBig">
          <Num value={inForce / 100} /><span className="coverUnit">% of a fall, made whole right now</span>
        </div>
        <span className={`tag ${status[1]}`}>{status[0]}</span>
      </div>
      <p className="coverLede coverAnswer">
        {o ? (
          <>If ETH closes below the strike this window, <strong>{n2(gross!)}</strong> tUSDC pays out —{" "}
            <strong className="text-paid">{n2(net!)}</strong> net of the {n2(premium!)} premium, which is what a{" "}
            {pct(o.achievedBps)} fall costs on your {n2(exposure)} tUSDC of ETH.</>
        ) : !enrolled ? (
          <>Nothing is in force: this wallet is not enrolled, so the engine does not act for it. Your policy is set — enrolling is one transaction.</>
        ) : !mounted || !current ? (
          <>No one-minute window is open right now; the next opens within a minute.</>
        ) : phase === "gaveUp" ? (
          <>Nothing is in force this window: Ballast gave up after {cfg?.max ?? "its"} attempts — the book never became priceable.</>
        ) : phase === "declined" ? (
          <>Nothing is in force this window yet: declined — <strong>{REASON[t.skips[t.skips.length - 1]?.reason]?.[0] ?? "see the live window"}</strong>
            {cfg && t.attempts < cfg.max ? <>; it will try again</> : null}.</>
        ) : phase === "unscheduled" ? (
          <>Nothing is in force: the engine is below the 32 STT scheduling floor, so no attempt can be booked in this window — for any wallet, not only yours.</>
        ) : phase === "evaluating" ? (
          <>Nothing is in force yet: Ballast is evaluating this window now.</>
        ) : (
          <>Nothing is in force yet: Ballast makes its first attempt {cfg?.first ?? 15} s into the window.</>
        )}
      </p>

      <dl className="coverAsk">
        <div>
          <dt>Your policy asks for</dt>
          <dd>made whole on a fall of <strong>{pct(askBps)}</strong> — a loss of <strong>{n2(askLoss)}</strong> tUSDC on this position</dd>
        </div>
        <div>
          <dt>In force{win ? <> · {win}</> : null}</dt>
          <dd>
            {o ? <>made whole on a fall of <strong>{pct(o.achievedBps)}</strong> — a loss of <strong>{n2(net!)}</strong> tUSDC
              {short ? <>. <span className="coverGap">Short of the {pct(o.requestedBps)} asked: {why ?? "the book offered less than the ask"}.</span></> : "."}</>
              : <>nothing yet</>}
          </dd>
        </div>
      </dl>

      <dl className="coverGrid">
        <div><dt>ETH exposure</dt><dd><Num value={weth} decimals={4} /> WETH<small>≈ <Num value={exposure} /> tUSDC</small></dd></div>
        <div><dt>Load line</dt><dd>{pct(askBps)}<small>the depth of fall you asked to be made whole at</small></dd></div>
        <div><dt>Down price now</dt><dd>{downNow !== null ? downNow.toFixed(3) : "—"}<small>{downNow !== null ? "per contract, at the touch" : "the book cannot be priced"}</small></dd></div>
        <div><dt>Contracts held</dt><dd>{o ? <Num value={gross!} decimals={3} /> : "0"}<small>Down contracts this window</small></dd></div>
        <div><dt>Premium paid</dt><dd>{o ? <Num value={premium!} /> : "0.00"}<small>tUSDC, this window</small></dd></div>
        <div><dt>Maximum payout</dt><dd>{o ? <Num value={gross!} /> : "0.00"}<small>tUSDC if ETH closes below the strike</small></dd></div>
        <div><dt>Ceiling per window</dt><dd>{(Number(policy[2]) / 100).toFixed(2)}%<small>the most you will pay, of exposure</small></dd></div>
        <div><dt>Status</dt><dd className={status[1]}>{status[0]}<small>{o ? "the fill is on chain" : "for this window"}</small></dd></div>
      </dl>
    </>
  );
}
