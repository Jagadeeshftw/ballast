import { DOC_GROUPS, docHref } from "@/lib/docs-nav";
import { RECORD, recordRange } from "@/lib/record";

export const dynamic = "force-static";

const REPO = "https://github.com/Jagadeeshftw/ballast";
const RUN_TOTAL = Object.values(RECORD.counts).reduce((a, b) => a + b, 0);

/** The docs index: what this is, then a card per destination. */
export default function DocsIndex() {
  const range = recordRange();
  return (
    <div className="docLayout">
      <article className="docBody">
        <h1 className="docH1">Documentation</h1>
        <p className="docLede">
          Everything Ballast does, what its cover actually pays, what that costs, and what it
          does not do — sourced from the contracts and from the run the engine recorded on
          chain.
        </p>

        <p>
          <strong>Ballast buys downside cover for a position you already hold, automatically,
          in the same block the window opens.</strong> dreamDEX Event Contracts settle a
          fixed payout on a yes/no question about a price at a moment. They expire and are
          replaced constantly — as often as every sixty seconds — so cover bought against one
          window is worthless a minute later. In practice nobody sits up all night re-buying
          it. Ballast does, and nothing of ours is running when it happens: Somnia&rsquo;s
          reactivity precompile invokes the handler as a synthetic transaction inside the
          block that triggered it.
        </p>
        <p>
          What that buys is <em>parametric cover</em>, not a hedge, and these pages are careful
          about the difference. The payout is fixed, so it is exact at one depth of fall and
          wrong on both sides of it. That gap is basis risk, it cannot be engineered away on
          this instrument, and the pages below give it more room than the marketing would.
          The engine is not currently running; that has a measured reason, and it is written
          up rather than hidden.
        </p>

        {DOC_GROUPS.map((g) => (
          <section key={g.label}>
            <h2 className="docH2" id={g.label.toLowerCase().replace(/\s+/g, "-")}>{g.label}</h2>
            <div className="docCards">
              {g.pages.map((p) => (
                <a key={p.slug} className="docCard" href={docHref(p.slug)}>
                  <span className="docCardGroup">{g.label}</span>
                  <span className="docCardTitle">{p.title}</span>
                  <span className="docCardBlurb">{p.blurb}</span>
                </a>
              ))}
            </div>
          </section>
        ))}

        <h2 className="docH2" id="source">The source</h2>
        <p>
          These pages are a presentation of documents that already live in the repository, and
          those documents remain the source of truth. Every figure quoted here is read from the
          same place the dashboard reads it — the chain, or the{" "}
          {RUN_TOTAL.toLocaleString("en-GB")}-event record the engine wrote
          {range ? ` over ${range}` : ""} — so a number cannot say one thing here and another
          on <a href="/app">the dashboard</a>.
        </p>
        <ul className="bullets">
          <li><a href={REPO}>The repository</a> — contracts, tests, scripts and every document below.</li>
          <li><a href={`${REPO}/tree/main/docs`}>Raw markdown</a>, if you would rather read the source than the presentation.</li>
          <li><a href={`${REPO}/blob/main/docs/run-record.json`}>The run record</a> — every event the engine emitted, as captured JSON.</li>
        </ul>
      </article>
      <aside className="docTocCol" />
    </div>
  );
}
