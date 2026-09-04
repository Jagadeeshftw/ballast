import DocShell, { H2, H3, type Heading } from "../DocShell";
import { loadPreview } from "../../data";
import PayoffA from "../../PayoffA";

export const dynamic = "force-dynamic";

const HEADINGS: Heading[] = [
  { id: "instrument", text: "The instrument" },
  { id: "fixed", text: "The payout is fixed" },
  { id: "regions", text: "Three regions" },
  { id: "sizing", text: "The sizing arithmetic" },
  { id: "diagram", text: "The payoff, drawn" },
  { id: "basis", text: "Basis risk, named" },
];

/* Cover price on a real settled position (docs/onchain-lifecycle.md). Same constant the
   landing page and `what-it-is` use, so all three agree by construction. */
const Q = 0.494;
const n2 = (v: number) => v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function WhatItPays() {
  const { vault, eth, positions } = await loadPreview();
  const ethPx = eth?.ok && eth.price ? eth.price : null;
  const exposure = ethPx ? ethPx * 2 : null;
  const xstar = Number(vault.policy[1]) / 10_000;
  const qty = exposure ? (exposure * xstar) / (1 - Q) : null;
  const coverNet = qty ? qty - qty * Q : null;
  const at = (f: number) => (exposure && coverNet !== null ? -exposure * f + coverNet : null);

  return (
    <DocShell
      slug="what-it-pays"
      title="What it pays"
      lede="Ballast sells parametric cover, not a hedge, and the difference is the whole of this page. The payout is fixed, so the cover is exact at one depth of fall and wrong on both sides of it."
      headings={HEADINGS}
    >
      <H2 id="instrument">The instrument</H2>
      <p>
        dreamDEX Event Contracts are <strong>at-the-money binaries</strong>: one strike per
        venue per window, struck at the window&rsquo;s opening price. That is not an assumption
        — it was checked across every binary market the indexer has ever seen.
      </p>
      <div className="docTableWrap">
        <table className="docTable">
          <thead><tr><th>Measure</th><th className="num">Result</th></tr></thead>
          <tbody>
            <tr><td>Binary markets examined</td><td className="num"><strong>562</strong></td></tr>
            <tr><td>Max distinct strikes within one venue, for one (asset, interval, expiry)</td><td className="num"><strong>1</strong></td></tr>
            <tr><td>Groups where a single venue offered more than one strike</td><td className="num"><strong>0</strong></td></tr>
            <tr><td>Max distinct strikes across all venues for one group</td><td className="num">2</td></tr>
            <tr><td>Groups reaching even 2</td><td className="num">2 of 560</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        Re-sampled live five times over about four and a half minutes, spanning several
        sixty-second rollovers: identical every time. Where two strikes appear they are two
        different venues quoting the same window, not a ladder.{" "}
        <strong>There is no out-of-the-money strike to buy instead</strong>, and there never
        has been one.
      </p>

      <H2 id="fixed">The payout is fixed</H2>
      <p>
        A binary pays a fixed one collateral unit per winning contract. It does not pay more
        because the fall was larger. Because the strike is pinned at the window&rsquo;s open,
        the bend in the payoff is pinned at a 0% move and <strong>cannot be moved</strong>.
      </p>
      <div className="callout">
        <span className="calloutTitle">No quantity produces a flat net line</span>
        What you set is quantity, and quantity moves the <em>break-even</em> — the depth at
        which payout equals loss. It never flattens the line. Ballast does not claim otherwise
        anywhere, and a product that did would be misdescribing what it sold.
      </div>

      <H2 id="regions">Three regions</H2>
      <p>
        With exposure <code>E</code>, an adverse move <code>x</code>, and <code>N</code> Down
        contracts bought at price <code>q</code>:
      </p>
      <div className="block">{`net(x) = −E·x  −  N·q  +  N·1[close < open]`}</div>
      <p>That gives three regions, and only the middle one is a single point:</p>
      <ul className="bullets">
        <li><strong>Above the break-even.</strong> The fixed payout exceeds the loss, so you come out ahead.</li>
        <li><strong>At it.</strong> Loss and payout are equal. This is the make-whole point, and it is one depth, not a range.</li>
        <li><strong>Beyond it.</strong> The loss outruns the fixed payout and you are short the difference.</li>
      </ul>
      <p>On an upward move the cover pays nothing and the premium is lost.</p>

      <H2 id="sizing">The sizing arithmetic</H2>
      <p>Set the net to zero at the depth you want made whole:</p>
      <div className="block">{`N = E · x* / (1 − q)          premium = N · q = E · x* · q / (1 − q)`}</div>
      {exposure === null || qty === null || coverNet === null ? (
        <div className="callout">
          <span className="calloutTitle">The book is one-sided right now</span>
          The table below is computed against the live book, which currently has no Down price
          to size against. It waits rather than showing an invented number — the same thing the
          engine does with a book it cannot price.
        </div>
      ) : (
        <>
          <p>
            Computed live: exposure from the chain, the make-whole point from the policy
            actually set, and <code>q = {Q}</code> from a position that really settled.
          </p>
          <div className="docTableWrap">
            <table className="docTable">
              <thead>
                <tr><th>Fall</th><th className="num">Position loses</th><th className="num">Cover nets</th><th className="num">Net</th><th>Region</th></tr>
              </thead>
              <tbody>
                {[0.01, xstar, 0.05].map((f) => {
                  const net = at(f)!;
                  const region = Math.abs(f - xstar) < 1e-9 ? "at the break-even"
                    : net > 0 ? "over-compensated" : "under-compensated";
                  return (
                    <tr key={f}>
                      <td><strong>{(f * 100).toFixed(2)}%</strong></td>
                      <td className="num">−{n2(exposure * f)}</td>
                      <td className="num">+{n2(coverNet)}</td>
                      <td className="num"><strong>{net >= 0 ? "+" : "−"}{n2(Math.abs(net))}</strong></td>
                      <td>{region}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p>
            {qty.toFixed(0)} contracts at {Q} costs {n2(qty * Q)} tUSDC and pays {n2(qty)} if it
            wins — a net of {n2(coverNet)}, which is exactly what a{" "}
            {(xstar * 100).toFixed(2)}% fall costs this position. That is the whole of the design.
          </p>
        </>
      )}

      <H2 id="diagram">The payoff, drawn</H2>
      <p>
        The same chart the dashboard uses, with the real settled positions landing on it. The
        step is what the instrument pays; the regions are what it costs either side of the load
        line; the points are what actually happened.
      </p>
      <div className="docFig"><PayoffA positions={positions} /></div>

      <H2 id="basis">Basis risk, named</H2>
      <p>
        The gap between a fixed payout and a realised loss is <strong>basis risk</strong>. It
        is the same trade flight-delay insurance makes: the policy pays the same whether you
        missed a meeting or a wedding. That is a real product, sold honestly for decades — but
        it is not a hedge, and calling it one would be the lie.
      </p>
      <div className="callout note">
        <span className="calloutTitle">Why this page exists</span>
        A trading-literate reader will work out the step function within a minute of seeing the
        instrument. Better that we state it first, in more detail than is comfortable, than
        that they find it and wonder what else was smoothed over.{" "}
        <a href="/docs/economics">Economics</a> does the same for what it costs.
      </div>
    </DocShell>
  );
}
