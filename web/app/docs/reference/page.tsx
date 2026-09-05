import DocShell, { H2, type Heading } from "../DocShell";
import { ADDR, CHAIN_ID, EXPLORER, RPC, RETIRED_ENGINES } from "@/lib/chain";
import { RECORD, recordRange } from "@/lib/record";

export const dynamic = "force-static";

const HEADINGS: Heading[] = [
  { id: "contracts", text: "Contracts" },
  { id: "chain", text: "Chain and RPC" },
  { id: "bounds", text: "Policy bounds" },
  { id: "engines", text: "The engine set" },
  { id: "sources", text: "Source documents" },
  { id: "glossary", text: "Glossary" },
];

const REPO = "https://github.com/Jagadeeshftw/ballast";

/* Addresses come from the same module the app reads, so this page cannot quote an address the
   site is not actually using. */
const CONTRACTS: [string, string, string][] = [
  ["BallastVault", ADDR.vault, "Custody: collateral, policies, reservations"],
  ["HedgeEngine", ADDR.engine, "Trader of record: subscribes, sizes, buys, settles"],
  ["SpotExposureSource", ADDR.source, "Measures what an account holds on the venue"],
  ["dreamDEX binary module", ADDR.binaryModule, "Emits MarketCreated; the subscription's source"],
  ["Oracle hub", ADDR.oracleHub, "Resolves the questions markets settle against"],
  ["tUSDC", ADDR.tusdc, "Collateral token, 6 decimals"],
  ["Demonstration account", ADDR.demoUser, "The account whose history the dashboard shows"],
];

const GLOSSARY: [string, string][] = [
  ["Window", "One Event Contract period — the interval between a market opening and settling. As short as sixty seconds, as long as twenty-four hours."],
  ["Strike", "The price the outcome is measured against. On this venue it is always the window's opening price, so every market is at-the-money."],
  ["Load line", "What you set: how deep a fall you want made whole. It moves the break-even, not the payoff's kink."],
  ["Make-whole point", "The depth of fall at which the cover's net payout exactly equals the position's loss. The same thing as the break-even."],
  ["Break-even", "Where net is zero. One depth, not a range — see What it pays."],
  ["Basis risk", "The gap between a fixed payout and a realised loss. Inherent to parametric cover and not engineerable away on this instrument."],
  ["Parametric cover", "A fixed payout on a trigger, rather than reimbursement of an actual loss. The same class as flight-delay or crop cover."],
  ["Cover price q", "What one Down contract costs, between 0 and 1. It is the market's own probability that the price closes down."],
  ["Achieved versus requested", "Requested is the make-whole point you asked for; achieved is what the book actually allowed. Where they differ, something bound the size."],
  ["Degraded", "A purchase that filled at less cover than requested. Recorded on the position rather than hidden, so the shortfall is visible."],
];

