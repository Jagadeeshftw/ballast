import { InfiniteMovingCards } from "@/components/ace/infinite-moving-cards";
import { RECORD } from "@/lib/record";

/**
 * The problem, embodied rather than described.
 *
 * These are real windows from the recorded run, streaming past without stopping. That is the
 * point: the instruments expire every sixty seconds, so covering a position by hand means
 * keeping up with this, forever. Nobody does, which is why positions end up uncovered by
 * fatigue rather than by decision.
 *
 * The cards are in the DOM whether or not the marquee animates, so with scripting off this
 * degrades to a readable row of real events.
 */
export default function ProblemStream() {
  // A representative mix, not the newest fourteen — the tail of the run is almost all
  // window-opened rows, and fourteen identical cards would show nothing about the venue.
  const take = (kind: string, n: number) => RECORD.items.filter((i) => i.kind === kind).slice(0, n);
  const mixed = [
    ...take("opened", 4),
    ...take("declined", 4),
    ...take("enqueued", 3),
    ...take("attempt", 2),
    ...take("gaveUp", 1),
  ];

  // Interleave so the marquee does not run four of a kind in a row.
  const items = mixed
    .map((i, idx) => ({ i, k: (idx % 5) * 100 + Math.floor(idx / 5) }))
    .sort((a, b) => a.k - b.k)
    .map(({ i }) => ({
      quote: i.headline,
      name: i.detail || "—",
      title: `block ${String(i.block)}`,
    }));

  return (
    <div className="mt-10">
      <InfiniteMovingCards items={items} direction="left" speed="slow" />
      <p className="mt-6 text-[13px] text-muted">
        Real windows from the recorded run, {RECORD.counts.WindowEnqueued?.toLocaleString("en-GB")} of
        them in a day. This is the thing you would have to keep up with.
      </p>
    </div>
  );
}
