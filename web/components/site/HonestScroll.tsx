"use client";

import { StickyScroll } from "@/components/ace/sticky-scroll-reveal";

/**
 * The three regions of the payoff, one at a time, with the region's own colour on the panel.
 *
 * This is the strongest argument in the submission and the one most often got wrong, so it
 * gets the treatment that walks a reader through it rather than a paragraph they skim.
 *
 * Every figure is passed in from the page, computed from the live exposure, the cover price
 * actually paid on a settled position, and the live policy.
 */
export default function HonestScroll({
  exposure, coverNet, at,
}: { exposure: number; coverNet: number; at: [number, number, number] }) {
  const n2 = (v: number) => v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const panel = (label: string, tone: string, spot: string, net: string) => (
    <div className="flex h-full flex-col justify-between p-7">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">{label}</div>
      <div>
        <div className="font-mono text-[13px] text-muted">spot {spot}</div>
        <div className={`mt-1 font-mono text-4xl font-medium tracking-tight ${tone}`}>{net}</div>
        <div className="mt-1 font-mono text-[11px] text-muted">net, tUSDC</div>
      </div>
    </div>
  );

  const content = [
    {
      title: "Above the point: you come out ahead",
      description:
        `A small fall costs your spot position little, but the cover pays its full fixed amount anyway. At a 1% fall on ${n2(exposure)} tUSDC of exposure, spot loses ${n2(exposure * 0.01)} and the cover nets ${n2(coverNet)} — so you finish ahead. That is not a bonus; it is the same fixed payout arriving when it was not fully needed, and you paid for it.`,
      content: panel("Fall of 1.0%", "text-paid", `−${n2(exposure * 0.01)}`, `+${n2(at[0])}`),
    },
    {
      title: "At the point: exactly whole",
      description:
        "The make-whole point is the one depth where the fixed payout and the spot loss are equal. You set it; Ballast sizes the position to hit it. Everything either side of this line is basis risk, and it is the property you are buying rather than a defect to engineer away.",
      content: panel("Fall of 2.50%", "text-signal", `−${n2(exposure * 0.025)}`, n2(Math.abs(at[1]))),
    },
    {
      title: "Below the point: you are short",
      description:
        `The payout is fixed, so a larger fall is not matched by a larger payment. At a 5% fall spot loses ${n2(exposure * 0.05)} while the cover still nets only ${n2(coverNet)}, leaving you ${n2(Math.abs(at[2]))} down. Deeper cover means a deeper make-whole point and more premium per window — there is no free version of this.`,
      content: panel("Fall of 5.0%", "text-lost", `−${n2(exposure * 0.05)}`, `−${n2(Math.abs(at[2]))}`),
    },
  ];

  return <StickyScroll content={content} />;
}