export default function Reference() {
  const range = recordRange();
  const total = Object.values(RECORD.counts).reduce((a, b) => a + b, 0);
  return (
    <DocShell
      slug="reference"
      title="Reference"
      lede="Addresses, chain details, the engine set, links to every document these pages are drawn from, and the vocabulary they use."
      headings={HEADINGS}
    >
      <H2 id="contracts">Contracts</H2>
      <div className="docTableWrap">
        <table className="docTable">
          <thead><tr><th>Contract</th><th>Address</th><th>Role</th></tr></thead>
          <tbody>
            {CONTRACTS.map(([name, addr, role]) => (
              <tr key={addr}>
                <td><strong>{name}</strong></td>
                <td><a className="mono" href={`${EXPLORER}/address/${addr}`}>{addr.slice(0, 12)}…{addr.slice(-6)}</a></td>
                <td>{role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2 id="chain">Chain and RPC</H2>
      <div className="docTableWrap">
        <table className="docTable">
          <tbody>
            <tr><td><strong>Network</strong></td><td>Somnia Shannon testnet</td></tr>
            <tr><td><strong>Chain ID</strong></td><td className="num">{CHAIN_ID}</td></tr>
            <tr><td><strong>RPC</strong></td><td><code>{RPC}</code></td></tr>
            <tr><td><strong>Explorer</strong></td><td><a href={EXPLORER}>{EXPLORER}</a></td></tr>
            <tr><td><strong>Collateral</strong></td><td>tUSDC, 6 decimals</td></tr>
            <tr><td><strong>Gas token</strong></td><td>STT, 18 decimals</td></tr>
          </tbody>
        </table>
      </div>
      <div className="callout note">
        <span className="calloutTitle">Not somniascan</span>
        <code>testnet.somniascan.io</code> appears in some hackathon material and does not
        resolve — a DNS failure rather than a 404. The explorer above is the working one.
      </div>

      <H2 id="bounds">Policy bounds</H2>
      <p>
        The load-line slider on <a href="/app/policy">Policy</a> offers 0.50% to 5.00%.{" "}
        <strong>That range is a convention of the interface, not a guarantee of the
        contract.</strong> Anything calling <code>setPolicy</code> directly is bound only by
        what the vault enforces, which is wider:
      </p>
      <div className="docTableWrap">
        <table className="docTable">
          <thead><tr><th>Parameter</th><th>Enforced on chain</th><th>Offered by the slider</th></tr></thead>
          <tbody>
            <tr>
              <td><strong>Make-whole point</strong></td>
              <td>1 – 10,000 bps (0.01% – 100%). <strong>Zero reverts</strong> with{" "}
                <code>MakeWholeOutOfRange</code> — a zero dial is not a paused policy, and{" "}
                <code>revoke()</code> is how you pause.</td>
              <td>50 – 500 bps</td>
            </tr>
            <tr>
              <td><strong>Premium ceiling</strong></td>
              <td>0 – 10,000 bps. Zero is legal and means no cover will ever clear the check.</td>
              <td>Free entry</td>
            </tr>
            <tr>
              <td><strong>Expiry</strong></td>
              <td>At least <code>MIN_POLICY_DURATION</code> ahead — 60 seconds. Anything sooner
                reverts with <code>PolicyDurationTooShort</code>.</td>
              <td>Days ahead</td>
            </tr>
            <tr><td><strong>Notional cap</strong></td><td>Any <code>uint256</code>; unbounded.</td><td>Free entry</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        The narrower slider range is a judgement about what is useful, not about what is
        permitted: above roughly 5% the premium required to make a position whole grows faster
        than most books can fill. The contract does not stop you, and this page says so rather
        than implying a protection that is not there.
      </p>

      <H2 id="engines">The engine set</H2>
      <p>
        The vault approves a set of engines rather than one, so a redeploy strands nothing: a
        retired engine can still settle cover it opened. See{" "}
        <a href="/docs/how-it-works#engine-set">How it works</a>.
      </p>
      <div className="docTableWrap">
        <table className="docTable">
          <thead><tr><th>Engine</th><th>Status</th></tr></thead>
          <tbody>
            <tr>
              <td><a className="mono" href={`${EXPLORER}/address/${ADDR.engine}`}>{ADDR.engine.slice(0, 12)}…{ADDR.engine.slice(-6)}</a></td>
              <td><strong>Live</strong> — the current deployment</td>
            </tr>
            {RETIRED_ENGINES.map((e) => (
              <tr key={e}>
                <td><a className="mono" href={`${EXPLORER}/address/${e}`}>{e.slice(0, 12)}…{e.slice(-6)}</a></td>
                <td>Retired — still able to settle what it opened</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2 id="sources">Source documents</H2>
      <p>
        These pages are a presentation of documents that live in the repository, and those
        documents remain the source of truth.
      </p>
      <ul className="bullets">
        <li><a href={`${REPO}/blob/main/README.md`}>README</a> — the project in one page.</li>
        <li><a href={`${REPO}/blob/main/docs/instrument-economics.md`}>instrument-economics.md</a> — the strike finding, the payoff, the frequency arithmetic.</li>
        <li><a href={`${REPO}/blob/main/docs/onchain-lifecycle.md`}>onchain-lifecycle.md</a> — the on-chain path, with hashes.</li>
        <li><a href={`${REPO}/blob/main/docs/phase0-findings.md`}>phase0-findings.md</a> — what was verified about the venue before any of this was built.</li>
        <li><a href={`${REPO}/blob/main/docs/latch-sweep.md`}>latch-sweep.md</a> — every piece of state, and what clears it.</li>
        <li><a href={`${REPO}/blob/main/docs/somnia-feedback.md`}>somnia-feedback.md</a> — the findings, written for the chain team.</li>
        <li><a href={`${REPO}/blob/main/docs/run-record.json`}>run-record.json</a> — {total.toLocaleString("en-GB")} events{range ? `, ${range}` : ""}, as captured JSON.</li>
      </ul>

      <H2 id="glossary">Glossary</H2>
      <div className="docTableWrap">
        <table className="docTable">
          <thead><tr><th>Term</th><th>Meaning</th></tr></thead>
          <tbody>
            {GLOSSARY.map(([t, m]) => (
              <tr key={t}><td><strong>{t}</strong></td><td>{m}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </DocShell>
  );
}
