"use client";

import { useMemo, useState } from "react";
import type { Address } from "viem";
import { somniaTestnet } from "viem/chains";
import { ADDR } from "@/lib/chain";
import { size } from "@/lib/sizing";
import { useWallet } from "./wallet";
import TxStatus from "./TxStatus";
import { GAS, vaultAbi, engineAbi } from "./onchain";

const DAY = 86_400;
const usd = (v: number) => v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Read and write the policy, priced against the live book as you move it.
 *
 * Current sits beside proposed throughout, so a change reads as a change rather than as a
 * form that happens to be pre-filled. The achieved make-whole point is shown, never the
 * requested one, with the reason whenever a limit binds — a position that quietly delivers
 * less than asked is the failure this product exists to avoid.
 */
type Policy = { active: boolean; makeWholeBps: number; premiumBps: number; expiry: number; notionalCap: number };

type Props = {
  book: { coverPrice: number; bookQty: number; lotSize: number; priceable: boolean };
  exposure: number;
  current: Policy;
};

/**
 * The shell decides WHOSE policy is being edited before the form exists.
 *
 * This split is not cosmetic. The form seeds its sliders with `useState`, which reads its
 * initial value exactly once, on mount. When the form mounted before the connected wallet's
 * own policy had been read from the chain, those seeds froze the DEMONSTRATION account's
 * settings in as the reader's proposed policy -- and, because the seeds never resynced, they
 * stayed there. The reader was shown someone else's numbers as their own, and the diff
 * compared against a policy they had never set. Mounting the form only once the base is
 * settled makes that unrepresentable rather than merely unlikely.
 *
 * The `key` finishes the argument: when the underlying policy genuinely changes -- a
 * different account, or a write of our own landing -- the form remounts and reseeds from the
 * new truth, instead of holding edits that are no longer relative to anything.
 */
export default function PolicyEditor(props: Props) {
  const { settled, sErr, hasProvider, account, chainOk, s } = useWallet();

  /* Unknown is a third state. Gated on `hasProvider` rather than `settled` alone so the
     server, which has no injected provider, still renders the real form for a reader with
     no JavaScript -- seeded from the demonstration account and captioned as such. */
  const pending = (hasProvider && !settled) || (settled && !!account && chainOk && !s && !sErr);
  if (pending) {
    return (
      <>
        <p className="srOnly" role="status">Reading this wallet&rsquo;s current policy.</p>
        <div className="polGrid" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div className="panel" key={i}>
              <div className="skel skelLine w45" style={{ height: 15, marginTop: 0 }} />
              <div className="skel skelLine w90" />
              <div className="skel skelPanel" />
            </div>
          ))}
        </div>
        {/* The diff and the revoke panel state things about the reader's own policy too, so
            they are held as well rather than left showing the demonstration account's. */}
        <div className="panel diffPanel" aria-busy="true">
          <div className="skel skelLine w45" style={{ height: 15, marginTop: 0 }} />
          <div className="skel skelPanel" />
          <div className="skel skelBtn" />
        </div>
        <div className="panel exit" aria-busy="true">
          <div className="skel skelLine w45" style={{ height: 15, marginTop: 0 }} />
          <div className="skel skelLine w90" />
          <div className="skel skelBtn" />
        </div>
      </>
    );
  }

  /* `current` arrives from the server as the DEMONSTRATION account's policy. Once a wallet is
     connected, the policy being edited is that wallet's own -- reading the demo's as "current"
     showed a connected reader someone else's settings as theirs, and made the diff below
     compare against a policy they had never set. */
  const mine: Policy | null = account && s?.policy
    ? { active: s.policy[0], makeWholeBps: Number(s.policy[1]), premiumBps: Number(s.policy[2]),
        expiry: Number(s.policy[3]), notionalCap: Number(s.policy[4]) / 1e6 }
    : null;
  const base = mine ?? props.current;
  const k = `${account ?? "none"}:${base.active}:${base.makeWholeBps}:${base.premiumBps}:${base.notionalCap}:${base.expiry}`;

  return <PolicyForm key={k} book={props.book} exposure={props.exposure} base={base} mine={!!mine} />;
}

