import DocShell, { H2, type Heading } from "../DocShell";
import { RECORD, recordRange } from "@/lib/record";

export const dynamic = "force-static";

const HEADINGS: Heading[] = [
  { id: "atm", text: "At-the-money is the expensive end" },
  { id: "spread", text: "The spread is the structural cost" },
  { id: "frequency", text: "Frequency multiplies it" },
  { id: "defaults", text: "Why 4h and 24h" },
  { id: "sample", text: "The sample caveat, at full length" },
];

const settled = RECORD.counts.CoverSettled ?? 0;

export default function Economics() {
  const range = recordRange();
  return (
    <DocShell
      slug="economics"
      title="Economics"
      lede="Where this product costs money, stated as plainly as where it makes it. The premium is roughly fair; the spread is not, and rolling it every window is what turns a fair price into a ruinous one."
      headings={HEADINGS}
    >
      <H2 id="atm">At-the-money is the expensive end</H2>
      <p>
        Because the strike is the window&rsquo;s opening price, the book is always
        at-the-money. There is no cheaper out-of-the-money strike to buy instead — see{" "}
        <a href="/docs/what-it-pays#instrument">the strike finding</a> — so{" "}
        <strong>you are forced to pay for the very likely small moves as well as the tail
        you actually want covered.</strong> This is the most expensive cover this instrument
        offers, and it is the only cover it offers.
      </p>

      <H2 id="spread">The spread is the structural cost</H2>
      <p>
        The premium itself is roughly fair in expectation: <code>q</code> is the market&rsquo;s
        own probability of the Down outcome, so on average you pay about what the risk is
        worth. The cost that does not average away is the <strong>spread</strong>, and it is
        paid on every single roll.
      </p>
      <p>
        Observed spreads on testnet run <strong>2.2% to 15.4% of mid</strong> — wide, because
        the books are thin. Every roll crosses that spread again.
      </p>

      <H2 id="frequency">Frequency multiplies it</H2>
      <p>
        Rolling a 250 bps make-whole point every window, priced against the live books:
      </p>
      <div className="docTableWrap">
        <table className="docTable">
          <thead>
            <tr><th>Interval</th><th className="num">Windows / day</th><th className="num">Spread cost / day</th><th className="num">Spread cost / year</th></tr>
          </thead>
          <tbody>
            <tr><td>60 s</td><td className="num">1440</td><td className="num">939% – 9720%</td><td className="num">astronomically ruinous</td></tr>
            <tr><td>900 s</td><td className="num">96</td><td className="num">~5%</td><td className="num">~1900%</td></tr>
            <tr><td>3600 s</td><td className="num">24</td><td className="num">15% – 25%</td><td className="num">5500% – 9200%</td></tr>
            <tr><td><strong>14400 s (4 h)</strong></td><td className="num">6</td><td className="num"><strong>0.2% – 0.3%</strong></td><td className="num"><strong>79% – 110%</strong></td></tr>
            <tr><td><strong>86400 s (24 h)</strong></td><td className="num">1</td><td className="num"><strong>~0.1%</strong></td><td className="num"><strong>19% – 21%</strong></td></tr>
          </tbody>
        </table>
      </div>
      <p>
        The 1 h row is bad in this snapshot only because <code>q</code> happened to sit near
        0.975 on those two markets. The window length is fine; the price was not — which is
        precisely why the premium ceiling is a per-window check rather than a configuration
        constant.
      </p>

      <H2 id="defaults">Why 4h and 24h</H2>
      <p>
        <strong>The product defaults to the four-hour and twenty-four-hour windows, and
        sixty seconds is unusable.</strong> Not marginal — unusable. At 1,440 rolls a day the
        spread alone consumes multiples of the position every year, whatever happens to the
        price.
      </p>
      <div className="callout">
        <span className="calloutTitle">Treat the absolute figures as structure, not forecast</span>
        Testnet books are thin and erratic. What transfers to a real venue is the{" "}
        <em>structure</em> — premium proportional to <code>x*/(1−q)</code>, multiplied by
        windows per day, with the spread as the real drag — rather than these particular
        percentages.
      </div>

      <H2 id="sample">The sample caveat, at full length</H2>
      <p>
        The recorded run shows {settled} settled positions with a positive net. That figure is
        on <a href="/app">the dashboard</a> and on the landing page, and it should be read
        with this attached:
      </p>
      <div className="callout">
        <span className="calloutTitle">A sample, not a result</span>
        Those {settled} positions are <strong>one-minute windows on a thin testnet book</strong>
        {range ? `, recorded over ${range}` : ""}. The economics on this page say plainly that
        rolling cover every sixty seconds is ruinous over any real horizon — at that frequency
        the spread alone runs to hundreds of percent a year, which is why the product defaults
        to four-hour and twenty-four-hour windows. A favourable run of {settled} does not
        contradict that. It is what a small sample looks like, and reading it as a return would
        be reading it wrong.
      </div>
      <p>
        This is also why the dashboard shows cumulative premium paid against protection
        actually used, rather than the winners alone. A reader will do that arithmetic; better
        that we did it first.
      </p>
    </DocShell>
  );
}
