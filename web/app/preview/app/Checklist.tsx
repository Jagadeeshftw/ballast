"use client";

import type { Address } from "viem";
import { somniaTestnet } from "viem/chains";
import { ADDR } from "@/lib/chain";
import { useWallet } from "./wallet";
import { GAS, WETH, erc20, vaultAbi, engineAbi } from "./onchain";
import { NoGasBanner } from "./TopBar";

/**
 * A checklist, not a wizard.
 *
 * The production difference is real rather than cosmetic: a wizard assumes you arrive once,
 * in order, and finish. A returning account is none of those things — it may be half set up,
 * may have done steps out of order, may have withdrawn and be starting again. Every row here
 * states its own condition and carries its own action, so any entry point is a valid one.
 *
 * Blocked rows say WHY they are blocked rather than being greyed out silently.
 */
export default function Checklist() {
  const { ready, hasProvider, account, chainOk, connecting, s, busy, err, tx, connect, switchChain, send } = useWallet();

  if (!ready) return <div className="panel"><p className="why">Looking for a wallet…</p></div>;

  if (!hasProvider) {
    return (
      <div className="panel">
        <h3>No wallet in this browser</h3>
        <p className="why">
          Everything on this dashboard is readable without one — the figures above and the
          history below are read from the chain at request time. To transact, open this in a
          browser with an EVM wallet installed.
        </p>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="panel">
        <h3>Connect to set up your own cover</h3>
        <p className="why">
          Somnia Shannon testnet, chain 50312. If your wallet does not carry the network,
          connecting offers to add it. Everything below stays readable either way.
        </p>
        <button type="button" className="btn" onClick={connect} disabled={connecting}>
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>
        {err && <p className="err">{err}</p>}
      </div>
    );
  }

  if (!chainOk) {
    return (
      <div className="panel warn">
        <h3>Wrong network</h3>
        <p className="why">This wallet is on another chain. Ballast lives on Somnia Shannon testnet, 50312.</p>
        <button type="button" className="btn" onClick={switchChain}>Switch to Somnia</button>
        {err && <p className="err">{err}</p>}
      </div>
    );
  }

  if (!s) return <div className="panel"><p className="why">Reading your position from the chain…</p></div>;

  const noGas = s.stt === 0n;
  const policyLive = s.policy[0] && Number(s.policy[3]) * 1000 > Date.now();
  const approved = s.allowance >= 1_000_000_000n;

  const rows = [
    {
      k: "dollars", label: "Get test dollars",
      done: s.tusdc > 0n || s.collateral > 0n,
      why: "tUSDC is the collateral Ballast spends on premium. The faucet caps each call at 10,000 — per call, not per day.",
      action: { text: "Mint 10,000 tUSDC", what: "Faucet", run: (w: never) => (w as never as { writeContract: Function }).writeContract({
        address: ADDR.tusdc as Address, abi: erc20, functionName: "faucet",
        args: [10_000_000_000n], gas: GAS.faucet, chain: somniaTestnet, account: account!,
      }) },
    },
    {
      k: "eth", label: "Get test ETH",
      done: s.weth > 0n,
      why: "Ballast covers exposure it can measure you holding, so you need to actually hold something. Testnet WETH is openly mintable — one transaction, no approval, and it never touches the order book.",
      action: { text: "Mint 1 test ETH", what: "Mint WETH", run: (w: never) => (w as never as { writeContract: Function }).writeContract({
        address: WETH, abi: erc20, functionName: "mint",
        args: [account!, 10n ** 18n], gas: GAS.mint, chain: somniaTestnet, account: account!,
      }) },
    },
    {
      k: "deposit", label: approved ? "Deposit collateral" : "Approve, then deposit",
      done: s.collateral > 0n,
      blocked: s.tusdc === 0n && s.collateral === 0n ? "no tUSDC in this wallet yet — do the step above first" : null,
      why: approved
        ? "Deposited collateral is what premium is paid from. It stays yours and unreserved collateral is withdrawable at any moment."
        : "Approving and depositing are two transactions on chain, and they are shown as two. Hiding that behind one spinner would misrepresent what you are signing.",
      action: approved
        ? { text: "Deposit 1,000 tUSDC", what: "Deposit", run: (w: never) => (w as never as { writeContract: Function }).writeContract({
            address: ADDR.vault as Address, abi: vaultAbi, functionName: "deposit",
            args: [s.tusdc < 1_000_000_000n ? s.tusdc : 1_000_000_000n], gas: GAS.deposit, chain: somniaTestnet, account: account!,
          }) }
        : { text: "1 of 2 · Approve tUSDC", what: "Approve", run: (w: never) => (w as never as { writeContract: Function }).writeContract({
            address: ADDR.tusdc as Address, abi: erc20, functionName: "approve",
            args: [ADDR.vault as Address, 1_000_000_000_000n], gas: GAS.approve, chain: somniaTestnet, account: account!,
          }) },
    },
    {
      k: "policy", label: "Set the load line",
      done: policyLive,
      why: "How deep a fall you want made whole, and the most you will pay for it per window. That is the whole of the policy.",
      href: "/preview/app/policy", hrefText: policyLive ? "Change it" : "Set it on Policy",
    },
    {
      k: "enrol", label: "Enrol",
      done: s.enrolled,
      blocked: !policyLive ? "enrolling needs an active policy — set the load line first" : null,
      why: "Joining the cursor set is what puts you in front of the callback. From then on Ballast reacts in the same block every window opens.",
      action: { text: "Enrol", what: "Enrol", run: (w: never) => (w as never as { writeContract: Function }).writeContract({
        address: ADDR.engine as Address, abi: engineAbi, functionName: "enrol",
        args: [], gas: GAS.enrol, chain: somniaTestnet, account: account!,
      }) },
    },
  ];

  const firstOpen = rows.find((r) => !r.done && !r.blocked)?.k;
  const allDone = rows.every((r) => r.done);

  return (
    <>
      {noGas && <NoGasBanner />}
      {err && <p className="err">{err}</p>}
      {tx && (
        <p className="txline">
          {tx.what} sent — <a href={`https://shannon-explorer.somnia.network/tx/${tx.hash}`} target="_blank" rel="noreferrer">
            {tx.hash.slice(0, 18)}…</a>
        </p>
      )}

      {allDone ? (
        <div className="panel ok">
          <p className="live"><i aria-hidden="true" />Set up and enrolled.</p>
          <p className="why">
            Your policy is live and Ballast is watching your windows. Nothing further is
            required — the rest of this dashboard is for watching and for leaving.
          </p>
        </div>
      ) : (
        <ol className="check">
          {rows.map((r) => (
            <li key={r.k} className={r.done ? "done" : r.blocked ? "blocked" : r.k === firstOpen ? "now" : ""}>
              <span className="checkMark" aria-hidden="true">{r.done ? "✓" : r.blocked ? "—" : "○"}</span>
              <div className="checkBody">
                <h4>{r.label}</h4>
                <p>{r.blocked ?? r.why}</p>
              </div>
              <div className="checkAct">
                {r.done ? <span className="tag up">done</span>
                  : r.blocked ? <span className="tag dim">waiting</span>
                  : "href" in r && r.href ? <a className="btn small" href={r.href}>{r.hrefText}</a>
                  : <button type="button" className="btn small" disabled={!!busy || noGas}
                      onClick={() => send(r.action!.what, r.action!.run as never)}>
                      {busy === r.action!.what ? "Confirming…" : r.action!.text}
                    </button>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
