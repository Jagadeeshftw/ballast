import { Timeline } from "@/components/ace/timeline";

/**
 * A real sequence, so a timeline rather than three cards.
 *
 * The Aceternity component renders all its content unconditionally and only animates a
 * scroll-progress beam, so it degrades correctly without JavaScript: the steps are there,
 * the beam simply does not fill.
 */
const STEPS = [
  {
    title: "Hold",
    content: (
      <div>
        <h3 className="text-xl font-bold tracking-tight text-ink">Hold something the chain can see</h3>
        <p className="mt-3 max-w-[52ch] leading-relaxed text-muted">
          Ballast covers what it can <strong className="font-medium text-ink">measure</strong> you
          holding on chain — never a number you type in. On testnet that is one transaction and no
          approval.
        </p>
      </div>
    ),
  },
  {
    title: "Set",
    content: (
      <div>
        <h3 className="text-xl font-bold tracking-tight text-ink">Say how deep a fall to cover</h3>
        <p className="mt-3 max-w-[52ch] leading-relaxed text-muted">
          The make-whole point, and the most you will pay for it per window. That is the whole of
          the policy. Revoking takes effect immediately and no operator can block or delay it.
        </p>
      </div>
    ),
  },
  {
    title: "Nothing",
    content: (
      <div>
        <h3 className="text-xl font-bold tracking-tight text-ink">Then nothing, for as long as you like</h3>
        <p className="mt-3 max-w-[52ch] leading-relaxed text-muted">
          Every window, in the block it opens, Ballast buys cover — or declines it and records
          which reason. Your collateral stays in your name and unreserved balance is withdrawable
          unconditionally, throughout.
        </p>
      </div>
    ),
  },
];

export default function HowTimeline() {
  return (
    <Timeline
      data={STEPS}
      header={
        <>
          <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em] text-signal">
            How it works
          </p>
          <h2 className="max-w-[20ch] text-balance text-[clamp(26px,3.4vw,42px)] font-bold leading-[1.1] tracking-[-0.02em]">
            Three steps, and the third one is nothing.
          </h2>
          <p className="mt-5 max-w-[54ch] leading-relaxed text-muted">
            Ballast covers what it can measure you holding on chain. Never a number you type in.
          </p>
        </>
      }
    />
  );
}