function PolicyForm({
  book, exposure, base, mine,
}: {
  book: Props["book"]; exposure: number; base: Policy; mine: boolean;
}) {
  const { account, chainOk, busy, err, tx, send, s } = useWallet();

  const [bps, setBps] = useState(base.makeWholeBps || 250);
  const [ceil, setCeil] = useState(base.premiumBps || 300);
  const [cap, setCap] = useState(base.notionalCap || 2000);
  // Hold the expiry as a timestamp rather than a day count. Deriving it from "days from now"
  // could never reproduce the existing expiry exactly, so the diff opened showing a change
  // nobody made -- precisely the noise the current-beside-proposed layout exists to remove.
  const [expiry, setExpiry] = useState(() =>
    base.active && base.expiry > Date.now() / 1000
      ? base.expiry
      : Math.floor(Date.now() / 1000) + 30 * DAY);
  const days = Math.max(1, Math.round((expiry - Date.now() / 1000) / DAY));

  const sized = useMemo(() => size({
    exposure, coverPrice: book.coverPrice, lotSize: book.lotSize, bookQty: book.bookQty,
    premiumCeilingBps: ceil, notionalCapUsd: cap, bps,
  }), [exposure, book, ceil, cap, bps]);

  const changed = bps !== base.makeWholeBps || ceil !== base.premiumBps || cap !== base.notionalCap || expiry !== base.expiry;
  const canWrite = !!account && chainOk;

  return (
    <>
      <TxStatus />

      <div className="polGrid" data-own="">
        <div className="panel">
          <h3>Make-whole point</h3>
          <p className="why">How deep a fall you want covered in full.</p>

          <label className="dial">
            <span className="dialTop">
              <span>Cover a fall of</span>
              <b>{(bps / 100).toFixed(2)}%</b>
            </span>
            <input type="range" min={50} max={500} step={10} value={bps}
              onChange={(e) => setBps(Number(e.target.value))}
              style={{ ["--fill" as string]: `${((bps - 50) / 450) * 100}%` } as React.CSSProperties}
              aria-label="Make-whole point in basis points" />
            <span className="dialScale" aria-hidden="true"><span>0.50%</span><span>5.00%</span></span>
            <span className="dialFoot">{bps} basis points</span>
          </label>

          {book.priceable ? (
            <dl className="kv">
              <dt>Down price now</dt><dd>{book.coverPrice.toFixed(3)}</dd>
              <dt>Contracts</dt><dd>{sized.qty.toFixed(0)}</dd>
              <dt>Premium per window</dt><dd>{usd(sized.premium)} tUSDC</dd>
              <dt>You would actually get</dt>
              <dd className={sized.binding ? "down" : "up"}>
                <strong>{sized.achievedBps} bps</strong>
                {sized.binding && <span className="bindWhy">{sized.binding}</span>}
              </dd>
            </dl>
          ) : (
            <div className="stateBox">
              <h4>The book is unpriceable right now</h4>
              <p>
                The current window&rsquo;s Down side is one-sided, so there is no price to size
                against. Rather than show a made-up number, this waits — which is exactly what
                the engine does with a book it cannot price. The policy can still be set.
              </p>
            </div>
          )}
        </div>

        <div className="panel">
          <h3>Limits</h3>
          <p className="why">Both are per window, and both are checked on every purchase.</p>

          <label className="field">
            <span>Premium ceiling</span>
            <input type="number" min={10} max={1000} step={10} value={ceil}
              onChange={(e) => setCeil(Number(e.target.value))} />
            <small>basis points of your exposure — {usd((exposure * ceil) / 10_000)} tUSDC at today&rsquo;s exposure</small>
          </label>

          <label className="field">
            <span>Notional cap</span>
            <input type="number" min={100} max={100000} step={100} value={cap}
              onChange={(e) => setCap(Number(e.target.value))} />
            <small>tUSDC of cover bought in any one window</small>
          </label>

          <label className="field">
            <span>Expires in</span>
            <input type="number" min={1} max={365} value={days}
              onChange={(e) => setExpiry(Math.floor(Date.now() / 1000) + Math.max(1, Number(e.target.value)) * DAY)} />
            <small>days · {new Date(expiry * 1000).toISOString().slice(0, 10)}</small>
          </label>
        </div>
      </div>

      {/* Current beside proposed, so a change reads as a change. */}
      <div className="panel diffPanel" data-own="">
        <h3>{base.active ? "What would change" : "What you would set"}</h3>
        <p className="why" style={{ marginTop: -4 }}>
          {mine ? "Current is this wallet\u2019s own policy, read from the chain." :
           account ? "This wallet has no policy yet, so there is nothing to compare against." :
           "Connect a wallet to compare against your own policy; the current column is the demonstration account\u2019s."}
        </p>
        <table className="diff">
          <thead><tr><th></th><th>Now</th><th>Proposed</th></tr></thead>
          <tbody>
            <Diff k="Make whole a fall of" now={base.active ? `${(base.makeWholeBps / 100).toFixed(2)}%` : "—"} next={`${(bps / 100).toFixed(2)}%`} />
            <Diff k="Premium ceiling" now={base.active ? `${base.premiumBps} bps` : "—"} next={`${ceil} bps`} />
            <Diff k="Notional cap" now={base.active ? `${usd(base.notionalCap)} tUSDC` : "—"} next={`${usd(cap)} tUSDC`} />
            <Diff k="Expires" now={base.active ? new Date(base.expiry * 1000).toISOString().slice(0, 10) : "—"}
              next={new Date(expiry * 1000).toISOString().slice(0, 10)} />
          </tbody>
        </table>

        <button type="button" className="btn" disabled={!canWrite || !!busy}
          title={!account ? "Connect a wallet to change the policy" : undefined}
          onClick={() => send("Set policy", (w) => (w as never as { writeContract: Function }).writeContract({
            address: ADDR.vault as Address, abi: vaultAbi, functionName: "setPolicy",
            args: [bps, ceil, BigInt(Math.round(cap * 1e6)), BigInt(expiry)],
            gas: GAS.setPolicy, chain: somniaTestnet, account: account!,
          }))}>
          {busy === "Set policy" ? "Confirming…" : base.active ? (changed ? "Apply the change" : "Renew unchanged") : "Set the policy"}
        </button>
        {!account && <span className="hint">Connect a wallet to change it. Everything here is readable without one.</span>}
      </div>

      <div className="panel exit" data-own="">
        <h3>Revoke</h3>
        <p className="why">
          <strong>One action, immediate, and no operator can block or delay it.</strong> Revoking
          stops new cover from being bought at the next window. Cover already open is untouched:
          it runs to settlement and pays out to you as normal, and your collateral stays
          withdrawable throughout. This is not a withdrawal and it does not close positions.
        </p>
        <p className="why">
          It also does not remove you from the cursor set. <code>revoke()</code> clears the
          policy, which is what stops the buying — the engine finds no consent and skips. Leaving
          the set is a second transaction, <code>withdrawEnrolment()</code>, and it is below.
          Neither is a prerequisite for the other and neither can be blocked.
        </p>
        <button type="button" className="btn ghost" disabled={!canWrite || !!busy || !s?.policy?.[0]}
          onClick={() => send("Revoke", (w) => (w as never as { writeContract: Function }).writeContract({
            address: ADDR.vault as Address, abi: vaultAbi, functionName: "revoke",
            args: [], gas: GAS.revoke, chain: somniaTestnet, account: account!,
          }))}>
          {busy === "Revoke" ? "Confirming…" : "Revoke the policy"}
        </button>
        {s?.enrolled && (
          <button type="button" className="btn ghost" style={{ marginLeft: 8 }}
            disabled={!canWrite || !!busy}
            onClick={() => send("Leave the cursor set", (w) => (w as never as { writeContract: Function }).writeContract({
              address: ADDR.engine as Address, abi: engineAbi, functionName: "withdrawEnrolment",
              args: [], gas: GAS.enrol, chain: somniaTestnet, account: account!,
            }))}>
            {busy === "Leave the cursor set" ? "Confirming…" : "Leave the cursor set"}
          </button>
        )}
      </div>
    </>
  );
}

function Diff({ k, now, next }: { k: string; now: string; next: string }) {
  const same = now === next;
  return (
    <tr className={same ? "" : "changed"}>
      <th scope="row">{k}</th>
      <td className="dim">{now}</td>
      <td className={same ? "dim" : "up"}>{next}{!same && <span className="arrow" aria-hidden="true"> ←</span>}</td>
    </tr>
  );
}
