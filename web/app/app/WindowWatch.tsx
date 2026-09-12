"use client";

import { EXPLORER } from "@/lib/chain";
import { explainShort, type Quote } from "@/lib/window";
import { useWallet } from "./wallet";
import { REASON, useLive, type Opened } from "./live";
import { SettleButton } from "./cover-actions";
import PhaseTrack from "./PhaseTrack";

/**
 * The live window, counting down — and what happens to the connected wallet inside it.
 *
 * Someone watching one window through should see the whole arc in this one panel: it opens,
 * Ballast buys (or says why it will not), it closes, it resolves, and — once settle() is
 * called, which is the only way a payout reaches a vault — it pays. All state comes from the
 * live feed (live.tsx); this file only decides what to say about it.
 *
 * The server renders the window with its close as a UTC timestamp. The ticking number and
 * the bar exist only after hydration, so a reader without JavaScript never sees a dead
 * counter. A new window is keyed on its market id, so the panel's content re-enters rather
 * than the digits silently changing under the same box.
 */

const utcTime = (s: number) => new Date(s * 1000).toISOString().slice(11, 19);
const usd = (u: bigint) => (Number(u) / 1e6).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyOf = (u: bigint) => (Number(u) / 1e6).toLocaleString("en-GB", { maximumFractionDigits: 3 });
const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;
const px = (v: number) => v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

