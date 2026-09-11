"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeEventLog, type Address, type PublicClient } from "viem";
import { ADDR, EXPLORER } from "@/lib/chain";
import { ETH_KEY, engineEvents, engineViews, explainShort, quoteFor, toWindows, type Quote, type Win } from "@/lib/window";
import { pub, useWallet } from "./wallet";
import { SettleButton } from "./cover-actions";

/**
 * The live window, counting down — and what happens to the connected wallet inside it.
 *
 * Someone watching one window through should see the whole arc in this one panel: it opens,
 * Ballast buys (or says why it will not), it closes, it resolves, and — once settle() is
 * called, which is the only way a payout reaches a vault — it pays.
 *
 * Rules this panel keeps:
 *   - Every figure is read from the chain. "What Ballast would do" is the engine's own quote
 *     replayed against this wallet (lib/window.ts); an input that cannot be read is said, not
 *     guessed.
 *   - Cover is shown as opened only from `coverOf` or a CoverOpened log, both of which exist
 *     only once the purchase has been mined. Nothing optimistic.
 *   - Disconnected, it describes the window and nothing that implies a position.
 *   - The server renders the window with its close as a UTC timestamp. The ticking number and
 *     the bar exist only after hydration, so a reader without JavaScript never sees a dead
 *     counter. The clock runs on CHAIN time (block timestamp minus local time), not the
 *     viewer's clock.
 */

const REASON: Record<string, [string, string]> = {
  PolicyInactiveOrExpired: ["No active policy", "there is no active consent, so the engine has no authority to act"],
  BelowEnrolmentFloor: ["Below the enrolment floor", "the vault balance is under the minimum an enrolled account must hold"],
  NoExposure: ["No exposure", "this wallet holds no WETH, so there is nothing to cover"],
  NoLiquidity: ["No liquidity", "the book cannot price cover right now — it is empty or one-sided"],
  CoverTooExpensive: ["Cover too expensive", "Down is priced above 0.90, where the size needed to make you whole diverges"],
  NoHeadroom: ["No headroom", "a limit you set is already fully committed in this window"],
  BelowMinimumLot: ["Below the minimum lot", "the size your limits allow rounds to zero on the venue's lot grid"],
  AlreadyCovered: ["Already covered", "this window already holds cover for this wallet"],
  PlacementFailed: ["Placement failed", "the purchase reverted — the pool refused it, or it ran out of gas"],
  NoOpenPrice: ["No open price", "the window's opening price was never recorded, so there is no strike"],
  WouldMisrepresent: ["Would misrepresent", "the position would deliver nothing it could honestly describe as cover"],
  Unreadable: ["Can't price this right now", "one of the chain reads the quote needs did not answer"],
};
const SKIP = ["None", "PolicyInactiveOrExpired", "BelowEnrolmentFloor", "NoExposure", "NoLiquidity", "CoverTooExpensive",
  "NoHeadroom", "BelowMinimumLot", "AlreadyCovered", "PlacementFailed", "NoOpenPrice", "WouldMisrepresent"];

const client = pub as unknown as PublicClient;
const utcTime = (s: number) => new Date(s * 1000).toISOString().slice(11, 19);
const usd = (u: bigint) => (Number(u) / 1e6).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyOf = (u: bigint) => (Number(u) / 1e6).toLocaleString("en-GB", { maximumFractionDigits: 3 });
const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;
const px = (v: number) => v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

type Opened = { qty: bigint; premium: bigint; coverPrice: bigint; requestedBps: number; achievedBps: number; tx: string | null };
type Track = {
  opened: Opened | null;
  skips: { reason: string; tx: string }[];
  attempts: number;
  gaveUp: boolean;
  settled: { outcome: number; proceeds: bigint; tx: string | null } | null;
  outcome: number;
};
const blank = (): Track => ({ opened: null, skips: [], attempts: 0, gaveUp: false, settled: null, outcome: 0 });

