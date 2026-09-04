const n2 = (v: number) => v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Native <details>, not an accordion driven by state.
 *
 * The Aceternity FAQ renders its answer only while open, so with JavaScript disabled no answer
 * would ever be readable — and this page has to render completely without it. <details> opens
 * natively, is keyboard-operable for free, and is announced correctly by screen readers.
 *
 * Every figure below is computed from the same measured values the payoff table uses.
 */
export default function Faq({
  exposure, coverNet, premium, qty,
}: { exposure: number; coverNet: number; premium: number; qty: number }) {
  const at = (fall: number) => -exposure * fall + coverNet;

  const items: [string, React.ReactNode][] = [
    [
      "What happens if ETH falls 50%?",
      <>
        You are covered for a fraction of it, and the page will say so rather than imply
        otherwise. The payout is fixed: {n2(qty)} contracts pay {n2(qty)} tUSDC whatever the
        size of the fall. At a 50% fall your spot loses{" "}
        <span className="font-mono text-ink">{n2(exposure * 0.5)}</span> and the cover nets{" "}
        <span className="font-mono text-paid">+{n2(coverNet)}</span>, leaving{" "}
        <span className="font-mono text-lost">{n2(at(0.5))}</span>. That is basis risk working
        against you, and it is the trade parametric cover makes. If you want deeper cover you
        set a deeper make-whole point and pay more premium per window for it.
      {" "}<a href="/docs/what-it-pays">The full payoff, with the three regions →</a></>,
    ],
    [
      "Do I pay every window?",
      <>
        Yes. Premium is paid per window, which is exactly why the frequency matters so much.
        At the live price a 250 bps make-whole point costs{" "}
        <span className="font-mono text-ink">{n2(premium)} tUSDC</span> per window on this
        position. Rolling that every sixty seconds is ruinous — the spread alone runs to
        hundreds of percent a year — which is why the product defaults to the four-hour and
        twenty-four-hour windows. The sixty-second series exists here because it is what makes
        the same-block behaviour visible in a demo, not because it is what you should buy.
      {" "}<a href="/docs/economics">What the roll frequency costs →</a></>,
    ],
    [
      "Where does the payout come from?",
      <>
        The binary market&rsquo;s own collateral. Ballast buys Down contracts on dreamDEX with
        your deposited tUSDC and holds them in its own name; when the window resolves it
        redeems them and credits the proceeds straight to your vault balance. There is no
        counterparty of ours, no pool of ours, and nothing to be solvent. A losing redeem
        returns zero rather than failing, which is a normal outcome, not an error.
      {" "}<a href="/docs/how-it-works">The contracts and the on-chain path →</a></>,
    ],
    [
      "Why is the engine not running right now?",
      <>
        It ran out of gas, and the reason is a measured property of the venue rather than a
        fault. Somnia bills a reactive callback at its gas <em>limit</em> — ours was
        provisioned 10,000,000 and used about 1,490,000, so each wake cost 0.07 STT instead of
        0.010. At roughly 147 windows an hour that is 12.8 STT an hour, against a faucet paying
        0.5 a day. The fix is a subscription parameter rather than a new contract, but applying
        it needs 32 STT held at creation. <span className="font-mono text-ink">topUp()</span>{" "}
        is payable and permissionless, so anyone can restart it.
      {" "}<a href="/docs/findings#billing">The measurement behind it →</a></>,
    ],
    [
      "Is my collateral locked?",
      <>
        No. Unreserved collateral is withdrawable unconditionally and no operator can block or
        delay it. Only collateral committed to cover that is currently open is reserved, and
        that releases automatically when the window settles. Revoking the policy stops new
        cover immediately; cover already open runs to settlement and pays out to you as normal.
      {" "}<a href="/docs/custody">Custody, consent and revocation →</a></>,
    ],
    [
      "What does it do when it cannot price the book?",
      <>
        It refuses, and records why. If the Down side is one-sided, or priced above 0.90 where
        size diverges, or the affordable size rounds below the venue&rsquo;s minimum lot, the
        window is skipped with that reason written to the chain. It never guesses a price, and
        it never reports a position as covered before the fill is confirmed.
      {" "}<a href="/docs/refusals#unpriceable">Every refusal reason →</a></>,
    ],
  ];

  return (
    <div className="mx-auto max-w-7xl px-6 py-20 md:px-10 md:py-24">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <div>
          <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em] text-signal">Questions</p>
          <h2 className="max-w-[16ch] text-balance text-[clamp(26px,3.4vw,42px)] font-bold leading-[1.1] tracking-[-0.02em]">
            The ones worth asking.
          </h2>
          <p className="mt-5 max-w-[40ch] leading-relaxed text-muted">
            Every number in these answers comes from the chain or from the recorded run. None of
            them is illustrative.
          </p>
        </div>

        <div className="-mt-2">
          {items.map(([q, a]) => (
            <details key={q} className="group border-b border-rule py-6 last:border-0">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-[17px] font-medium transition-colors marker:hidden hover:text-signal">
                <span className="flex gap-4">
                  <span aria-hidden="true"
                    className="mt-[3px] shrink-0 font-mono text-[12px] text-signal transition-transform duration-200 group-open:rotate-90">
                    ▸
                  </span>
                  {q}
                </span>
              </summary>
              <div className="mt-4 max-w-[62ch] pl-8 text-[15px] leading-relaxed text-muted">{a}</div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
