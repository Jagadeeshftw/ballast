import DocShell, { H2, type Heading } from "../DocShell";
import { RECORD, recordRange } from "@/lib/record";

export const dynamic = "force-static";

const HEADINGS: Heading[] = [
  { id: "why", text: "A refusal is a decision" },
  { id: "reasons", text: "Every reason" },
  { id: "counts", text: "What the run refused" },
  { id: "unpriceable", text: "Unpriceable exposure" },
];

/* Reasons and counts both read from the frozen record, so the table cannot drift from the
   Activity view, which reads the same source. */
const skips = RECORD.declined;
const counts: Record<string, number> = {};
for (const i of skips) counts[i.headline] = (counts[i.headline] ?? 0) + 1;
const gaveUp = RECORD.counts.WindowGaveUp ?? 0;
const totalSkips = RECORD.counts.CoverSkipped ?? 0;
const opened = RECORD.counts.CoverOpened ?? 0;

const MEANING: [string, string][] = [
  ["No exposure", "No measured spot position in that asset, so there is nothing to cover. Ballast sizes against what it can read, never against a number you type."],
  ["No liquidity", "The Down book was empty. Refused rather than mispriced — a price invented from an empty book is not a price."],
  ["Cover too expensive", "Down priced above 0.90, where the size needed to make you whole diverges. Paying it would cost more than the fall it covers."],
  ["Below minimum lot", "The affordable size rounds to zero on the venue's lot grid. Buying the next lot up would exceed your premium ceiling."],
  ["No headroom", "A ceiling you set was already committed in that window. The limit did its job."],
  ["Placement failed", "The pool rejected the order. The rest of the batch continued — one failure does not take the others down."],
  ["Already covered", "This window already holds cover for this account. Buying twice would double the premium for the same protection."],
  ["Policy inactive or expired", "No active consent, so no action. This is the engine having no authority rather than choosing not to use it."],
  ["Would misrepresent", "The position would deliver nothing it could honestly describe as the cover requested."],
  ["No open price", "The window's opening price was never recorded, so there is no strike to measure a fall against."],
  ["Attempts exhausted", "Three attempts, and the book never became priceable. The window is marked given up rather than left pending forever."],
];

export default function Refusals() {
  const range = recordRange();
  return (
    <DocShell
      slug="refusals"
      title="Refusals"
      lede="Ballast declined far more often than it bought, and every refusal is on chain with the reason it gave. That is the product working, not a gap in it."
      headings={HEADINGS}
    >
      <H2 id="why">A refusal is a decision</H2>
      <p>
        A system that shows you only what it did is hiding what it chose not to do. Over the
        recorded run Ballast opened <strong>{opened}</strong> covers and refused{" "}
        <strong>{totalSkips.toLocaleString("en-GB")}</strong> times — more than twenty refusals
        for every purchase.
      </p>
      <p>
        Every one of those is an event on chain carrying its reason, and they are all readable
        on <a href="/app/activity?show=declined">Activity</a>. None of them is an error.
      </p>

      <H2 id="reasons">Every reason</H2>
      <div className="docTableWrap">
        <table className="docTable">
          <thead><tr><th>Reason</th><th>What it means</th></tr></thead>
          <tbody>
            {MEANING.map(([k, v]) => (
              <tr key={k}><td><strong>{k}</strong></td><td>{v}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2 id="counts">What the run refused</H2>
      <p>
        Counted from the frozen record{range ? `, ${range}` : ""} — the same source the
        dashboard reads, so these cannot disagree:
      </p>
      <div className="docTableWrap">
        <table className="docTable">
          <thead><tr><th>Reason</th><th className="num">Times</th></tr></thead>
          <tbody>
            {Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
              <tr key={k}><td>{k}</td><td className="num"><strong>{n.toLocaleString("en-GB")}</strong></td></tr>
            ))}
            <tr><td>Given up after three attempts</td><td className="num"><strong>{gaveUp.toLocaleString("en-GB")}</strong></td></tr>
          </tbody>
        </table>
      </div>
      <div className="callout note">
        <span className="calloutTitle">The largest category is the least interesting</span>
        Most refusals are <em>no exposure</em>: the engine is woken for every window dreamDEX
        rolls across every series, and the account holds a position in only one of them. That
        is the subscription being broad, not the engine being indecisive.
      </div>

      <H2 id="unpriceable">Unpriceable exposure</H2>
      <p>
        A separate state, and the one the interface handles most carefully. When the Down book
        is one-sided there is no price to size against.
      </p>
      <ul className="bullets">
        <li><strong>What is true:</strong> your position and your policy are unchanged, and
          your collateral is untouched.</li>
        <li><strong>What Ballast sees:</strong> a book it cannot price. The exposure source
          returns not-priceable rather than a guess.</li>
        <li><strong>What happens next:</strong> it waits. The window is retried up to three
          times, and if the book never forms it is given up with that reason recorded.</li>
      </ul>
      <p>
        The dashboard says <em>unpriceable — the book is one-sided</em> rather than showing a
        number, and so do these docs: the worked examples on{" "}
        <a href="/docs/what-it-is#worked">What it is</a> and{" "}
        <a href="/docs/what-it-pays#sizing">What it pays</a> refuse to render a table when the
        live book cannot price one.
      </p>
    </DocShell>
  );
}
