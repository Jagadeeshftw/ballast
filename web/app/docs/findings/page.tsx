import DocShell, { H2, type Heading } from "../DocShell";
import { RECORD } from "@/lib/record";

export const dynamic = "force-static";

const HEADINGS: Heading[] = [
  { id: "billing", text: "Retracted: billing is at gas used" },
  { id: "flat", text: "Retracted: the price follows the work" },
  { id: "estimate", text: "eth_estimateGas runs ~4x over" },
  { id: "latch", text: "The latch sweep" },
  { id: "bytecode", text: "3,125 gas per byte of bytecode" },
  { id: "docs", text: "Documentation issues" },
];

const REPO = "https://github.com/Jagadeeshftw/ballast";
const windows = RECORD.counts.WindowEnqueued ?? 0;

export default function Findings() {
  return (
    <DocShell
      slug="findings"
      title="Findings"
      lede="What we measured about Somnia and dreamDEX while building on them. Stated flat, as measurements — no complaint, and no apology for the ones that cost us."
      headings={HEADINGS}
    >
      <H2 id="billing">Retracted: callbacks are billed at gas used, not at the limit</H2>
      <p>
        <strong>This page said the opposite until 11 September, and it was wrong — never true,
        rather than true once and since changed.</strong> We reported that a reactive callback is
        charged against its subscription&rsquo;s gas limit whatever it uses: 0.07 STT a wake, a
        6.7× overpay. Checked charge by charge, the chain bills gas used.
      </p>
      <div className="docTableWrap">
        <table className="docTable">
          <thead><tr><th>Measure</th><th className="num">Result</th></tr></thead>
          <tbody>
            <tr><td>Charged blocks matched to their receipts, six engines, 1–11 September</td><td className="num"><strong>255</strong></td></tr>
            <tr><td>Equal to gas used × price, to the wei</td><td className="num"><strong>255</strong></td></tr>
            <tr><td>Equal to the gas limit × price</td><td className="num"><strong>0</strong></td></tr>
            <tr><td>The 1–2 September run: 2,715 callbacks over 12.75 hours</td><td className="num"><strong>27.23 STT</strong> burned</td></tr>
            <tr><td>What billing at the limit would have cost</td><td className="num">190.05 STT</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        The 0.07 was our engine&rsquo;s own <code>costPerCallback</code> — the gas limit times
        the fee, a worst-case bound — read as the bill. The receipts showing 1,479,630 –
        1,497,350 gas used were real; the charge paired with them was not. Limits of 10,000,000
        and 4,000,000 and priority fees of 1 and 2 gwei all billed the same way, so our own
        settings do not explain it either.
      </p>
      <p>
        It mattered. On the strength of it we cut the limit to 4,000,000 to save money that was
        never being charged, and at that limit no purchase fits: a callback that buys cover has
        used up to 9,218,505 gas. What stands is the <strong>32 STT</strong> an owner must hold
        to open a subscription — and changing the limit means closing and reopening, so it needs
        that 32 STT again.
      </p>

      <H2 id="flat">Retracted: the price does follow the work</H2>
      <p>
        This section argued that billing was flat — that the {windows.toLocaleString("en-GB")}{" "}
        registration wakes cost the same as a full scan of the book. It followed from the finding
        above and falls with it: charges vary with the work, and single callbacks in seven
        sampled minutes on 1 September cost between 0.0033 and 0.0101 STT.
      </p>

      <H2 id="estimate">eth_estimateGas runs roughly 4× over actual</H2>
      <p>
        Settling 42 positions, estimated then executed: estimates of 2,053,708 – 2,796,559
        against actual usage of 597,706 – 797,706. A ratio of <strong>3.5 to 4.2×</strong>.
      </p>
      <p>
        It is safe — a limit set from the estimate always succeeds — but it means the estimate
        is a <strong>ceiling, not a forecast</strong>. An earlier version said this compounded with limit billing to about{" "}
        <strong>twenty-five times</strong> the cost. It does not: billing is at gas used, so a
        generous limit costs nothing extra.
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
