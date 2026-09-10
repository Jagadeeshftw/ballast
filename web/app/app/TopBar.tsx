"use client";

import { useEffect, useRef, useState } from "react";
import { EXPLORER } from "@/lib/chain";
import { useWallet } from "./wallet";
import { FAUCETS } from "./onchain";
import ThemeToggle from "@/components/site/ThemeToggle";

/**
 * Network, engine, notifications, wallet.
 *
 * The zero-STT case is surfaced here rather than left to fail at a signature prompt:
 * estimation succeeds from an empty account, so nothing else would catch it until the wallet
 * refused, which is the worst possible place to learn it.
 */
export default function TopBar({
  engineLive, engineStale = false, engineNote, unread,
}: { engineLive: boolean | null; engineStale?: boolean; engineNote: string; unread: number }) {
  const { settled, hasProvider, account, chainOk, connecting, s, connect, disconnect } = useWallet();
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [menu]);

  const noGas = !!account && chainOk && s?.stt === 0n;

  return (
    <header className="tbar">
      <span className="chip">
        <i className="dot live" aria-hidden="true" />Somnia testnet
      </span>
      {/* Four states, not two. "stopped" and "we could not tell" are different claims, and
          showing the first when the second is true is the kind of small lie that costs a
          reader their trust in every other figure on the page. "stalled" is the fourth:
          subscribed, but not being woken -- which the chip used to report as "live". */}
      <span className={`chip ${engineLive === null ? "alert" : !engineLive || engineStale ? "warn" : ""}`} title={engineNote}>
        <i aria-hidden="true">⌁</i>
        {engineLive === null ? "engine unknown" : !engineLive ? "engine stopped" : engineStale ? "engine stalled" : "engine live"}
      </span>

      {noGas && (
        <a className="chip alert" href="#gas">
          <i aria-hidden="true">▲</i>no STT — writes will fail
        </a>
      )}

      <span className="tbarGap" />

      <ThemeToggle className="chip themeBtn" />

      {/* Was a bell badged "44 notifications". Nothing tracks read state, so none of them was
          ever unread, and all 44 are settlements from a run that finished -- a counter that
          can never decrement is theatre, and it linked to a view about something else. It is
          now what it actually is: a labelled count of settlements, pointing at them. */}
      {/* Sat beside the connected address with no owner named, so a reader took it for their
          own history. It is the demonstration account's, and it says so. */}
      <a className="chip bell" href="/app/activity?show=cover"
        title="Settled cover on the demonstration account — not on any wallet you connect">
        <i aria-hidden="true">◔</i>
        <b>{unread}</b>
        <span className="bellWord">settled · demo</span>
      </a>

      {/* `settled`, not `ready`: `ready` only means the provider has been looked for, and it
          is set before eth_accounts answers -- so a returning connected reader saw "Connect
          wallet" for a beat before their own address replaced it. */}
      {!settled ? (
        <span className="chip" aria-busy="true" title="Checking for a connected wallet">…</span>
      ) : !hasProvider ? (
        <span className="chip" title="No EVM wallet detected in this browser">read-only</span>
      ) : !account ? (
        <button type="button" className="tbarCta" onClick={connect} disabled={connecting}>
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>
      ) : !chainOk ? (
        <a className="chip alert" href="/app">wrong network</a>
      ) : (
        <div className="walletBox" ref={box}>
          <button type="button" className="chip wallet" onClick={() => setMenu((v) => !v)}
            aria-expanded={menu} aria-haspopup="menu">
            <i className="dot live" aria-hidden="true" />
            {account.slice(0, 6)}…{account.slice(-4)}
          </button>
          {menu && (
            <div className="walletMenu" role="menu">
              <button type="button" role="menuitem" onClick={async () => {
                try { await navigator.clipboard.writeText(account); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* denied */ }
              }}>{copied ? "Copied" : "Copy address"}</button>
              <a role="menuitem" href={`${EXPLORER}/address/${account}`} target="_blank" rel="noreferrer">View on explorer</a>
              <button type="button" role="menuitem" onClick={() => { disconnect(); setMenu(false); }}>Disconnect</button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}

/** Zero STT blocks every write, so it is stated wherever a write might be attempted. */
export function NoGasBanner() {
  const { account, chainOk, s, refresh } = useWallet();
  if (!account || !chainOk || !s || s.stt !== 0n) return null;
  return (
    <div className="panel warn" id="gas">
      <h3>This account has no STT</h3>
      <p className="why">
        Every transaction needs gas, and a brand-new account&rsquo;s first one costs about 1.4
        million gas — roughly 0.008 STT. Estimation succeeds from an empty account, so without
        this notice the failure would surface at the signature prompt. Claim once and come
        back; one claim covers this whole flow many times over.
      </p>
      <ul className="faucets">
        {FAUCETS.map(([n, u]) => <li key={u}><a href={u} target="_blank" rel="noreferrer">{n}</a></li>)}
      </ul>
      <p className="mono">{account}</p>
      <button type="button" className="btn ghost" onClick={refresh}>I have claimed — check again</button>
    </div>
  );
}
