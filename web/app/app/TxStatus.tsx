"use client";

import { EXPLORER } from "@/lib/chain";
import { useWallet } from "./wallet";
import { cn } from "@/lib/cn";

/**
 * What a write is doing, while it does it.
 *
 * Before this, a write changed a button's label to "Confirming…" and then dropped a bare
 * transaction link on the page. Two states for something that has four, and no distinction
 * between "your wallet has not answered yet" and "the chain has not answered yet" — which are
 * the two waits people actually confuse.
 *
 * Adapted from the catalogue's `multi-step-loader` idea rather than the component: that one is
 * a full-screen overlay with three animate-from-hidden steps, which is far too much ceremony
 * for a deposit and would black out the figures the reader is checking against. This is a
 * strip that sits under the action it describes.
 *
 * The reverted state is the important one. `waitForTransactionReceipt` resolves for a revert,
 * so a mined-but-reverted write used to look identical to a successful one; now it says so,
 * and says the gas was still spent.
 */
const STEPS = ["Signing", "Sent", "Confirmed"] as const;

export default function TxStatus() {
  const { busy, tx, err } = useWallet();
  if (!busy && !tx && !err) return null;

  const reverted = !!err && /reverted/i.test(err);
  const at = err ? (reverted ? 1 : 0) : busy ? (tx ? 1 : 0) : 2;

  return (
    <div className="mt-4 rounded-xl border border-rule bg-raised p-4" role="status" aria-live="polite">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {STEPS.map((s, i) => {
          const done = i < at, now = i === at && !err, bad = i === at && !!err;
          return (
            <li key={s} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-4 place-items-center rounded-full border text-[9px] font-bold",
                  bad ? "border-lost bg-lost text-ground"
                    : done ? "border-paid bg-paid text-ground"
                    : now ? "border-signal text-signal" : "border-rule text-muted",
                )}
              >
                {bad ? "!" : done ? "✓" : i + 1}
              </span>
              <span className={cn("text-[13px]", (done || now || bad) ? "text-ink" : "text-muted")}>
                {bad && i === 1 ? "Reverted" : s}
              </span>
              {i < STEPS.length - 1 && <span aria-hidden="true" className="mx-1 h-px w-6 bg-rule" />}
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        {err ? (
          <span className="text-lost">{err}</span>
        ) : busy && !tx ? (
          <>Waiting for your wallet to sign <strong className="text-ink">{busy}</strong>. Nothing has been sent yet.</>
        ) : busy && tx ? (
          <>Sent. Waiting for the chain to include it — this is usually under a second on Somnia.</>
        ) : (
          <><strong className="text-ink">{tx?.what}</strong> confirmed. The figures above are re-read from the chain.</>
        )}
      </p>

      {tx && (
        <p className="mt-2 font-mono text-[12px]">
          <a href={`${EXPLORER}/tx/${tx.hash}`} target="_blank" rel="noreferrer">
            {tx.hash.slice(0, 22)}…
          </a>
        </p>
      )}
    </div>
  );
}
