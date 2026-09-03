"use client";

import { useState } from "react";
import type { Address } from "viem";
import { formatUnits } from "viem";
import { somniaTestnet } from "viem/chains";
import { ADDR } from "@/lib/chain";
import { useWallet } from "./wallet";
import TxStatus from "./TxStatus";
import { GAS, WETH, erc20, vaultAbi } from "./onchain";
import { NoGasBanner } from "./TopBar";

const usd = (v: bigint) => (Number(v) / 1e6).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Money in, money out, and the two test tokens. */
export default function FundsActions() {
  const { ready, hasProvider, account, chainOk, s, busy, err, tx, connect, send } = useWallet();
  const [amount, setAmount] = useState("1000");

  if (!ready || !hasProvider || !account) {
    /* The disconnected view used to be one short paragraph, which left most of the page empty
       and gave a reader no idea what this surface actually does. It now shows the four actions
       it offers, visibly inert. Nothing here pretends to work: every control is disabled and
       says why, which is the honest version of a preview. */
    return (
      <div className="panel">
        <h3>{hasProvider ? "Connect to move funds" : "No wallet in this browser"}</h3>
        <p className="why">
          The vault figures above are read from the chain and are correct whether or not you
          connect. {hasProvider
            ? "Depositing, withdrawing and minting need a wallet."
            : "To transact, open this in a browser with an EVM wallet installed."}
        </p>
        {hasProvider && (
          <button type="button" className="btn" onClick={connect}>Connect wallet</button>
        )}

        <ul className="actionPreview">
          {[
            ["Mint test tUSDC", "10,000 per claim, repeatable — this is a testnet faucet, not a purchase."],
            ["Deposit into the vault", "Two steps: approve the token, then deposit. Ballast holds it as collateral."],
            ["Withdraw", "Unconditional on the free balance. Cover that is still open holds the rest until it settles."],
            ["Mint test WETH", "Gives the account exposure for the engine to measure and cover."],
          ].map(([title, why]) => (
            <li key={title}>
              <span className="actionName">{title}</span>
              <span className="actionWhy">{why}</span>
            </li>
          ))}
        </ul>
        <p className="why" style={{ marginBottom: 0 }}>
          Revoking a policy and withdrawing are always one action away and never gated on the
          engine running.
        </p>
      </div>
    );
  }

  if (!chainOk) return <div className="panel warn"><h3>Wrong network</h3><p className="why">Switch to Somnia Shannon testnet from the top bar.</p></div>;
  if (!s) return <div className="panel"><p className="why">Reading your balances…</p></div>;

  const approved = s.allowance >= 1_000_000_000n;
  const amt = (() => { const n = Number(amount); return Number.isFinite(n) && n > 0 ? BigInt(Math.round(n * 1e6)) : 0n; })();
  const overWallet = amt > s.tusdc;
  const overFree = amt > s.free;

  return (
    <>
      {s.stt === 0n && <NoGasBanner />}
      <TxStatus />

      <div className="polGrid">
        <div className="panel">
          <h3>Your balances</h3>
          <dl className="kv">
            <dt>tUSDC in this wallet</dt><dd>{usd(s.tusdc)}</dd>
            <dt>In the vault</dt><dd>{usd(s.collateral)}</dd>
            <dt>Withdrawable now</dt><dd className="up">{usd(s.free)}</dd>
            <dt>Held against open cover</dt><dd>{usd(s.reserved)}</dd>
            <dt>WETH held</dt><dd>{formatUnits(s.weth, 18).slice(0, 8)}</dd>
          </dl>

          <label className="field" style={{ marginTop: 18 }}>
            <span>Amount, tUSDC</span>
            <input type="number" min={0} step={100} value={amount}
              onChange={(e) => setAmount(e.target.value)} />
            <small>
              {overWallet && amt > 0 ? "more than this wallet holds — the deposit would revert" : ""}
              {!overWallet && overFree && amt > 0 ? "more than is unreserved — the withdrawal would revert" : ""}
              {!overWallet && !overFree ? " " : ""}
            </small>
          </label>

          {/* Approving and depositing are two transactions and are shown as two. Hiding that
              behind one spinner would misrepresent what is being signed. */}
          {!approved ? (
            <button type="button" className="btn" disabled={!!busy}
              onClick={() => send("Approve", (w) => (w as never as { writeContract: Function }).writeContract({
                address: ADDR.tusdc as Address, abi: erc20, functionName: "approve",
                args: [ADDR.vault as Address, 1_000_000_000_000n], gas: GAS.approve,
                chain: somniaTestnet, account: account!,
              }))}>
              {busy === "Approve" ? "Confirming…" : "1 of 2 · Approve tUSDC"}
            </button>
          ) : (
            <button type="button" className="btn" disabled={!!busy || amt === 0n || overWallet}
              onClick={() => send("Deposit", (w) => (w as never as { writeContract: Function }).writeContract({
                address: ADDR.vault as Address, abi: vaultAbi, functionName: "deposit",
                args: [amt], gas: GAS.deposit, chain: somniaTestnet, account: account!,
              }))}>
              {busy === "Deposit" ? "Confirming…" : `2 of 2 · Deposit ${amount} tUSDC`}
            </button>
          )}{" "}
          <button type="button" className="btn ghost" disabled={!!busy || amt === 0n || overFree}
            onClick={() => send("Withdraw", (w) => (w as never as { writeContract: Function }).writeContract({
              address: ADDR.vault as Address, abi: vaultAbi, functionName: "withdraw",
              args: [amt], gas: GAS.withdraw, chain: somniaTestnet, account: account!,
            }))}>
            {busy === "Withdraw" ? "Confirming…" : "Withdraw"}
          </button>
          <p className="why" style={{ marginTop: 16, marginBottom: 0 }}>
            Withdrawal of unreserved collateral is unconditional. No operator can block or delay
            it, and reserved collateral releases automatically when its window settles.
          </p>
        </div>

        <div className="panel">
          <h3>Test tokens</h3>
          <p className="why">Both are freely mintable on this testnet. Neither costs anything but gas.</p>

          <dl className="kv" style={{ marginBottom: 18 }}>
            <dt>tUSDC — the collateral</dt><dd>{usd(s.tusdc)}</dd>
            <dt>WETH — the exposure</dt><dd>{formatUnits(s.weth, 18).slice(0, 8)}</dd>
          </dl>

          <button type="button" className="btn" disabled={!!busy}
            onClick={() => send("Faucet", (w) => (w as never as { writeContract: Function }).writeContract({
              address: ADDR.tusdc as Address, abi: erc20, functionName: "faucet",
              args: [10_000_000_000n], gas: GAS.faucet, chain: somniaTestnet, account: account!,
            }))}>
            {busy === "Faucet" ? "Confirming…" : "Mint 10,000 tUSDC"}
          </button>{" "}
          <button type="button" className="btn ghost" disabled={!!busy}
            onClick={() => send("Mint WETH", (w) => (w as never as { writeContract: Function }).writeContract({
              address: WETH, abi: erc20, functionName: "mint",
              args: [account!, 10n ** 18n], gas: GAS.mint, chain: somniaTestnet, account: account!,
            }))}>
            {busy === "Mint WETH" ? "Confirming…" : "Mint 1 test ETH"}
          </button>

          <div className="stateBox" style={{ marginTop: 18 }}>
            <h4>Buying on dreamDEX instead</h4>
            <p>
              You can buy WETH on the spot pool rather than minting it, and Ballast will measure
              it the same way — but keep it to <strong>one book level</strong>. The visible ask
              side is about $955 deep, and taking all of it leaves the book one-sided, at which
              point the exposure source can no longer price your position and reads it as zero.
              Minting never touches the book.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
