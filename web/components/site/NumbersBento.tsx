import { cn } from "@/lib/cn";
import CumulativeNet from "./CumulativeNet";
import type { CumPoint } from "@/lib/portfolio";

/**
 * The numbers, on the catalogue's asymmetric bento — a three-column grid where cells claim
 * two columns or one, so the chart gets the room it needs and the figures sit around it.
 *
 * The card shell is the catalogue's (rounded, ringed, hover group) restyled to the palette:
 * the stock version uses neutral-900 and black/white ring alphas that read as grey plastic on
 * a warm ground.
 */
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "group flex flex-col justify-between gap-6 rounded-2xl bg-raised p-5 ring-1 ring-rule transition-colors md:p-7 hover:ring-rulehi",
      className,
    )}>
      {children}
    </div>
  );
}

function Figure({ k, v, u, tone }: { k: string; v: string; u: string; tone?: "paid" | "lost" }) {
  return (
    <>
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{k}</div>
      <div>
        <div className={cn(
          "font-mono text-[clamp(26px,2.6vw,36px)] font-medium leading-none tracking-tight",
          tone === "paid" ? "text-paid" : tone === "lost" ? "text-lost" : "text-ink",
        )}>
          {v}
        </div>
        <div className="mt-2 font-mono text-[11px] text-muted">{u}</div>
      </div>
    </>
  );
}

export default function NumbersBento({
  points, settledPremium, paidOut, settledNet, paid, settled,
}: {
  points: CumPoint[];
  settledPremium: string; paidOut: string; settledNet: string;
  paid: number; settled: number;
}) {
  return (
    <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Cumulative net · settled positions
        </div>
        <CumulativeNet points={points} />
        {/* ═══════════════════════════════════════════════════════════════════
            LOAD-BEARING. Do not shorten when the page feels long. A positive net
            on a 61% hit rate is exactly what a trading-literate reader distrusts
            on sight; this is what turns it from suspicious into credible. Cut the
            chart before cutting this. */}
        <p className="border-l-2 border-signal pl-4 text-[13px] leading-relaxed text-muted">
          <strong className="font-medium text-ink">Read this as a sample, not a result.</strong>{" "}
          These are {settled} one-minute windows on a thin testnet book. Our own economics says
          rolling cover every sixty seconds is ruinous over any real horizon — at that frequency
          the spread alone runs to hundreds of percent a year, which is why the product defaults
          to the four-hour and twenty-four-hour windows. A favourable run of {settled} does not
          contradict that. It is what a small sample looks like.
        </p>
      </Card>

      <Card><Figure k="Premium, settled" v={settledPremium} u="tUSDC" /></Card>
      <Card><Figure k="Paid out" v={paidOut} u="tUSDC" tone="paid" /></Card>
      <Card><Figure k="Net, settled" v={`+${settledNet}`} u="tUSDC" tone="paid" /></Card>
      <Card className="md:col-span-2">
        <Figure k="Windows that paid" v={`${paid} of ${settled}`}
          u={`${Math.round((paid / settled) * 100)}% — and the seventeen that did not are the same product working`} />
      </Card>
    </div>
  );
}
