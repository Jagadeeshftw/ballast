import { positionsFor } from "@/lib/portfolio";
import { RECORD } from "@/lib/record";

/**
 * Derived from chain events, not stored anywhere.
 *
 * Deliberately quiet: routine batch runs are excluded. A bell that rings on every callback —
 * 1,196 of them in this record — is a bell nobody reads, which defeats the point of having
 * one at all. Only things a holder would want to be told about count as unread.
 */

export type Note = {
  kind: "opened" | "settled" | "declined" | "engine";
  important: boolean;
  when: number | null;
  title: string;
  detail: string;
  tx: string | null;
};

export function notificationsFor(user: string): Note[] {
  const rows = positionsFor(user);
  const out: Note[] = [];

  // Every settlement, and only the newest openings. Slicing before filtering dropped both
  // settled positions -- they are the OLDEST rows, opened on retired engines before this
  // engine existed -- so the bell showed nothing for the two events that matter most.
  const settled = rows.filter((r) => r.outcome !== "Open");
  const opened = rows.filter((r) => r.outcome === "Open").slice(0, 30);

  for (const r of [...settled, ...opened]) {
    if (r.outcome !== "Open") {
      out.push({
        kind: "settled", important: true, when: r.settledAt,
        title: `Cover settled · ${r.outcome}`,
        detail: r.outcome === "Won"
          ? `${r.asset} paid ${r.proceeds?.toFixed(2)} tUSDC against ${r.premium.toFixed(2)} of premium.`
          : `${r.asset} paid nothing — the price did not fall. The premium was ${r.premium.toFixed(2)} tUSDC.`,
        tx: r.settledTx,
      });
    } else {
      out.push({
        kind: "opened", important: false, when: r.openedAt,
        title: "Cover opened",
        detail: `${r.asset} · ${r.premium.toFixed(2)} tUSDC, covering a fall of ${(r.achievedBps / 100).toFixed(2)}%.`,
        tx: r.openedTx,
      });
    }
  }

  for (const d of RECORD.declined.slice(0, 8)) {
    out.push({
      kind: "declined", important: false, when: null,
      title: `Window declined · ${d.headline}`,
      detail: d.detail, tx: d.tx,
    });
  }

  return out.sort((a, b) => (b.when ?? 0) - (a.when ?? 0));
}
