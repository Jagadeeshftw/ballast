"use client";

import { useState } from "react";
import type { Address } from "viem";
import { somniaTestnet } from "viem/chains";
import { ADDR } from "@/lib/chain";
import { useWallet } from "./wallet";
import { GAS, engineAbi } from "./onchain";

/**
 * Settling is permissionless — anyone may close anyone's position, which is what makes this
 * safe to offer to a visitor who is not the account holder.
 *
 * There is no "settle everything" button because there cannot be one: `settleMany` batches
 * USERS for a single market, not markets for a single user, so one account's backlog is one
 * transaction per position. Rather than fake a bulk action that fires 43 wallet prompts, this
 * settles a bounded run and says exactly how many transactions that is.
 */
export function SettleButton({ user, marketId, label = "Settle" }: { user: string; marketId: string; label?: string }) {
  const { account, chainOk, busy, send } = useWallet();
  const disabled = !account || !chainOk || !!busy;
  return (
    <button type="button" className="btn small ghost" disabled={disabled}
      title={!account ? "Connect a wallet — settling is permissionless, so anyone can do it" : undefined}
      onClick={() => send(`Settle ${marketId.slice(-6)}`, (w) => (w as never as { writeContract: Function }).writeContract({
        address: ADDR.engine as Address, abi: engineAbi, functionName: "settle",
        args: [user as Address, marketId as `0x${string}`], gas: GAS.settle,
        chain: somniaTestnet, account: account!,
      }))}>
      {busy === `Settle ${marketId.slice(-6)}` ? "…" : label}
    </button>
  );
}

export function SettleRun({ user, marketIds }: { user: string; marketIds: string[] }) {
  const { account, chainOk, busy, send, refresh } = useWallet();
  const [done, setDone] = useState(0);
  const [running, setRunning] = useState(false);
  const batch = marketIds.slice(0, 5);

  if (marketIds.length === 0) return null;

  const run = async () => {
    setRunning(true); setDone(0);
    for (const m of batch) {
      // Sequential and awaited: each is a separate signature, and firing them together would
      // stack five prompts with no way to tell which failed.
      await send(`Settle ${m.slice(-6)}`, (w) => (w as never as { writeContract: Function }).writeContract({
        address: ADDR.engine as Address, abi: engineAbi, functionName: "settle",
        args: [user as Address, m as `0x${string}`], gas: GAS.settle,
        chain: somniaTestnet, account: account!,
      }));
      setDone((d) => d + 1);
    }
    setRunning(false);
    await refresh();
  };

  return (
    <div className="settleRun">
      <div>
        <strong>
          {marketIds.length === 1
            ? "1 position is unsettled."
            : `${marketIds.length} positions are unsettled.`}
        </strong>
        <p className="why">
          Settling is permissionless, so anyone can close {marketIds.length === 1 ? "it" : "these"} —
          you do not have to be the account holder. Each position is its own transaction: the
          engine&rsquo;s batch call groups users within one market, not markets within one user,
          so there is no single call that closes a backlog.{" "}
          {batch.length === 1 ? "This settles the oldest." : `This settles the ${batch.length} oldest.`}
        </p>
      </div>
      <button type="button" className="btn" onClick={run}
        disabled={!account || !chainOk || !!busy || running}>
        {running ? `Settling ${done + 1} of ${batch.length}…`
          : batch.length === 1 ? "Settle the oldest" : `Settle ${batch.length} oldest`}
      </button>
    </div>
  );
}
