import DocShell, { H2, type Heading } from "../DocShell";
import { ADDR, EXPLORER } from "@/lib/chain";

export const dynamic = "force-static";

const HEADINGS: Heading[] = [
  { id: "whose", text: "Whose money it is" },
  { id: "consent", text: "Consent has a shape" },
  { id: "revoke", text: "Revocation" },
  { id: "owner", text: "What the owner cannot do" },
  { id: "operator", text: "The permission we chose not to take" },
];

export default function Custody() {
  return (
    <DocShell
      slug="custody"
      title="Custody"
      lede="Collateral stays in your name, consent is a contract state with a cap and an expiry, and revoking is one transaction that nobody can block or delay."
      headings={HEADINGS}
    >
      <H2 id="whose">Whose money it is</H2>
      <p>
        Deposits sit in{" "}
        <a href={`${EXPLORER}/address/${ADDR.vault}`}>BallastVault</a> recorded against your
        address. <strong>Unreserved balance is withdrawable unconditionally</strong> — not
        subject to the engine running, to a notice period, or to anyone&rsquo;s approval.
      </p>
      <p>
        The only balance you cannot withdraw is what is reserved against cover that is
        currently open, and that reservation is released when the position settles. Settling is
        permissionless, so it is not gated on us either.
      </p>

      <H2 id="consent">Consent has a shape</H2>
      <p>
        A policy is explicit consent with three limits, all checked on every purchase:
      </p>
      <ul className="bullets">
        <li><strong>A make-whole point</strong> — how deep a fall you want covered in full.</li>
        <li><strong>A premium ceiling</strong> — the most you will pay per window, as a share
          of your exposure. Checked per window rather than set as a constant, because the right
          price varies with the book.</li>
        <li><strong>An expiry</strong> — after which the engine can do nothing at all until you
          set a new one.</li>
      </ul>
      <p>
        With no active policy the engine has no authority over the account. That is a contract
        state, not a flag in a database of ours.
      </p>

      <H2 id="revoke">Revocation</H2>
      <div className="callout">
        <span className="calloutTitle">One transaction, immediate, unblockable</span>
        <code>revoke()</code> is called by you and takes effect at once. There is no operator
        path that can set it, block it, delay it, or require anything of you first. Withdrawal
        of unreserved collateral is equally unconditional. Both are reachable in one action
        from <a href="/app/policy">Policy</a> and <a href="/app/funds">Funds</a>.
      </div>

      <H2 id="owner">What the owner cannot do</H2>
      <p>
        The owner can approve engines and configure assets. The owner <strong>cannot move user
        funds</strong>, and that is asserted rather than asserted-about: the vault&rsquo;s test
        suite contains <code>test_OwnerCannotWithdrawUserFunds</code>, and every engine-only
        entry point reverts with <code>NotEngine</code> when called by anyone else.
      </p>
      <p>
        There is one latent gap and it is written down rather than glossed: a reservation has no
        user-side escape if an engine were to reserve and then stop. It is currently unreachable
        — the only caller pairs reserve with spend atomically in one transaction, and a revert
        rolls both back — and the fix is a reservation expiry in the vault, which would mean
        redeploying a vault that holds a live deposit. It is recorded in{" "}
        <a href="/docs/limitations">Limitations</a> so it is a decision rather than an oversight.
      </p>

      <H2 id="operator">The permission we chose not to take</H2>
      <p>
        dreamDEX has an <code>OperatorPermissionsRegistry</code>. Ballast deliberately does not
        use it.
      </p>
      <p>
        Taking operator permission would let Ballast act on <em>your</em> dreamDEX account.
        Instead it is the trader of record: it holds positions in its own name, funded by
        collateral you deposited for that purpose. That means the worst case is bounded by what
        you deposited, and it means <strong>a vault that cannot touch your account is a smaller
        thing to trust</strong> than one that can and promises not to.
      </p>
    </DocShell>
  );
}
