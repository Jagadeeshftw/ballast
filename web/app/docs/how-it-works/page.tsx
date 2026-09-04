import DocShell, { H2, type Heading } from "../DocShell";
import { ADDR, EXPLORER } from "@/lib/chain";

export const dynamic = "force-static";

const HEADINGS: Heading[] = [
  { id: "contracts", text: "Three contracts" },
  { id: "committed", text: "Most of this site needs no chain read" },
  { id: "same-block", text: "The same-block path" },
  { id: "delay", text: "Why buying is delayed" },
  { id: "engine-set", text: "The engine set" },
  { id: "settlement", text: "Settlement" },
];

const TRIGGER = "0x0434d3649993a20112717df342ffd97952c2257bd4133bb5666da0d075d5fcd4";
const CALLBACK = "0x79bf978b79eed28229298dd5d293d99e77c2e647610d14e3f1bce061eaab74f1";
const RETIRED_SETTLE = "0xdafa9556f7f474c089b57293c2db3a62b426560a54bdcbb8e4b518e1a489d4c9";

export default function HowItWorks() {
  return (
    <DocShell
      slug="how-it-works"
      title="How it works"
      lede="Three contracts, a reactive subscription, and a handler that runs inside the block that triggered it. No keeper, no cron, and nothing of ours polling."
      headings={HEADINGS}
    >
      <H2 id="contracts">Three contracts</H2>
      <ul className="bullets">
        <li><strong>BallastVault</strong> — custody. Holds collateral in the user&rsquo;s name,
          records the policy, and reserves against a purchase.{" "}
          <a href={`${EXPLORER}/address/${ADDR.vault}`}>{ADDR.vault.slice(0, 10)}…</a></li>
        <li><strong>HedgeEngine</strong> — the trader of record. Subscribes to window events,
          sizes cover, and places the order in its own name.{" "}
          <a href={`${EXPLORER}/address/${ADDR.engine}`}>{ADDR.engine.slice(0, 10)}…</a></li>
        <li><strong>SpotExposureSource</strong> — measurement. Reads what an account actually
          holds on the venue, so cover is never sized against a self-declared number.{" "}
          <a href={`${EXPLORER}/address/${ADDR.source}`}>{ADDR.source.slice(0, 10)}…</a></li>
      </ul>
      <div className="callout note">
        <span className="calloutTitle">Ballast is the trader of record</span>
        It holds positions in its own name and never touches your dreamDEX account. It has no
        operator permission over you, and it does not need one — see{" "}
        <a href="/docs/custody">Custody</a>.
      </div>

      <H2 id="committed">Most of this site needs no chain read</H2>
      <p>
        The engine&rsquo;s whole run is captured as JSON and <strong>committed to the
        repository</strong>, so the history it wrote is part of the site rather than something
        the site fetches. That is not a caching trick — it is a property worth stating.
      </p>
      <p>
        Positions, totals, the cumulative chart, every refusal and its reason, the block ranges
        and the transaction hashes are all read from that file.{" "}
        <strong>Only three figures on the entire site are genuinely live:</strong> the vault
        balance, the engine&rsquo;s counters, and the spot price used to measure exposure.
      </p>
      <div className="callout note">
        <span className="calloutTitle">Which is why the site stays up when the testnet does not</span>
        When Somnia&rsquo;s RPC endpoint is unreachable — and testnet endpoints are — every page
        still renders, server-side, with its full content. <a href="/app/cover">Cover</a> and{" "}
        <a href="/app/activity">Activity</a> are complete with nothing missing and no notice at
        all, because neither needs a network. The three live figures show an em dash and say
        what could not be read, rather than a zero we did not measure. Most of what this product
        shows is permanent, and permanent things do not need asking for twice.
      </div>

      <H2 id="same-block">The same-block path</H2>
      <p>
        The engine holds a reactive subscription on <code>MarketCreated</code> from dreamDEX&rsquo;s
        binary module. When a window opens, Somnia&rsquo;s reactivity precompile invokes the
        handler as a <strong>synthetic transaction inside the same block as the trigger</strong>.
      </p>
      <div className="docTableWrap">
        <table className="docTable">
          <thead><tr><th>Transaction</th><th className="num">Block</th><th>What it is</th></tr></thead>
          <tbody>
            <tr>
              <td><a className="mono" href={`${EXPLORER}/tx/${TRIGGER}`}>{TRIGGER.slice(0, 18)}…</a></td>
              <td className="num"><strong>476941284</strong></td>
              <td>dreamDEX opens a window</td>
            </tr>
            <tr>
              <td><a className="mono" href={`${EXPLORER}/tx/${CALLBACK}`}>{CALLBACK.slice(0, 18)}…</a></td>
              <td className="num"><strong>476941284</strong></td>
              <td>Ballast&rsquo;s handler runs</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Same block. <strong>Zero blocks of latency</strong>, and no operator anywhere in the
        loop. This is the part of the design that only works on this chain.
      </p>
      <div className="callout">
        <span className="calloutTitle">A correction we owe the record</span>
        An earlier measurement of this path reported roughly 90 milliseconds. That figure was
        wall-clock time observed by an off-chain watcher — the time before <em>it</em> saw the
        callback — not the chain&rsquo;s own accounting. On chain the two transactions share a
        block number, so the correct latency is <strong>zero blocks</strong>. The 90 ms number
        measured our observer, not the venue.
      </div>

      <H2 id="delay">Why buying is delayed</H2>
      <p>
        A new pool&rsquo;s order book is <strong>empty at creation</strong>. Makers first quote
        somewhere between 5.5 and 10.2 seconds later. Buying in the creation block would mean
        buying nothing, or buying at the widest print of the window.
      </p>
      <p>
        So creation <em>enqueues</em> the window and schedules a one-shot tick, which buys
        later. The retry ladder is bounded at <strong>three attempts</strong>; if the book has
        still not become priceable, the window is marked given up rather than left pending.
        The recorded run gave up on 386 windows that way, and each is on chain with its reason.
      </p>

      <H2 id="engine-set">The engine set</H2>
      <p>
        The vault approves a <em>set</em> of engines rather than one. Approval is additive by
        design, so a redeploy strands nothing: an older engine can still settle cover it opened
        before it was replaced.
      </p>
      <p>
        That is not a theory. A retired engine with zero balance and no subscription settled a
        cover it had opened before the redeploy, crediting 200.00 tUSDC into the vault while a
        different, live engine was taking enrolments:{" "}
        <a className="mono" href={`${EXPLORER}/tx/${RETIRED_SETTLE}`}>{RETIRED_SETTLE.slice(0, 18)}…</a>{" "}
        — vault <code>4,677.40 → 4,877.40 tUSDC</code>.
      </p>

      <H2 id="settlement">Settlement</H2>
      <p>
        Settlement reads the market&rsquo;s payout vector and takes one of four branches. The
        one worth stating: <strong>a losing redemption succeeds and pays zero</strong>, rather
        than reverting. A revert would strand the position and require a rescue path; paying
        zero closes it cleanly and records the outcome.
      </p>
      <p>
        Settling is <strong>permissionless</strong> — anyone can close a position, not only its
        holder — and if the market itself is stuck, poking the oracle and voiding an expired
        market are permissionless too. Nothing in the settlement path depends on us being
        around. See <a href="/docs/limitations">Limitations</a> for what remains untested.
      </p>
    </DocShell>
  );
}
