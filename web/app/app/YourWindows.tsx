"use client";

import { EXPLORER } from "@/lib/chain";
import { useWallet } from "./wallet";
import { REASON, useLive } from "./live";

/**
 * The connected wallet's own recent windows -- premiums, declines, settlements, payouts --
 * from the live feed. Only rendered once the wallet is known and there is something to show;
 * otherwise the recorded history below stands alone, attributed to the demonstration account.
 */
const utcTime = (s: number) => new Date(s * 1000).toISOString().slice(11, 16);
const usd = (u: bigint) => (Number(u) / 1e6).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function YourWindows() {
  const { settled, account, chainOk } = useWallet();
  const { mounted, windows, trackOf, now } = useLive();
  if (!mounted || !settled || !account || !chainOk) return null;
  const rows = [...windows].sort((a, b) => b.start - a.start).map((w) => ({ w, t: trackOf(w) }))
    .filter(({ w, t }) => t.opened || t.skips.length || t.settled || w.close <= now);
  if (!rows.length) return null;

  return (
    <>
      <h3 className="feedH">Your windows this session</h3>
      <ol className="feed">
        {rows.map(({ w, t }) => {
          const o = t.opened;
          const kind = t.settled ? "settled" : o ? "opened" : t.skips.length ? "declined" : "engine";
          const title = t.settled ? `Settled · ${t.settled.proceeds > 0n ? "paid" : "nothing"}`
            : o ? "Cover opened" : t.skips.length ? `Declined · ${REASON[t.skips[t.skips.length - 1].reason]?.[0] ?? "—"}`
            : w.close <= now ? "Closed, nothing bought" : "Open";
          const detail = t.settled ? `${usd(t.settled.proceeds)} tUSDC credited against ${o ? usd(o.premium) : "—"} of premium`
            : o ? `${usd(o.premium)} tUSDC premium · made whole at ${(o.achievedBps / 100).toFixed(2)}%${t.outcome === 1 ? " · Down won, settle to credit the payout" : t.outcome === 2 ? " · Up won" : ""}`
            : t.skips.length ? (REASON[t.skips[t.skips.length - 1].reason]?.[1] ?? "") : "";
          const tx = t.settled?.tx ?? o?.tx ?? t.skips[t.skips.length - 1]?.tx ?? null;
          return (
            <li key={w.marketId}>
              <span className={`feedDot ${kind}`} aria-hidden="true" />
              <div><strong>{title} · #{parseInt(w.marketId, 16)}</strong><span className="feedDetail">{detail}</span></div>
              <span className="feedWhen">{utcTime(w.start)} UTC</span>
              {tx ? <a className="feedTx" href={`${EXPLORER}/tx/${tx}`}>tx</a> : <span />}
            </li>
          );
        })}
      </ol>
    </>
  );
}