export default function WindowWatch({ initial, serverNow }: { initial: Win | null; serverNow: number }) {
  const { settled: walletKnown, hasProvider, account, chainOk, s } = useWallet();
  const [mounted, setMounted] = useState(false);
  const [skew, setSkew] = useState(0);
  const [nowMs, setNowMs] = useState(serverNow * 1000);
  const [wins, setWins] = useState<Win[]>(initial ? [initial] : []);
  const [tracks, setTracks] = useState<Record<string, Track>>({});
  const [spot, setSpot] = useState<number | null>(null);
  const [quote, setQuote] = useState<{ marketId: string; q: Quote } | null>(null);
  const [cfg, setCfg] = useState<{ first: number; retry: number; max: number } | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const last = useRef<bigint | null>(null);
  const who = useRef<string | null>(null);

  const now = Math.floor(nowMs / 1000 + skew);
  const nowRef = useRef(now); nowRef.current = now;
  const current = wins.filter((w) => w.start <= now && now < w.close).sort((a, b) => b.start - a.start)[0] ?? null;
  const previous = wins.filter((w) => w.close <= now).sort((a, b) => b.close - a.close)[0] ?? null;
  const connected = walletKnown && !!account && chainOk;

  const policy = s?.policy;
  const hasPolicy = !!policy?.[0] && Number(policy[3]) * 1000 > Date.now();
  const ready = connected && !!s && s.enrolled && hasPolicy && s.free > 0n;

  /* The tick. Chain time is refreshed by every poll; between polls it advances locally. */
  useEffect(() => {
    setMounted(true);
    const t = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const poll = useCallback(async () => {
    const acct = connected ? account!.toLowerCase() : null;
    if (who.current !== acct) { who.current = acct; last.current = null; setTracks({}); setQuote(null); }
    try {
      const head = await client.getBlockNumber();
      const blk = await client.getBlock({ blockNumber: head });
      setSkew(Number(blk.timestamp) - Date.now() / 1000);
      const from = last.current !== null && last.current + 1n > head - 989n ? last.current + 1n : head - 989n;
      if (from <= head) {
        const logs = await client.getLogs({ address: ADDR.engine as Address, fromBlock: from, toBlock: head });
        last.current = head;
        const enq: { args: Record<string, unknown> }[] = [];
        const upd: Record<string, (t: Track) => Track> = {};
        const on = (m: string, f: (t: Track) => Track) => { const k = m.toLowerCase(); const g = upd[k]; upd[k] = g ? (t) => f(g(t)) : f; };
        for (const l of logs) {
          let d: { eventName: string; args: Record<string, unknown> };
          try { d = decodeEventLog({ abi: engineEvents, data: l.data, topics: l.topics }) as never; } catch { continue; }
          const a = d.args; const m = String(a.marketId ?? "");
          const mine = acct !== null && String(a.user ?? "").toLowerCase() === acct;
          if (d.eventName === "WindowEnqueued") enq.push({ args: a });
          else if (d.eventName === "WindowAttempted") on(m, (t) => ({ ...t, attempts: Math.max(t.attempts, Number(a.attempt)) }));
          else if (d.eventName === "WindowGaveUp") on(m, (t) => ({ ...t, gaveUp: true }));
          else if (d.eventName === "CoverOpened" && mine) on(m, (t) => ({ ...t, opened: {
            qty: a.quantity as bigint, premium: a.premium as bigint, coverPrice: a.coverPrice as bigint,
            requestedBps: Number(a.requestedBps), achievedBps: Number(a.achievedBps), tx: l.transactionHash } }));
          else if (d.eventName === "CoverSkipped" && mine) on(m, (t) => ({ ...t, skips: [...t.skips, { reason: SKIP[Number(a.reason)] ?? "Unknown", tx: l.transactionHash! }] }));
          else if (d.eventName === "CoverSettled" && mine) on(m, (t) => ({ ...t, settled: { outcome: Number(a.outcome), proceeds: a.proceeds as bigint, tx: l.transactionHash } }));
        }
        if (enq.length) {
          const found = await toWindows(client, enq as never);
          if (found.length) setWins((ws) => {
            const seen = new Set(ws.map((w) => w.marketId.toLowerCase()));
            return [...ws, ...found.filter((w) => !seen.has(w.marketId.toLowerCase()))].slice(-6);
          });
        }
        if (Object.keys(upd).length) setTracks((ts) => {
          const n = { ...ts };
          for (const [k, f] of Object.entries(upd)) n[k] = f(n[k] ?? blank());
          return n;
        });
      }
      setReadFailed(false);
    } catch { setReadFailed(true); }
  }, [connected, account]);

  /* Per-window state that logs alone cannot give: the purchase as the engine holds it (so a
     cover bought before this page loaded still shows), and the outcome once resolved. */
  const refreshViews = useCallback(async (cur: Win | null, prev: Win | null) => {
    const acct = connected ? (account as Address) : null;
    const jobs: Promise<void>[] = [];
    for (const w of [cur, prev]) {
      if (!w) continue;
      const k = w.marketId.toLowerCase();
      if (acct) jobs.push(client.readContract({ address: ADDR.engine as Address, abi: engineViews, functionName: "coverOf", args: [acct, w.marketId] })
        .then((c) => setTracks((ts) => {
          const t = ts[k] ?? blank();
          const opened = t.opened ?? (c[0] > 0n ? { qty: c[0], premium: c[1], coverPrice: c[0] > 0n ? (c[1] * 1_000_000n) / c[0] : 0n,
            requestedBps: Number(c[2]), achievedBps: Number(c[3]), tx: null } : null);
          const settled = t.settled ?? (c[5] ? { outcome: Number(c[6]), proceeds: c[7], tx: null } : null);
          return opened === t.opened && settled === t.settled ? ts : { ...ts, [k]: { ...t, opened, settled } };
        })).catch(() => {}));
      if (w.close <= nowRef.current) jobs.push(client.readContract({ address: ADDR.engine as Address, abi: engineViews, functionName: "outcomeOf", args: [w.marketId] })
        .then((o) => setTracks((ts) => { const t = ts[k] ?? blank(); return t.outcome === Number(o) ? ts : { ...ts, [k]: { ...t, outcome: Number(o) } }; }))
        .catch(() => {}));
    }
    // The same price the engine sizes against, from the same source.
    jobs.push(client.readContract({ address: ADDR.source as Address, abi: [{ type: "function", name: "priceOf", stateMutability: "view",
      inputs: [{ type: "bytes32" }], outputs: [{ type: "uint256" }, { type: "bool" }] }] as const, functionName: "priceOf",
      args: [ETH_KEY as `0x${string}`] })
      .then(([p, ok]) => setSpot(ok ? Number(p) / 1e18 : null)).catch(() => setSpot(null)));
    await Promise.all(jobs);
  }, [connected, account]);

  const refreshQuote = useCallback(async (cur: Win | null) => {
    if (!cur || !connected || !s) { setQuote(null); return; }
    const reqBps = hasPolicy ? Number(s.policy[1]) : 0;
    const q = await quoteFor(client, account as Address, cur, reqBps).catch(() => ({ kind: "decline", reason: "Unreadable", coverPrice: null, exposure: null }) as Quote);
    setQuote({ marketId: cur.marketId.toLowerCase(), q });
  }, [connected, account, s, hasPolicy]);

  /* The ladder's timing, read once from the engine rather than written down here. */
  useEffect(() => {
    Promise.all([
      client.readContract({ address: ADDR.engine as Address, abi: engineViews, functionName: "initialDelaySeconds" }),
      client.readContract({ address: ADDR.engine as Address, abi: engineViews, functionName: "retryDelaySeconds" }),
      client.readContract({ address: ADDR.engine as Address, abi: engineViews, functionName: "maxAttempts" }),
    ]).then(([f, r, m]) => setCfg({ first: Number(f), retry: Number(r), max: Number(m) })).catch(() => {});
  }, []);

  /* Polling. Faster across a rollover, so "next window opening" lasts one beat, not several. */
  const curRef = useRef(current); curRef.current = current;
  const prevRef = useRef(previous); prevRef.current = previous;
  useEffect(() => {
    let alive = true; let t: ReturnType<typeof setTimeout>;
    let n = 0;
    const loop = async () => {
      if (!alive) return;
      if (typeof document === "undefined" || !document.hidden) {
        await poll();
        await refreshViews(curRef.current, prevRef.current);
        if (n++ % 2 === 0) await refreshQuote(curRef.current);
      }
      if (alive) t = setTimeout(loop, curRef.current ? 2000 : 1000);
    };
    loop();
    return () => { alive = false; clearTimeout(t); };
  }, [poll, refreshViews, refreshQuote]);

  const tr = current ? tracks[current.marketId.toLowerCase()] ?? blank() : blank();
  const pv = previous ? tracks[previous.marketId.toLowerCase()] ?? blank() : blank();
  const left = current ? Math.max(0, current.close - now) : 0;
  const elapsed = current ? Math.min(current.seconds, Math.max(0, now - current.start)) : 0;
  const nextAttemptAt = current && cfg && tr.attempts < cfg.max && !tr.gaveUp && !tr.opened
    ? current.start + cfg.first + tr.attempts * cfg.retry : null;
  const q = quote && current && quote.marketId === current.marketId.toLowerCase() ? quote.q : null;
  const shown = current ?? (mounted ? null : initial);
  const move = shown && spot !== null && shown.openPrice > 0 ? (spot - shown.openPrice) / shown.openPrice : null;

  return (
    <section className="winWatch" aria-labelledby="ww-h">
      <div className="wwHead">
        <h2 id="ww-h" className="wwEyebrow">Live window</h2>
        <span className="wwSeries">ETH · one-minute{shown ? <> · <span className="mono">#{parseInt(shown.marketId, 16)}</span></> : null}</span>
      </div>

      {/* ---------------------------------------------------------------- the clock */}
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
      {shown && (
        <p className="wwPrice">
          Strike <strong>{px(shown.openPrice)}</strong>, the price at the open
          {move !== null && spot !== null && <> · now <strong>{px(spot)}</strong>{" "}
            <span className={move < 0 ? "down" : "up"}>({move >= 0 ? "+" : ""}{(move * 100).toFixed(3)}%)</span></>}.
          {" "}Cover pays if ETH closes below the strike.
        </p>
      )}

      {/* ---------------------------------------------------------------- this window, for this wallet */}
      <div className="wwState">
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
                <span className="tag">Before cover opens</span>{" "}
                If Ballast bought now it would pay <strong>{usd(q.premium)} tUSDC</strong> for{" "}
                <strong>{qtyOf(q.qty)}</strong> Down contracts at {(Number(q.coverPrice) / 1e6).toFixed(3)} —
                a payout of <strong>{qtyOf(q.qty)} tUSDC</strong> if ETH closes below the strike, making you whole at{" "}
                {pct(q.achievedBps)} of a fall{q.achievedBps < q.requestedBps
                  ? <> (you asked {pct(q.requestedBps)}; {q.shortBy})</> : null}.
              </p>
            ) : q?.kind === "decline" ? (
              <p className="wwLine">
                <span className="tag down">Would decline</span>{" "}
                <strong>{REASON[q.reason]?.[0] ?? q.reason}</strong> — {REASON[q.reason]?.[1] ?? ""}.
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
            ) : nextAttemptAt !== null && nextAttemptAt > now ? (
              <p className="wwNote">Next attempt at {utcTime(nextAttemptAt)} UTC, {nextAttemptAt - current.start} s into the window.</p>
            ) : null}
          </>
        )}
      </div>

      {/* ---------------------------------------------------------------- the last window */}
      {mounted && previous && (
        <div className="wwLast">
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
      Bought <strong>{qtyOf(o.qty)}</strong> Down contracts for <strong>{usd(o.premium)} tUSDC</strong>
      {o.coverPrice > 0n && <> at {(Number(o.coverPrice) / 1e6).toFixed(3)}</>}. Pays{" "}
      <strong>{qtyOf(o.qty)} tUSDC</strong> if ETH closes below the strike, making you whole at{" "}
      {pct(o.achievedBps)} of a fall{why ? <> — you asked {pct(o.requestedBps)}; {why}</> : null}.
      {o.tx && <> <a href={`${EXPLORER}/tx/${o.tx}`}>tx</a></>}
    </p>
  );
}

function NotReady({ s, hasPolicy, q }: {
  s: NonNullable<ReturnType<typeof useWallet>["s"]>; hasPolicy: boolean; q: Quote | null;
}) {
  const missing = !hasPolicy ? "set a load line" : !s.enrolled ? "enrol" : "deposit collateral";
  const price = q && q.kind === "decline" ? q.coverPrice : q?.kind === "buy" ? q.coverPrice : null;
  const noExposure = q?.kind === "decline" && q.reason === "NoExposure";
  return (
    <p className="wwLine">
      <span className="tag">Not covered</span>{" "}
      Ballast will not buy for this wallet in this window — it has yet to {missing}. Once it has, the
      engine sizes cover against your WETH at its first attempt, 15 s into each window
      {noExposure ? <>; right now it would decline, because <strong>this wallet holds no WETH</strong></>
        : price !== null ? <>; the book prices a Down contract at <strong>{(Number(price) / 1e6).toFixed(3)}</strong> right now</>
        : null}.
    </p>
  );
}