export default function WindowWatch() {
  const { settled: walletKnown, hasProvider, account, chainOk, s } = useWallet();
  const { mounted, now, current, previous, initial, trackOf, quote: q, spot, cfg, readFailed, phase, canSchedule, engineBalance } = useLive();
  const connected = walletKnown && !!account && chainOk;
  const policy = s?.policy;
  const hasPolicy = !!policy?.[0] && Number(policy[3]) * 1000 > Date.now();
  const ready = connected && !!s && s.enrolled && hasPolicy && s.free > 0n;

  const tr = trackOf(current);
  const pv = trackOf(previous);
  const left = current ? Math.max(0, current.close - now) : 0;
  const elapsed = current ? Math.min(current.seconds, Math.max(0, now - current.start)) : 0;
  const nextAttemptAt = current && cfg && tr.attempts < cfg.max && !tr.gaveUp && !tr.opened
    ? current.start + cfg.first + tr.attempts * cfg.retry : null;
  const shown = current ?? (mounted ? null : initial);
  const move = shown && spot !== null && shown.openPrice > 0 ? (spot - shown.openPrice) / shown.openPrice : null;

  return (
    <section className="winWatch" aria-labelledby="ww-h" data-phase={phase}>
      <div className="wwHead">
        <h2 id="ww-h" className="wwEyebrow">Live window</h2>
        <span className="wwSeries">ETH · one-minute{shown ? <> · <span className="mono">#{parseInt(shown.marketId, 16)}</span></> : null}</span>
      </div>

      {/* Keyed on the window: a new one enters, it does not overwrite. */}
      <div className="wwBody" key={shown?.marketId ?? "none"}>
        <div className="wwClock">
          {shown ? (
            <>
              {mounted && current && (
                <span className="wwCount" role="timer" aria-live="off" aria-label={`${left} seconds left in this window`}>{clock(left)}</span>
              )}
              {mounted && !current && (
                <span className="wwCount wwWait" role="status">Next window opening…</span>
              )}
              <span className="wwClose">
                opened {utcTime(shown.start)} UTC · closes <time dateTime={new Date(shown.close * 1000).toISOString()}>{utcTime(shown.close)} UTC</time>
              </span>
            </>
          ) : mounted && !readFailed ? (
            <span className="wwCount wwWait" role="status">Next window opening…</span>
          ) : (
            <span className="wwClose">
              {readFailed
                ? "The chain did not answer, so the current window cannot be shown. Retrying."
                : "No one-minute ETH window was registered by Ballast in the last ~100 seconds. If the engine has stopped, the Engine view says so."}
            </span>
          )}
        </div>
        {mounted && current && (
          <div className="wwBar" aria-hidden="true"><span style={{ width: `${(elapsed / current.seconds) * 100}%` }} /></div>
        )}
        {connected && <PhaseTrack />}
        {shown && (
          <p className="wwPrice">
            Strike <strong>{px(shown.openPrice)}</strong>, the price at the open
            {move !== null && spot !== null && <> · now <strong>{px(spot)}</strong>{" "}
              <span className={move < 0 ? "down" : "up"}>({move >= 0 ? "+" : ""}{(move * 100).toFixed(3)}%)</span></>}.
            {" "}Cover pays if ETH closes below the strike.
          </p>
        )}

        {/* ------------------------------------------------ this window, for this wallet */}
        <div className="wwState">
          {mounted && canSchedule === false && (
            <p className="wwLine">
              <span className="tag down">Cannot schedule</span>{" "}
              The engine holds{engineBalance !== null ? <> <strong>{(Number(engineBalance) / 1e18).toFixed(2)} STT</strong>,</> : null} below
              Somnia&rsquo;s <strong>32 STT</strong> scheduling floor, so it registers each window but cannot book the
              attempt that buys cover — for any wallet. Anyone can fund it with <code>topUp()</code>;{" "}
              <a href="/app/engine">Engine</a> has the details.
            </p>
          )}
          {hasProvider && !walletKnown ? (
            <p className="wwNote">Checking your wallet…</p>
          ) : !account ? (
            <p className="wwNote">
              Connect a wallet to see what Ballast would do for you in this window. Nothing on this
              panel is a position until then.
            </p>
          ) : !chainOk ? (
            <p className="wwNote">Switch this wallet to Somnia Shannon to see your cover in this window.</p>
          ) : !s ? (
            <p className="wwNote">Reading your policy and balances…</p>
          ) : !current ? null : tr.opened ? (
            <Bought o={tr.opened} policy={s.policy} />
          ) : !ready ? (
            <NotReady s={s} hasPolicy={hasPolicy} q={q} />
          ) : (
            <>
              {q?.kind === "buy" ? (
                <p className="wwLine">
                  <span className="tag">{phase === "evaluating" ? "Evaluating" : canSchedule === false ? "If it could run" : "Before cover opens"}</span>{" "}
                  If Ballast bought now it would spend <strong>{usd(q.premium)} tUSDC</strong> of your balance for{" "}
                  <strong>{qtyOf(q.qty)}</strong> Down contracts at {(Number(q.coverPrice) / 1e6).toFixed(3)} —
                  a payout of <strong>{qtyOf(q.qty)} tUSDC</strong> if ETH closes below the strike, making you whole at{" "}
                  {pct(q.achievedBps)} of a fall{q.achievedBps < q.requestedBps
                    ? <> (you asked {pct(q.requestedBps)}; {q.shortBy})</> : null}.
                </p>
              ) : q?.kind === "decline" ? (
                <p className="wwLine">
                  <span className="tag down">Would decline</span>{" "}
                  <strong>{REASON[q.reason]?.[0] ?? q.reason}</strong> — {REASON[q.reason]?.[1] ?? ""}
                  {/* The same situation as an empty vault, arriving one window earlier: nonzero
                      free balance, but less than this window's ask would cost at the current
                      book. Named directly with the real figures rather than left inside the
                      generic reason text above. */}
                  {phase === "vaultLow" && q.desiredPremium !== null && s ? (
                    <> Your vault holds <strong>{usd(s.free)} tUSDC</strong> free; this window&rsquo;s ask would need{" "}
                      <strong>{usd(q.desiredPremium)} tUSDC</strong> at the current book — not enough, however many
                      windows pass until it is funded. <a href="/app/funds">Deposit tUSDC</a>.</>
                  ) : "."}
                </p>
              ) : (
                <p className="wwNote">Pricing this window against the live book…</p>
              )}
              {tr.skips.length > 0 && (
                <p className="wwLine">
                  <span className="tag down">Declined</span>{" "}
                  {tr.skips.map((k, i) => (
                    <span key={k.tx + i}>{i > 0 && " · "}attempt {i + 1}: <strong>{REASON[k.reason]?.[0] ?? k.reason}</strong>{" "}
                      <a href={`${EXPLORER}/tx/${k.tx}`}>tx</a></span>
                  ))}
                  {tr.skips.length > 0 && <> — {REASON[tr.skips[tr.skips.length - 1].reason]?.[1] ?? ""}.</>}
                </p>
              )}
              {tr.gaveUp ? (
                <p className="wwNote">Ballast gave up on this window after {cfg?.max ?? "its"} attempts. No cover in it.</p>
              ) : canSchedule === false ? null
              : nextAttemptAt !== null && nextAttemptAt > now ? (
                <p className="wwNote">Next attempt at {utcTime(nextAttemptAt)} UTC, {nextAttemptAt - current.start} s into the window.</p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* ------------------------------------------------ the last window */}
      {mounted && previous && (
        <div className="wwLast" key={previous.marketId}>
          <span className="wwLastK">Last window · #{parseInt(previous.marketId, 16)} · closed {utcTime(previous.close)} UTC</span>
          <p className="wwLine">
            {pv.outcome === 0 ? <>Waiting for dreamDEX to resolve it.</>
              : pv.outcome === 1 ? <><strong>Down won</strong> — ETH closed below the strike.</>
              : pv.outcome === 2 ? <><strong>Up won</strong> — ETH did not close below the strike.</>
              : <><strong>Voided</strong> by the venue.</>}
            {connected && (pv.opened ? (
              pv.settled ? (
                pv.settled.proceeds > 0n
                  ? <> <span className="tag up">Paid</span> <strong>{usd(pv.settled.proceeds)} tUSDC</strong> credited to your vault
                      {pv.settled.tx && <> · <a href={`${EXPLORER}/tx/${pv.settled.tx}`}>tx</a></>}.</>
                  : <> Settled: the cover paid nothing; its {usd(pv.opened.premium)} tUSDC premium was the cost.</>
              ) : pv.outcome === 1 ? (
                <> Your cover pays <strong>{qtyOf(pv.opened.qty)} tUSDC</strong> once settled.{" "}
                  <SettleButton user={account!} marketId={previous.marketId} label="Settle — credit the payout" /></>
              ) : pv.outcome === 2 ? (
                <> Your cover pays nothing; {usd(pv.opened.premium)} tUSDC was its cost.{" "}
                  <SettleButton user={account!} marketId={previous.marketId} label="Settle — record it" /></>
              ) : pv.outcome === 3 ? (
                <> <SettleButton user={account!} marketId={previous.marketId} label="Settle" /></>
              ) : <> You held cover in it: {qtyOf(pv.opened.qty)} contracts.</>
            ) : pv.skips.length > 0 ? (
              <> No cover for you in it: <strong>{REASON[pv.skips[pv.skips.length - 1].reason]?.[0] ?? "declined"}</strong>.</>
            ) : null)}
          </p>
        </div>
      )}
    </section>
  );
}

function Bought({ o, policy }: { o: Opened; policy: readonly [boolean, number, number, bigint, bigint] }) {
  const why = explainShort(o, Number(policy[2]), policy[4]);
  return (
    <p className="wwLine">
      <span className="tag up">Cover open</span>{" "}
      Ballast just spent <strong>{usd(o.premium)} tUSDC</strong> of your balance to protect this ETH exposure for this
      window: <strong>{qtyOf(o.qty)}</strong> Down contracts
      {o.coverPrice > 0n && <> at {(Number(o.coverPrice) / 1e6).toFixed(3)}</>}, paying{" "}
      <strong>{qtyOf(o.qty)} tUSDC</strong> if ETH closes below the strike — you are made whole at{" "}
      {pct(o.achievedBps)} of a fall{why ? <>; you asked {pct(o.requestedBps)}, and {why}</> : null}.
      {o.tx && <> <a href={`${EXPLORER}/tx/${o.tx}`}>tx</a></>}
    </p>
  );
}

function NotReady({ s, hasPolicy, q }: {
  s: NonNullable<ReturnType<typeof useWallet>["s"]>; hasPolicy: boolean; q: Quote | null;
}) {
  const price = q && q.kind === "decline" ? q.coverPrice : q?.kind === "buy" ? q.coverPrice : null;
  const noExposure = q?.kind === "decline" && q.reason === "NoExposure";

  if (!hasPolicy) {
    return (
      <p className="wwLine">
        <span className="tag">Not covered</span>{" "}
        Ballast will not buy for this wallet in this window — it has yet to set a load line.{" "}
        <a href="/app/policy">Set one on Policy</a>.
      </p>
    );
  }
  if (!s.enrolled) {
    return (
      <p className="wwLine">
        <span className="tag">Not covered</span>{" "}
        Ballast will not buy for this wallet in this window — it has yet to enrol.
      </p>
    );
  }
  // A policy exists and enrolment is done, so the only remaining reason `ready` can be false
  // here is `s.free === 0n`: named directly, rather than as a generic "deposit collateral".
  return (
    <p className="wwLine">
      <span className="tag down">Vault is empty</span>{" "}
      This wallet&rsquo;s vault holds no free tUSDC — premium is paid from that balance, so
      Ballast will buy nothing this window, or any window, until it is funded.{" "}
      <a href="/app/funds">Deposit tUSDC</a>.
      {noExposure ? <> Right now it would also decline for a second reason: <strong>this wallet holds no WETH</strong>.</>
        : price !== null ? <> The book prices a Down contract at <strong>{(Number(price) / 1e6).toFixed(3)}</strong> right now, for reference.</>
        : null}
    </p>
  );
}
