import { cn } from "@/lib/cn";
import CumulativeNet from "./CumulativeNet";
import type { CumPoint } from "@/lib/portfolio";

/**
 * The numbers, on the catalogue's five-column bento (`bento-grid-example-three`) rather than
 * the three-column one this section used first.
 *
 * The three-column version left a hole: five cells claiming 2+1+1+1+2 across three columns
 * wraps to seven slots, so the last row ran one short and the bottom-right sat empty. A
 * five-column grid where every row is 3+2 or 2+3 cannot produce that gap — the rows are
 * always exactly full, whatever the content does.
 *
 * The regrouping that made it fit is also the better read. Premium, paid out and net were
 * three sibling cards, but they are not siblings: net IS paid out minus premium. Showing them
 * as one ruled ledger states the arithmetic the reader would otherwise have to do, and stops
 * the page implying three independent findings where there is one.
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

function Key({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{children}</div>;
}

/** One line of the ledger. The figure is tabular so the decimal points stack. */
function Row({ k, v, sign, tone }: { k: string; v: string; sign?: string; tone?: "paid" }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[13px] text-muted">{k}</span>
      <span className={cn(
        "font-mono text-[15px] tabular-nums",
        tone === "paid" ? "text-paid" : "text-ink",
      )}>
        <span className="text-muted">{sign ?? " "}</span> {v}
      </span>
    </div>
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
    <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-5">
      {/* Row one: the shape of the run, then the arithmetic that produced it. */}
      <Card className="md:col-span-3">
        <Key>Cumulative net · settled positions</Key>
        <CumulativeNet points={points} />
      </Card>

      <Card className="md:col-span-2">
        <Key>The ledger · settled</Key>
        <div className="flex flex-1 flex-col justify-center gap-3">
          <Row k="Paid out to cover" v={paidOut} tone="paid" />
          <Row k="Premium paid" v={settledPremium} sign="&minus;" />
          <div className="h-px w-full bg-rule" />
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[13px] text-ink">Net, settled</span>
            <span className="font-mono text-[clamp(24px,2.4vw,32px)] font-medium leading-none tracking-tight tabular-nums text-paid">
              +{settledNet}
            </span>
          </div>
          <div className="font-mono text-[11px] text-muted">tUSDC · {settled} settled positions</div>
        </div>
      </Card>

      {/* Row two: the hit rate, then the reason not to read too much into it. */}
      <Card className="md:col-span-2">
        <Key>Windows that paid</Key>
        <div className="flex flex-1 flex-col justify-center">
          <div className="font-mono text-[clamp(26px,2.6vw,36px)] font-medium leading-none tracking-tight text-ink">
            {paid} of {settled}
          </div>
          <div className="mt-2 font-mono text-[11px] text-muted">
            {Math.round((paid / settled) * 100)}% — and the {settled - paid} that did not are the
            same product working
          </div>
        </div>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════
          LOAD-BEARING. Do not shorten when the page feels long. A positive net
          on a 61% hit rate is exactly what a trading-literate reader distrusts
          on sight; this is what turns it from suspicious into credible. Cut the
          chart before cutting this. It now holds its own cell rather than
          sitting under the chart, which is where it should have been. */}
      <Card className="md:col-span-3">
        <Key>How to read this</Key>
        <p className="text-[13px] leading-relaxed text-muted">
          <strong className="font-medium text-ink">Read this as a sample, not a result.</strong>{" "}
          These are {settled} one-minute windows on a thin testnet book. Our own economics says
          rolling cover every sixty seconds is ruinous over any real horizon — at that frequency
          the spread alone runs to hundreds of percent a year, which is why the product defaults
          to the four-hour and twenty-four-hour windows. A favourable run of {settled} does not
          contradict that. It is what a small sample looks like.
        </p>
      </Card>
    </div>
  );
}
