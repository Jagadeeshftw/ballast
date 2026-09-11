"use client";

import { useWallet } from "./wallet";
import { utc } from "../data";

/**
 * Your setup: the configuration -- what you have told Ballast to do. Not what it is doing
 * (the live window) and not what is in force (the cover panel). It reads as a settings sheet
 * on purpose: a different surface, labels on the left, values on the right, nothing live.
 *
 * Disconnected, it describes what a setup consists of; the server renders that, which is the
 * true state for a reader with no wallet.
 */
const n2 = (v: number) => v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function remaining(expiry: number): string {
  const s = expiry - Math.floor(Date.now() / 1000);
  if (s <= 0) return "expired";
  const d = Math.floor(s / 86_400), h = Math.floor((s % 86_400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d} day${d === 1 ? "" : "s"} ${h} h left` : h > 0 ? `${h} h ${m} min left` : `${m} min left`;
}

export default function Setup() {
  const { settled, sErr, hasProvider, account, chainOk, s } = useWallet();
  const pending = (hasProvider && !settled) || (settled && !!account && chainOk && !s && !sErr);
  const connected = settled && !!account && chainOk;
  const p = s?.policy;
  const active = !!p?.[0] && Number(p[3]) * 1000 > Date.now();
  const set = !!p?.[0];

  const rows: [string, React.ReactNode, string?][] = connected && s ? [
    ["Protected asset", "ETH", "the WETH this wallet holds; Ballast reads the balance, you never type it"],
    ["Load line", set ? `${(Number(p![1]) / 100).toFixed(2)}%` : "—", "how deep a fall you want made whole"],
    ["Premium ceiling", set ? `${(Number(p![2]) / 100).toFixed(2)}% per window` : "—", "of exposure — the most one window may cost"],
    ["Notional cap", set ? `${n2(Number(p![4]) / 1e6)} tUSDC per window` : "—", "the most premium one window may commit"],
    ["Policy expiry", set ? <>{utc(Number(p![3])).slice(0, 16)} UTC <small>· {remaining(Number(p![3]))}</small></> : "—", "after which the engine can do nothing until you renew"],
    ["Status", <span className={`tag ${active && s.enrolled ? "up" : "dim"}`}>
      {!set ? "No policy" : !active ? "Policy expired" : !s.enrolled ? "Active, not enrolled" : "Active and enrolled"}
    </span>, active && s.enrolled ? "Ballast acts for this wallet every window" : "Ballast does nothing for this wallet"],
    ["Available tUSDC", `${n2(Number(s.free) / 1e6)} tUSDC`, `${n2(Number(s.collateral) / 1e6)} deposited, ${n2(Number(s.reserved) / 1e6)} reserved`],
  ] : [
    ["Protected asset", "ETH", "the WETH the connected wallet holds"],
    ["Load line", "—", "how deep a fall you want made whole"],
    ["Premium ceiling", "—", "the most one window may cost, as a share of exposure"],
    ["Notional cap", "—", "the most premium one window may commit"],
    ["Policy expiry", "—", "after which the engine can do nothing until you renew"],
    ["Status", <span className="tag dim">{connected ? "—" : "Not connected"}</span>, "whether Ballast acts for this wallet"],
    ["Available tUSDC", "—", "deposited collateral that premium is paid from"],
  ];

  return (
    <div className="setupPanel" data-own="" aria-busy={pending || undefined}>
      <div className="setupHead">
        <span className="setupEyebrow">Configuration</span>
        <span className="setupNote">What you have told Ballast to do. Change it on <a href="/app/policy">Policy</a> and <a href="/app/funds">Funds</a>.</span>
      </div>
      {pending ? (
        <>
          <p className="srOnly" role="status">Reading your configuration.</p>
          <div className="skel skelLine w90" /><div className="skel skelLine w75" /><div className="skel skelLine w45" />
        </>
      ) : (
        <dl className="setupRows">
          {rows.map(([k, v, note]) => (
            <div key={k}><dt>{k}</dt><dd>{v}{note && <span className="setupWhy">{note}</span>}</dd></div>
          ))}
        </dl>
      )}
    </div>
  );
}
