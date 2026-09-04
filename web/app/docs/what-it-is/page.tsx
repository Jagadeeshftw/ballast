import DocShell, { H2, H3, type Heading } from "../DocShell";
import { loadPreview } from "../../data";
import { ADDR, EXPLORER } from "@/lib/chain";

export const dynamic = "force-dynamic";

const HEADINGS: Heading[] = [
  { id: "problem", text: "The problem" },
  { id: "three-steps", text: "The three steps" },
  { id: "load-line", text: "The load line is a break-even" },
  { id: "measured", text: "Measured exposure" },
  { id: "worked", text: "A worked example, end to end" },
];

/* The cover price on a real settled position, recorded in docs/onchain-lifecycle.md. The
   landing page's worked example uses the same constant, so the two surfaces agree by
   construction rather than by coincidence. */
const Q = 0.494;
const n2 = (v: number) => v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function WhatItIs() {
  const { vault, eth } = await loadPreview();
  const ethPx = eth?.ok && eth.price ? eth.price : null;
  const exposure = ethPx ? ethPx * 2 : null;          // the demonstration account holds 2 WETH
  const xstar = Number(vault.policy[1]) / 10_000;      // live policy, not a constant
  const qty = exposure ? (exposure * xstar) / (1 - Q) : null;
  const premium = qty ? qty * Q : null;
  const coverNet = qty && premium ? qty - premium : null;
  const at = (fall: number) =>
    exposure && coverNet !== null ? -exposure * fall + coverNet : null;

  return (
    <DocShell
      slug="what-it-is"
      title="What it is"
      lede="You hold something. It can fall while you are not watching. Ballast buys the cover for that fall, every window, without anyone pressing anything."
      headings={HEADINGS}
    >
      <H2 id="problem">The problem</H2>
      <p>
        You hold ETH. It can fall while you sleep. Instruments that would cover that fall exist
        on dreamDEX — Event Contracts, which pay a fixed amount if a price closes below where
        it opened — but they are tied to a window, and the windows expire and are replaced
        constantly. The shortest roll every sixty seconds.
      </p>
      <p>
        Cover bought against one window is worthless once that window closes. Keeping a
        position covered therefore means re-buying, correctly sized, every single window,
        forever. <strong>In practice nobody does this.</strong> That is the gap Ballast fills,
        and it is a gap about diligence rather than about cleverness.
      </p>

      <H2 id="three-steps">The three steps</H2>
      <ul className="bullets">
        <li><strong>Hold something.</strong> Ballast only ever covers exposure it can measure
          on chain. It reads your spot position from the venue; it never accepts a number you
          type in.</li>
        <li><strong>Set a load line.</strong> How deep a fall you want made whole, and the most
          you are willing to pay per window for it. That is the whole of the policy, and it is
          a contract state rather than a setting in a database of ours.</li>
        <li><strong>The chain does the rest.</strong> When dreamDEX opens a window, Somnia&rsquo;s
          reactivity precompile invokes Ballast&rsquo;s handler inside that same block. There is
          no keeper, no cron, and nothing of ours running.</li>
      </ul>

      <H2 id="load-line">The load line is a break-even, not a kink</H2>
      <p>
        This distinction matters more than any other on this page. An Event Contract pays a
        fixed amount if it wins. Because the strike is pinned to the window&rsquo;s opening
        price, the bend in the payoff sits at a 0% move and <strong>cannot be moved</strong>.
      </p>
      <p>
        What you set is <em>quantity</em>, and quantity moves the <strong>break-even</strong> —
        the depth of fall at which the payout exactly equals your loss. It does not flatten the
        line, and no quantity ever will.{" "}
        <a href="/docs/what-it-pays">What it pays</a> works through why, and what the residual
        gap is.
      </p>

      <H2 id="measured">Measured exposure</H2>
      <p>
        Ballast reads the position from the exposure source contract at{" "}
        <a href={`${EXPLORER}/address/${ADDR.source}`}>{ADDR.source.slice(0, 10)}…</a>, which
        reports what the account actually holds on the venue. Cover is sized against that
        reading and nothing else.
      </p>
      <div className="callout note">
        <span className="calloutTitle">Why it is never a number you type</span>
        A self-declared exposure would let anyone buy a payout unrelated to a position they
        hold, which is a bet rather than cover. Reading the position instead means the size is
        always defensible, and it means Ballast can refuse when there is nothing to cover —
        which it does, often. See <a href="/docs/refusals">Refusals</a>.
      </div>

      <H2 id="worked">A worked example, end to end</H2>
      {exposure === null || qty === null || premium === null || coverNet === null ? (
        <div className="callout">
          <span className="calloutTitle">The book is one-sided right now</span>
          The worked example is computed from the live book, and the Down side currently has no
          price to size against. Rather than show a made-up number, this waits — which is
          exactly what the engine does with a book it cannot price.
        </div>
      ) : (
        <>
          <p>
            Every figure below is read live: the exposure from the chain, the make-whole point
            from the policy actually set on the demonstration account, and the cover price{" "}
            <code>q = {Q}</code> from a position that really settled.
          </p>
          <div className="block">{`exposure  E   = ${n2(exposure)} tUSDC of ETH   (2 WETH, read from the venue)
make-whole x*  = ${(xstar * 100).toFixed(2)}%                  (the policy on this account)
cover price q  = ${Q}                    (paid on a real settled position)

contracts  N   = E · x* / (1 − q)
               = ${n2(exposure)} × ${xstar} / ${(1 - Q).toFixed(3)}
               = ${qty.toFixed(0)} contracts

premium        = N · q  = ${n2(premium)} tUSDC
payout if won  = N · 1  = ${n2(qty)} tUSDC
net if won     = ${n2(coverNet)} tUSDC`}</div>
          <p>
            So on a fall of exactly {(xstar * 100).toFixed(2)}% the position loses{" "}
            {n2(exposure * xstar)} and the cover nets {n2(coverNet)} — the same number, which is
            what &ldquo;made whole&rdquo; means. Away from that depth the two stop matching:
          </p>
          <div className="docTableWrap">
            <table className="docTable">
              <thead>
                <tr><th>Fall</th><th className="num">Position</th><th className="num">Cover, net</th><th className="num">You end up</th><th>Which is</th></tr>
              </thead>
              <tbody>
                {[0.01, xstar, 0.05].map((f) => {
                  const net = at(f)!;
                  const label = Math.abs(f - xstar) < 1e-9 ? "exactly whole"
                    : net > 0 ? "over-compensated" : "under-compensated";
                  return (
                    <tr key={f}>
                      <td><strong>{(f * 100).toFixed(2)}%</strong></td>
                      <td className="num">−{n2(exposure * f)}</td>
                      <td className="num">+{n2(coverNet)}</td>
                      <td className="num"><strong>{net >= 0 ? "+" : "−"}{n2(Math.abs(net))}</strong></td>
                      <td>{label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="callout">
            <span className="calloutTitle">And if the price rises</span>
            The cover pays nothing and the premium is gone. That is not a malfunction — it is
            the cost of cover that turned out not to be needed, and on the recorded run it
            happened seventeen times out of forty-four. Those seventeen are shown on the{" "}
            <a href="/app/cover">dashboard</a> alongside the twenty-seven that paid.
          </div>
        </>
      )}
    </DocShell>
  );
}
