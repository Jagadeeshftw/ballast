import { EXPLORER } from "@/lib/chain";

/**
 * The same-block proof, as the mechanism rather than as a statement of it.
 *
 * The claim is that dreamDEX opening a window and Ballast's handler running are the same
 * block — so the card draws one block containing both, and animates the sequence inside it:
 * the block opens, the trigger lands, the handler fires on the same rail, and the block
 * number confirms. The gap between them is labelled zero because that is the entire point.
 *
 * Three things constrain how this is built.
 *
 * It is CSS, with no JavaScript anywhere. Not a preference: the hero must render complete
 * with scripting off, and an animation driven by an observer would leave the evidence blank
 * for exactly the reader least able to fix it.
 *
 * It animates FROM the finished state, never TO it. The resting style of every element here
 * is its final style — dots lit, hashes at full contrast, block number in signal. The
 * keyframes start dimmed and return, so if the animation never runs, never loops, or is
 * turned off by `prefers-reduced-motion`, what remains is the complete card rather than a
 * half-drawn one. Nothing is `opacity: 0` waiting to be revealed.
 *
 * The step labels name what each transaction IS, not what the claim wants it to be: the
 * trigger is dreamDEX's own reactive callback, and the market creation is an event inside it.
 * Saying "dreamDEX opens a window" of the transaction sent a reader to a summary page showing
 * `onEvent` on an unfamiliar contract, with no window creation anywhere on it.
 *
 * The hashes and the block number are evidence, so nothing animates their opacity or colour
 * below legibility. The moving parts are the rail, the dots and a travelling pulse.
 *
 * Height: `lg:h-full` inside a stretched grid row, so the card matches the headline column
 * exactly and cannot be the thing that pushes the hero past 100vh. On narrow screens it
 * keeps its natural height, where the column is stacked and the space is not there to fill.
 */
const TRIGGER = "0x0434d3649993a20112717df342ffd97952c2257bd4133bb5666da0d075d5fcd4";
const CALLBACK = "0x79bf978b79eed28229298dd5d293d99e77c2e647610d14e3f1bce061eaab74f1";
const BLOCK = "476941284";

function Step({
  n, label, who, hash, short,
}: { n: 1 | 2; label: string; who: string; hash: string; short: string }) {
  return (
    <div className="sbpStep" data-step={n}>
      <span className="sbpDot" aria-hidden="true" />
      <div className="min-w-0">
        {/* One line on a narrow screen, stacked where there is height to fill. */}
        <div className="sbpLine">
          <span className="sbpWho">{who}</span>
          <span className="sbpWhat">{label}</span>
        </div>
        {/* Head and tail, not the whole hash. The full 66 characters need 455px against the
            428px this column has, so showing all of it either wrapped a four-character orphan
            onto a second line or required dropping to 10.5px -- and this is the evidence the
            video points a camera at. Elided keeps both ends of the hash, one line, legible;
            the full value is on the link and in `title`. */}
        <a
          href={`${EXPLORER}/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
          className="sbpHash"
          title={hash}
        >
          {short}
        </a>
      </div>
    </div>
  );
}

export default function SameBlockProof() {
  return (
    <div className="sbp flex flex-col rounded-xl border border-rule bg-raised/70 backdrop-blur-sm lg:h-full">
      <div className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-2.5 sm:px-5 sm:py-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
          Same block · zero latency
        </span>
        <span className="sbpBlockNo font-mono text-[11px] font-semibold">{BLOCK}</span>
      </div>

      <div className="sbpStage flex-1">
        <div className="sbpFrame">
          <div className="sbpFrameLabel">
            <span className="sbpFrameDot" aria-hidden="true" />
            block {BLOCK}
          </div>

          <div className="sbpRail" aria-hidden="true">
            <span className="sbpPulse" />
          </div>

          <Step n={1} who="dreamDEX" label="creates the market" hash={TRIGGER} short="0x0434d364…d075d5fcd4" />

          <div className="sbpGap">
            <span className="sbpGapNum">0</span>
            <span className="sbpGapWord">blocks between</span>
          </div>

          <Step n={2} who="Ballast" label="handler runs, same market" hash={CALLBACK} short="0x79bf978b…ce061eaab74f1" />
        </div>
      </div>

      <p className="border-t border-rule px-4 py-3 text-[12.5px] leading-relaxed text-muted sm:px-5 sm:py-4 sm:text-[13px]">
        Two reactive systems in one block. dreamDEX creates markets inside a callback of its own —{" "}
        <code className="sbpCode">MarketCreated</code> is <strong>log 75</strong> here, not the
        summary — and Somnia&rsquo;s precompile runs the handler{" "}
        <strong className="font-semibold text-paid">inside the block that triggered it</strong>.
      </p>
    </div>
  );
}
