import DocShell, { H2, type Heading } from "../DocShell";
import { RECORD } from "@/lib/record";

export const dynamic = "force-static";

const HEADINGS: Heading[] = [
  { id: "billing", text: "Callbacks are billed at the gas limit" },
  { id: "flat", text: "The price has nothing to do with the work" },
  { id: "estimate", text: "eth_estimateGas runs ~4x over" },
  { id: "latch", text: "The latch sweep" },
  { id: "bytecode", text: "3,125 gas per byte of bytecode" },
  { id: "docs", text: "Documentation issues" },
];

const REPO = "https://github.com/Jagadeeshftw/ballast";
const scanned = RECORD.counts.CallbackRan ?? 0;
const windows = RECORD.counts.WindowEnqueued ?? 0;

export default function Findings() {
  return (
    <DocShell
      slug="findings"
      title="Findings"
      lede="What we measured about Somnia and dreamDEX while building on them. Stated flat, as measurements — no complaint, and no apology for the ones that cost us."
      headings={HEADINGS}
    >
      <H2 id="billing">Reactive callbacks are billed at the configured gas limit, not gas used</H2>
      <p>
        <strong>The single most expensive thing we found, and nothing in the documentation says
        it.</strong> A subscription carries a <code>gasLimit</code>, and the reactive
        transaction it fires is charged against that limit whatever it actually consumes. Ours
        ran the library default of 10,000,000.
      </p>
      <div className="docTableWrap">
        <table className="docTable">
          <thead><tr><th>Measure</th><th className="num">Gas</th></tr></thead>
          <tbody>
            <tr><td>Limit provisioned</td><td className="num"><strong>10,000,000</strong></td></tr>
            <tr><td>Used, across twenty consecutive receipts</td><td className="num"><strong>1,479,630 – 1,497,350</strong></td></tr>
            <tr><td>Effective price</td><td className="num">7 gwei</td></tr>
            <tr><td>Charged per callback</td><td className="num"><strong>0.07 STT</strong></td></tr>
          </tbody>
        </table>
      </div>
      <p>
        A <strong>6.7× overpay on every wake</strong>. The fix is a one-line
        <code>setSubscriptionFees</code>, but applying it means closing and reopening the
        subscription, and opening requires the owner to hold <strong>32 STT</strong> — so an
        engine that has burned below that floor cannot cheapen its way back out.
      </p>

      <H2 id="flat">Because billing is flat, the price has nothing to do with the work</H2>
      <p>
        The limit is charged whatever the callback does, and our handler has two paths that are
        not remotely comparable in cost.
      </p>
      <div className="docTableWrap">
        <table className="docTable">
          <thead><tr><th>Wakes</th><th className="num">Count</th><th>What that wake did</th></tr></thead>
          <tbody>
            <tr><td>Every wake billed</td><td className="num"><strong>2,715</strong></td><td>—</td></tr>
            <tr><td>Window registrations</td><td className="num"><strong>2,281</strong> (84%)</td><td>One struct write and one price read</td></tr>
            <tr><td>Drain wakes</td><td className="num"><strong>434</strong> (16%)</td><td>Walk the pending list and the enrolled users; emitted {scanned.toLocaleString("en-GB")} scans</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        Those add up exactly: 2,281 + 434 = 2,715. Every wake did something — but{" "}
        <strong>84% of them did the cheap thing and were charged for the expensive one.</strong>{" "}
        The 6.7× above is the overpay on an average wake; this is the observation that there is
        no average wake, and a project cannot optimise for it because the only lever is a single
        subscription-wide limit that must be set for the heaviest path.
      </p>

      <H2 id="estimate">eth_estimateGas runs roughly 4× over actual</H2>
      <p>
        Settling 42 positions, estimated then executed: estimates of 2,053,708 – 2,796,559
        against actual usage of 597,706 – 797,706. A ratio of <strong>3.5 to 4.2×</strong>.
      </p>
      <p>
        It is safe — a limit set from the estimate always succeeds — but it means the estimate
        is a <strong>ceiling, not a forecast</strong>. Read with the finding above, a
        subscription whose limit was set from an estimate pays roughly{" "}
        <strong>twenty-five times</strong> what the work costs.
      </p>

      <H2 id="latch">The latch sweep</H2>
      <p>
        Prompted by a real production failure. <code>pendingTickAt</code> was set by one path
        and cleared only by an inbound reactive callback — and Phase 0 had already recorded that
        reactive matches can be evicted from a full queue or deferred indefinitely at low
        priority. The code trusted them anyway.
      </p>
      <div className="callout">
        <span className="calloutTitle">One missed tick stalled the ladder silently</span>
        <strong>62 windows enqueued over twenty minutes, not one attempted, and no event to say
        why.</strong> Silence is the worst failure mode: nothing to alert on and nothing to
        read afterwards.
      </div>
      <p>
        Every piece of state in the system was then audited with the same two questions —{" "}
        <em>what clears this, and what happens if that thing never comes?</em> Anything whose
        answer depended on an external arrival with no timeout and no permissionless escape was
        given one. Three needed fixing:
      </p>
      <ul className="bullets">
        <li><strong><code>pendingTickAt</code></strong> — now expires after a grace period and
          emits <code>TickExpired</code> rather than latching forever.</li>
        <li><strong><code>activeSubscriptionId</code></strong> — the protocol removes
          subscriptions on its own when the owner&rsquo;s balance cannot cover the limit, and
          the flag stayed true, so <code>subscriptionHealth()</code> reported subscribed when it
          was not. Now reconcilable permissionlessly.</li>
        <li><strong><code>pendingList</code></strong> — grew without limit; 218 dead entries had
          accumulated. Now prunable permissionlessly.</li>
      </ul>
      <p>
        One remains latent and documented rather than fixed — see{" "}
        <a href="/docs/limitations">Limitations</a>.
      </p>

      <H2 id="bytecode">Somnia charges 3,125 gas per byte of deployed bytecode</H2>
      <p>
        Against Ethereum&rsquo;s 200. For a 17.9 KB contract that is 56M gas for the bytecode
        alone, before anything else. There is also 400,000 per new account, 200,000 per new
        non-zero storage slot, and a 1,000,000 gas <em>remaining</em> requirement that is
        checked but not charged.
      </p>
      <p>
        The trap is that <strong>Foundry&rsquo;s simulation applies Ethereum rules even when
        forking Somnia</strong>. Its estimate for our vault deploy was 2,017,173; the node&rsquo;s
        own estimate was 34,289,290; the bytecode alone required 20,809,375 (6,659 bytes ×
        3,125). A <strong>17× shortfall</strong>, and the first deploy failed on it.
      </p>

      <H2 id="docs">Documentation issues</H2>
      <ul className="bullets">
        <li><strong>The token table is mainnet-only.</strong> Using the documented addresses on
          testnet fails silently rather than reverting.</li>
        <li><strong>Decimals differ between the two.</strong> A split that is easy to carry
          across from mainnet examples and get wrong.</li>
        <li><strong>The explorer URL in circulation does not resolve.</strong>{" "}
          <code>testnet.somniascan.io</code> fails to connect — not a 404, a DNS failure. The
          working explorer is <code>shannon-explorer.somnia.network</code>.</li>
      </ul>
      <p>
        All of it, with the receipts, is written up for the chain team in{" "}
        <a href={`${REPO}/blob/main/docs/somnia-feedback.md`}>somnia-feedback.md</a>.
      </p>
    </DocShell>
  );
}
