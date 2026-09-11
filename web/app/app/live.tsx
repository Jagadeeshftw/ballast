"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { decodeEventLog, type Address, type PublicClient } from "viem";
import { ADDR } from "@/lib/chain";
import { ETH_KEY, engineEvents, engineViews, quoteFor, toWindows, type Quote, type Win } from "@/lib/window";
import { pub, useWallet } from "./wallet";

/**
 * One live feed for the whole Overview.
 *
 * The countdown, the cover panel and the summary all describe the same window and the same
 * wallet, and they used to be able to disagree: the countdown knew what had been bought this
 * window, the cover panel showed only what the policy asked for, and a reader saw 0.11% and
 * 2.50% one above the other with nothing to say which was in force. Everything that is
 * per-window and per-wallet is read here, once, and every panel renders from it.
 *
 * What it holds, and where each figure comes from:
 *   - `now`: chain time -- the latest block's timestamp, advanced locally between polls.
 *   - `current` / `previous`: the ETH one-minute window open now, and the one just closed,
 *     from the engine's own WindowEnqueued logs and the module's market rows.
 *   - `tracks[marketId]`: for the connected wallet, what happened in that window -- attempts,
 *     declines with reasons, the purchase (from a CoverOpened log or `coverOf`, both of which
 *     exist only once the fill is mined), the settlement, and the market's outcome.
 *   - `quote`: what the engine would do for this wallet right now -- its `_quote` replayed
 *     read for read at one block (lib/window.ts). A decline carries the engine's reason.
 *   - `spot`: the price the engine sizes against, from the same source.
 *
 * Nothing here is server-rendered except the window the server found; every figure that
 * implies a position exists only after hydration, for a connected wallet.
 */

export const SKIP = ["None", "PolicyInactiveOrExpired", "BelowEnrolmentFloor", "NoExposure", "NoLiquidity", "CoverTooExpensive",
  "NoHeadroom", "BelowMinimumLot", "AlreadyCovered", "PlacementFailed", "NoOpenPrice", "WouldMisrepresent"];

export const REASON: Record<string, [string, string]> = {
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

export type Opened = { qty: bigint; premium: bigint; coverPrice: bigint; requestedBps: number; achievedBps: number; tx: string | null };
export type Track = {
  opened: Opened | null;
  skips: { reason: string; tx: string }[];
  attempts: number;
  gaveUp: boolean;
  settled: { outcome: number; proceeds: bigint; tx: string | null } | null;
  /** 0 unresolved, 1 Down won, 2 Up won, 3 voided -- the engine's own reading of the market. */
  outcome: number;
};
export const blank = (): Track => ({ opened: null, skips: [], attempts: 0, gaveUp: false, settled: null, outcome: 0 });

export type Live = {
  mounted: boolean;
  now: number;
  current: Win | null;
  previous: Win | null;
  /** The window the server rendered, kept so the no-JS and first-paint markup agree. */
  initial: Win | null;
  tracks: Record<string, Track>;
  trackOf: (w: Win | null) => Track;
  quote: Quote | null;
  spot: number | null;
  cfg: { first: number; retry: number; max: number } | null;
  readFailed: boolean;
  /** How the engine's decision for the connected wallet stands in the current window. */
  phase: "none" | "waiting" | "evaluating" | "bought" | "declined" | "gaveUp";
};

const LiveCtx = createContext<Live | null>(null);
export function useLive(): Live {
  const c = useContext(LiveCtx);
  if (!c) throw new Error("useLive outside LiveProvider");
  return c;
}

const client = pub as unknown as PublicClient;

export function LiveProvider({ initial, serverNow, children }: { initial: Win | null; serverNow: number; children: React.ReactNode }) {
  const { settled: walletKnown, account, chainOk, s } = useWallet();
  const [mounted, setMounted] = useState(false);
  const [skew, setSkew] = useState(0);
  const [nowMs, setNowMs] = useState(serverNow * 1000);
  const [wins, setWins] = useState<Win[]>(initial ? [initial] : []);
  const [tracks, setTracks] = useState<Record<string, Track>>({});
  const [spot, setSpot] = useState<number | null>(null);
  const [quote, setQuote] = useState<{ marketId: string; q: Quote } | null>(null);
  const [cfg, setCfg] = useState<Live["cfg"]>(null);
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
          const opened = t.opened ?? (c[0] > 0n ? { qty: c[0], premium: c[1], coverPrice: (c[1] * 1_000_000n) / c[0],
            requestedBps: Number(c[2]), achievedBps: Number(c[3]), tx: null } : null);
          const settled = t.settled ?? (c[5] ? { outcome: Number(c[6]), proceeds: c[7], tx: null } : null);
          return opened === t.opened && settled === t.settled ? ts : { ...ts, [k]: { ...t, opened, settled } };
        })).catch(() => {}));
      if (w.close <= nowRef.current) jobs.push(client.readContract({ address: ADDR.engine as Address, abi: engineViews, functionName: "outcomeOf", args: [w.marketId] })
        .then((o) => setTracks((ts) => { const t = ts[k] ?? blank(); return t.outcome === Number(o) ? ts : { ...ts, [k]: { ...t, outcome: Number(o) } }; }))
        .catch(() => {}));
    }
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

  useEffect(() => {
    Promise.all([
      client.readContract({ address: ADDR.engine as Address, abi: engineViews, functionName: "initialDelaySeconds" }),
      client.readContract({ address: ADDR.engine as Address, abi: engineViews, functionName: "retryDelaySeconds" }),
      client.readContract({ address: ADDR.engine as Address, abi: engineViews, functionName: "maxAttempts" }),
    ]).then(([f, r, m]) => setCfg({ first: Number(f), retry: Number(r), max: Number(m) })).catch(() => {});
  }, []);

  const curRef = useRef(current); curRef.current = current;
  const prevRef = useRef(previous); prevRef.current = previous;
  useEffect(() => {
    let alive = true; let t: ReturnType<typeof setTimeout>; let n = 0;
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

  const trackOf = (w: Win | null) => (w ? tracks[w.marketId.toLowerCase()] ?? blank() : blank());
  const q = quote && current && quote.marketId === current.marketId.toLowerCase() ? quote.q : null;
  const tr = trackOf(current);
  const phase: Live["phase"] = !current || !connected ? "none"
    : tr.opened ? "bought"
    : tr.gaveUp ? "gaveUp"
    : tr.skips.length > 0 && (cfg ? tr.attempts >= cfg.max : false) ? "declined"
    : tr.skips.length > 0 ? "declined"
    : cfg && now >= current.start + cfg.first ? "evaluating"
    : "waiting";

  return (
    <LiveCtx.Provider value={{ mounted, now, current, previous, initial, tracks, trackOf, quote: q, spot, cfg, readFailed, phase }}>
      {children}
    </LiveCtx.Provider>
  );
}
