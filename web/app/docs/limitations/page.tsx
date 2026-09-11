import DocShell, { H2, H3, type Heading } from "../DocShell";
import { RECORD, recordRange, mixPhrase } from "@/lib/record";

export const dynamic = "force-static";

const HEADINGS: Heading[] = [
  { id: "somi", text: "SOMI cannot be covered" },
  { id: "void", text: "A void has never happened" },
  { id: "poke", text: "poke() is untested at scale" },
  { id: "reserved", text: "A reservation has no user-side escape" },
  { id: "engine", text: "The engine has stopped before" },
  { id: "gas-ceiling", text: "A buying callback runs close to its gas limit" },
  { id: "long-windows", text: "The default windows are the ones it never bought" },
  { id: "probes", text: "Two probes are pinned to expired markets" },
  { id: "sample", text: "The record is a sample" },
  { id: "open", text: "Open questions" },
];

const settled = RECORD.counts.CoverSettled ?? 0;

export default function Limitations() {
  const range = recordRange();
  return (
    <DocShell
      slug="limitations"
      title="Limitations"
      lede="What is untested, what cannot be covered at all, and what the recorded run does not prove. None of this is softened for a documentation register."
      headings={HEADINGS}
    >
      <H2 id="somi">SOMI cannot be covered at all</H2>
      <p>
        There is no binary market on SOMI, so there is no instrument to buy. This is not a
        feature we have not built — it is a market that does not exist. Ballast can only cover
        assets dreamDEX runs Event Contracts on.
      </p>

      <H2 id="void">A void has never happened on chain</H2>
      <p>
        The settlement path has a void branch, which pays 0.5/0.5. It is covered by tests and
        it has <strong>never executed against a real market</strong>, because no market we
        touched has ever voided. So the branch is proven in a test harness and unproven in
        production, and those are different claims.
      </p>

      <H2 id="poke">poke() is untested at mainnet-scale liquidity</H2>
      <p>
        <code>poke()</code> nudges a stuck market and is permissionless by design. Every
        exercise of it has been against thin testnet books. Its behaviour against deep books
        with many competing participants is <strong>not known</strong>, and the gas figure we
        quote for it (an estimate of 1,936,405 on a live window) is a testnet measurement.
      </p>

      <H2 id="reserved">A reservation has no user-side escape</H2>
      <div className="callout">
        <span className="calloutTitle">Latent, documented, not fixed</span>
        <code>reservedOf[user]</code> is cleared by an approved engine spending or releasing it.
        If an engine reserved and then stopped, that collateral would be locked with no user-side
        way out. It is <strong>currently unreachable</strong> — the only caller pairs reserve
        with spend atomically in one transaction, and a revert rolls both back. It is not fixed
        because the fix is a reservation expiry in the vault, and the vault holds a live user
        deposit that redeploying would strand. Written down so it is a decision rather than an
        oversight.
      </div>

      <H2 id="engine">The engine has stopped before</H2>
      <p>
        Between 2 and 10 September it bought no cover. Its subscription was first closed to
        preserve runway, then reopened at a gas limit too small for a purchase, then removed by
        Somnia when the balance ran dry. What it had already done stayed on chain and the vault
        stayed withdrawable throughout — a stop affects future purchases only.
      </p>
      <p>
        The measurements are on <a href="/docs/findings#billing">Findings</a>. Restarting took a
        new contract, not only a parameter change: the build it replaced gave every order a
        sixty-second expiry, which the pool refuses on a market that closes sooner, so it could
        never cover a one-minute window. <code>topUp()</code> is payable and permissionless, so
        anyone can fund a running engine; reopening a subscription is owner-only. The live
        state is on <a href="/app/engine">the Engine view</a>.
      </p>

      <H2 id="gas-ceiling">A buying callback runs close to its gas limit</H2>
      <p>
        Each callback is provisioned 10,000,000 gas. With one enrolled account, a callback that
        bought a single cover used 2,391,271 – 3,591,400 gas (median 2,445,376), and the heaviest
        so far used <strong>9,218,505 — 92% of the limit</strong>.
      </p>
      <p>
        The engine does guard its batches: it stops when less than{" "}
        <code>gasReservePerEntry</code> (400,000) remains and resumes from a cursor on the next
        callback. But one purchase costs about six times that reserve. So as more accounts share
        a batch, a purchase can start with too little gas to finish — it runs out inside its own
        call, the batch records <code>PlacementFailed</code> for that account, and that account
        goes uncovered for that window. If what is left is then too little for the batch&rsquo;s
        own bookkeeping, the callback as a whole runs out of gas.
      </p>
      <div className="callout">
        <span className="calloutTitle">Known, and not fixed</span>
        Both levers are owner settings, not contract changes: a reserve above the cost of one
        purchase (<code>setBatchParams</code>) would make a batch stop cleanly and resume, and
        the limit can rise to the precompile&rsquo;s maximum of 200,000,000 — Somnia bills gas
        used, so the limit is not itself the cost. Neither has been done, because with one
        enrolled account the ceiling has not been reached.
      </div>

      <H2 id="long-windows">The default windows are the ones it never bought</H2>
      <p>
        The product defaults to four-hour and twenty-four-hour windows, because those are the
        intervals where the spread is survivable. On testnet it has never bought one. Over the
        recorded history the engines saw <strong>20 four-hour and 4 twenty-four-hour</strong> ETH
        windows and refused every one: the Down book was empty, or the affordable size fell
        below the venue&rsquo;s minimum lot. Every cover in the record is on a window of an hour
        or less — {mixPhrase("opened")}.
      </p>
      <p>
        So the economics argue for the windows the record cannot show, and the record shows the
        windows the economics argue against. That is a property of thin testnet books rather
        than of the engine, but it means cover at the intervals that matter is{" "}
        <strong>untested</strong>.
      </p>

      <H2 id="probes">Two probes are pinned to expired markets</H2>
      <p>
        The Phase 0 probe suite runs <strong>21 of 23</strong> green.{" "}
        <code>test_ContractCanPlaceRestingBid</code> and{" "}
        <code>test_ContractCanMintCompleteSet</code> are pinned to a specific BTC 24-hour
        market that expired on 2 September 2026, and now revert with{" "}
        <code>OrderAlreadyExpired()</code> and <code>TradingNotActive()</code> respectively.
      </p>
      <p>
        That is a time-pinned probe decaying, not a product regression: the same assertions
        passed against that market while it was live, and the write path they exercise is the
        one the engine still uses. They would need repointing at a live market to run green
        again, and that has not been done.
      </p>

      <H2 id="sample">The record is a sample, not a result</H2>
      <p>
        {settled} settled positions with a positive net looks like a return. It is not one.
      </p>
      <div className="callout">
        <span className="calloutTitle">Read it as a sample</span>
        Those {settled} positions are short windows on a thin testnet book —{" "}
        {mixPhrase("settled")}{range ? `, recorded over ${range}` : ""}. Our own{" "}
        <a href="/docs/economics">economics</a> says rolling cover that often is ruinous over
        any real horizon — the spread alone runs to thousands of percent a year,
        which is why the product defaults to four-hour and twenty-four-hour windows. A
        favourable run of {settled} does not contradict that. It is what a small sample looks
        like.
      </div>
      <H2 id="open">Open questions</H2>
      <p>
        Three product decisions have not been made. They are written here as questions because
        that is what they are, and because improvising an answer when asked would be worse than
        saying the work has not been done.
      </p>

      <H3 id="open-cadence">Should it buy every available window?</H3>
      <p>
        Today it does: enrol, and the engine attempts cover on every window it is woken for.
        Whether that is the right production strategy is genuinely undecided. The alternative is
        episodic cover — buying around events, or when a position crosses a size threshold, or
        on a schedule the holder sets — which costs less in spread but leaves gaps that are
        uncovered by choice rather than by accident. We have not decided which is right, and{" "}
        <a href="/docs/economics">the economics</a> only tells us that buying every sixty-second
        window is not.
      </p>

      <H3 id="open-filter">There is no expected-value or volatility filter</H3>
      <p>
        Every gate the engine applies is <strong>mechanical</strong>: is the book two-sided, is
        the cover price at or below 0.90, does the premium fit the ceiling and the notional cap,
        does the size clear the venue&rsquo;s minimum lot. Those are all questions about whether
        a purchase is <em>possible</em> and <em>within consent</em>.
      </p>
      <p>
        <strong>No view is taken on whether cover is worth buying today.</strong> The engine has
        no volatility estimate, no expected-value calculation, and no opinion about whether the
        market&rsquo;s price for the Down side is generous or expensive relative to the risk. It
        buys because it is permitted to, not because it judged the trade good. Whether it should
        judge — and on whose model — is open.
      </p>

      <H3 id="open-topup">Vault top-up is manual, and premium drains it</H3>
      <p>
        Premium is paid out of vault collateral every window cover is bought. On four-hour
        windows that runs at roughly <strong>0.2% to 0.3% of exposure per day</strong> net of
        spread — see <a href="/docs/economics#frequency">the frequency table</a>. Collateral is
        therefore consumed steadily by a working policy.
      </p>
      <p>
        There is <strong>no low-balance alert and no automatic refill</strong>. A holder who
        stops watching will eventually find cover being skipped for want of collateral, and the
        first they learn of it is a refusal in the activity log. What the right answer is — a
        notification, a reserve floor, an allowance the vault may pull on — has not been decided.
      </p>

    </DocShell>
  );
}
