import { ADDR, EXPLORER } from "@/lib/chain";
import { loadPreview, utc } from "./data";
import { positionsFor, totalsFor, cumulativeFor } from "@/lib/portfolio";
import { RECORD, recordRange } from "@/lib/record";
import ChainNote, { Live } from "@/components/site/ChainNote";
import SiteNav from "@/components/site/SiteNav";
import HowTimeline from "@/components/site/HowTimeline";
import NumbersBento from "@/components/site/NumbersBento";
import Faq from "@/components/site/Faq";
import ProblemStream from "@/components/site/ProblemStream";
import HonestScroll from "@/components/site/HonestScroll";
import SiteFooter from "@/components/site/SiteFooter";

export const dynamic = "force-dynamic";

const n2 = (v: number) => v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n0 = (v: number) => v.toLocaleString("en-GB");

/* The worked example is computed from measured values, never round numbers: the live
   exposure, the cover price actually paid on a settled position, and the live policy. It
   lands on zero at the make-whole point because that is what the make-whole point means. */
const Q = 0.494;
const XSTAR = 0.025;

export default async function Landing() {
  const { vault, engine, eth, chainOk } = await loadPreview();

  const rows = positionsFor(ADDR.demoUser);
  const t = totalsFor(rows);
  const cum = cumulativeFor(rows);
  const range = recordRange();

  const ethPx = eth?.ok && eth.price ? eth.price : null;
  const exposure = ethPx ? ethPx * 2 : 0; // the demonstration account holds 2 WETH
  const qty = exposure * XSTAR / (1 - Q);
  const premium = qty * Q;
  const coverNet = qty - premium;
  const at = (fall: number) => -exposure * fall + coverNet;

  const declines = [
    ["No exposure", 640, "no measured spot position in that asset — nothing to cover"],
    ["Placement failed", 225, "the pool rejected the order; the rest of the batch continued"],
    ["Below minimum lot", 153, "the affordable size rounds to zero on the venue's lot grid"],
    ["No liquidity", 58, "the Down book was empty; refused rather than mispriced"],
    ["Cover too expensive", 58, "Down priced above 0.90, where size diverges"],
  ] as const;

  return (
    <div id="top" className="site min-h-screen bg-ground font-sans text-ink">
      {!chainOk && <ChainNote className="siteChainNote" />}
      <SiteNav />

      {/* ══ HERO ══ asymmetric, full-bleed, carrying the same-block proof ══ */}
      {/* The nav is sticky, so it occupies flow; the hero takes the rest of the first screen
          and centres within it rather than relying on fixed padding that overflows. */}
      <section className="relative flex min-h-svh flex-col justify-center overflow-hidden border-b border-rule pt-[56px]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(60% 50% at 18% 0%, var(--hero-glow-a), transparent 65%)," +
              "radial-gradient(45% 40% at 88% 6%, var(--hero-glow-b), transparent 70%)," +
              "linear-gradient(to right, var(--hero-grid) 1px, transparent 1px)," +
              "linear-gradient(to bottom, var(--hero-grid) 1px, transparent 1px)",
            backgroundSize: "auto, auto, 88px 88px, 88px 88px",
            maskImage: "radial-gradient(120% 90% at 30% 0%, #000 30%, transparent 78%)",
            WebkitMaskImage: "radial-gradient(120% 90% at 30% 0%, #000 30%, transparent 78%)",
          }}
        />
        <div className="relative mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-14">
          <div className="grid items-center gap-6 sm:gap-8 lg:grid-cols-[1.3fr_1fr] lg:gap-12">
            <div>
              <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em] text-signal">
                Parametric cover · Somnia · dreamDEX
              </p>
              <h1 className="max-w-[17ch] text-balance text-[clamp(32px,min(4.6vw,7.2vh),64px)] font-black leading-[1.03] tracking-[-0.035em]">
                Your position buys its own cover, in the same block.
              </h1>
              <p className="mt-5 max-w-[52ch] text-[clamp(14.5px,1.25vw,18px)] leading-relaxed text-muted">
                You hold ETH. It can fall while you sleep, and the instruments that would cover
                that fall expire every sixty seconds — so in practice nobody rolls them.{" "}
                <strong className="font-medium text-ink">
                  Ballast does, and nothing of ours is running when it happens.
                </strong>
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <a href="/app"
                  className="rounded-md bg-signal px-6 py-3.5 text-[15px] font-bold text-ground transition hover:brightness-110">
                  Open the dashboard
                </a>
                <a href="#pays"
                  className="rounded-md border border-rulehi px-6 py-3.5 text-[15px] font-bold text-ink transition hover:border-signal">
                  What it actually pays
                </a>
              </div>
            </div>

            {/* the thesis, as evidence */}
            <div className="rounded-xl border border-rule bg-raised/70 backdrop-blur-sm">
              <div className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-2.5 sm:px-5 sm:py-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                  Same block · zero latency
                </span>
                <span className="font-mono text-[11px] font-semibold text-signal">476941284</span>
              </div>
              <div className="grid sm:grid-cols-2">
                <div className="border-b border-rule px-4 py-3 sm:border-b-0 sm:border-r sm:px-5 sm:py-4">
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    dreamDEX opens a window
                  </div>
                  <a href={`${EXPLORER}/tx/0x0434d3649993a20112717df342ffd97952c2257bd4133bb5666da0d075d5fcd4`}
                    className="mt-2 block break-all font-mono text-[12px] text-ink underline decoration-rulehi decoration-dotted underline-offset-4 hover:decoration-signal">
                    0x0434d364…0d075d5fcd4
                  </a>
                </div>
                <div className="px-4 py-3 sm:px-5 sm:py-4">
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    Ballast&rsquo;s handler runs
                  </div>
                  <a href={`${EXPLORER}/tx/0x79bf978b79eed28229298dd5d293d99e77c2e647610d14e3f1bce061eaab74f1`}
                    className="mt-2 block break-all font-mono text-[12px] text-ink underline decoration-rulehi decoration-dotted underline-offset-4 hover:decoration-signal">
                    0x79bf978b…1bce061eaab74f1
                  </a>
                </div>
              </div>
              <p className="border-t border-rule px-4 py-3 text-[12.5px] leading-relaxed text-muted sm:px-5 sm:py-4 sm:text-[13px]">
                Not a fast bot. Somnia&rsquo;s reactivity precompile executes the handler as a
                synthetic transaction{" "}
                <strong className="font-semibold text-paid">inside the block that triggered it</strong>{" "}
                — no keeper, no cron, no operator in the loop.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══ THE PROBLEM ══ a stream you would have to keep up with ══ */}
      <section className="overflow-hidden border-b border-rule">
        <div className="mx-auto max-w-7xl px-6 pt-20 md:px-10 md:pt-24">
          <div className="grid gap-10 md:grid-cols-[1.25fr_auto] md:items-end">
            <div>
              <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em] text-signal">The problem</p>
              <h2 className="max-w-[18ch] text-balance text-[clamp(26px,3.4vw,42px)] font-bold leading-[1.1] tracking-[-0.02em]">
                Cover exists. Keeping up with it does not.
              </h2>
              <p className="mt-5 max-w-[56ch] leading-relaxed text-muted">
                On this venue the instruments that would cover a fall expire every sixty seconds.
                Nobody sits up all night re-buying them, so the position ends up uncovered — not
                by decision, but by fatigue. Ballast is the part that does not get tired.
              </p>
            </div>
            <div className="border-l-2 border-signal pl-7">
              <div className="font-mono text-[40px] font-medium leading-none tracking-tight md:text-[56px]">
                {n0(RECORD.counts.CallbackRan ?? 0)}
              </div>
              <div className="mt-3 max-w-[20ch] font-mono text-[11px] uppercase leading-relaxed tracking-[0.14em] text-muted">
                callbacks delivered without a keeper
              </div>
            </div>
          </div>
        </div>
        <div className="pb-16 md:pb-20">
          <div className="mx-auto max-w-7xl px-6 md:px-10">
            <ProblemStream />
          </div>
        </div>
      </section>

      {/* ══ HOW IT WORKS ══ a real sequence, so a timeline ══ */}
      <section id="how" className="border-b border-rule">
        <HowTimeline />
      </section>

      {/* ══ WHAT IT PAYS ══ the strongest argument, walked one region at a time ══ */}
      <section id="pays" className="border-b border-rule">
        <div className="mx-auto max-w-7xl px-6 py-20 md:px-10 md:py-24">
          <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em] text-signal">The honest part</p>
          <h2 className="max-w-[22ch] text-balance text-[clamp(26px,3.4vw,42px)] font-bold leading-[1.1] tracking-[-0.02em]">
            Exact at one depth. Wrong on both sides of it, on purpose.
          </h2>
          <p className="mt-5 max-w-[64ch] leading-relaxed text-muted">
            Event Contracts are <strong className="font-medium text-ink">at-the-money binaries</strong>:
            one strike per window, struck at the window&rsquo;s opening price, paying a fixed
            amount per winning contract. There is no strike ladder — 562 markets checked, at most
            one strike per venue per window. So{" "}
            <strong className="font-medium text-ink">no quantity of contracts produces a flat net line</strong>,
            and Ballast does not claim one. The gap either side is{" "}
            <strong className="font-medium text-ink">basis risk</strong>, the defining property of{" "}
            <strong className="font-medium text-ink">parametric cover</strong> — the same trade
            flight-delay insurance makes, paying the same whether you missed a meeting or a wedding.
          </p>

          <div className="mt-10">
            <HonestScroll exposure={exposure} coverNet={coverNet}
              at={[at(0.01), at(0.025), at(0.05)]} />
          </div>

          <p className="mt-8 max-w-[76ch] text-[13px] leading-relaxed text-muted">
            Not an illustration. Every figure is computed from the live measured exposure of{" "}
            <span className="font-mono text-ink">{n2(exposure)} tUSDC</span> (2 WETH at{" "}
            {ethPx ? n2(ethPx) : "—"}), the cover price of <span className="font-mono text-ink">{Q}</span>{" "}
            actually paid on a settled position, and the 250 bps make-whole point on the live
            policy. Ballast always shows the make-whole point it{" "}
            <strong className="font-medium text-ink">achieved</strong>, never the one you asked
            for, and says which limit bound the size when they differ.
          </p>
        </div>
      </section>

      {/* ══ THE NUMBERS ══ bento ══ */}
      <section id="numbers" className="border-b border-rule">
        <div className="mx-auto max-w-7xl px-6 py-20 md:px-10 md:py-24">
          <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em] text-signal">It has already done this</p>
          <h2 className="max-w-[24ch] text-balance text-[clamp(26px,3.4vw,42px)] font-bold leading-[1.1] tracking-[-0.02em]">
            Forty-four settled positions, twenty-seven of which paid.
          </h2>

          <NumbersBento
            points={cum}
            settledPremium={n2(t.settledPremium)}
            paidOut={n2(t.paidOut)}
            settledNet={n2(t.settledNet)}
            paid={t.paid}
            settled={t.settled}
          />

          <p className="mt-6 max-w-[72ch] text-[14px] leading-relaxed text-muted">
            At-the-money cover is the most expensive cover this instrument offers. Because the
            strike is the window&rsquo;s open, there is no cheaper out-of-the-money strike to buy
            instead, so you pay for the very likely small moves too.{" "}
            {range && <>Recorded run, {range}.</>}
          </p>
        </div>
      </section>

      {/* ══ REFUSALS ══ dashed ledger ══ */}
      <section className="border-b border-rule">
        <div className="mx-auto max-w-7xl px-6 py-20 md:px-10 md:py-24">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:items-start">
            <div>
              <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em] text-signal">And it refuses</p>
              <h2 className="max-w-[18ch] text-balance text-[clamp(26px,3.4vw,42px)] font-bold leading-[1.1] tracking-[-0.02em]">
                A refusal is a decision.
              </h2>
              <p className="mt-5 max-w-[46ch] leading-relaxed text-muted">
                {n0(RECORD.counts.CoverSkipped ?? 0)} windows were declined and{" "}
                {n0(RECORD.counts.WindowGaveUp ?? 0)} were abandoned after the retry ladder ran out.
                Each carries the reason the contract recorded — not a generic failure. A system that
                shows only what it did is hiding what it chose not to.
              </p>
            </div>

            {/* Not a bordered container. The counts differ by an order of magnitude, so the
                rule under each row is drawn to that length — the section becomes a small
                chart of what the engine refused, which is what the numbers actually are. */}
            <dl className="space-y-7">
              {declines.map(([label, count, why]) => (
                <div key={label}>
                  <div className="flex items-baseline justify-between gap-6">
                    <dt className="font-medium">{label}</dt>
                    <dd className="shrink-0 font-mono text-lg text-signal">{n0(count)}</dd>
                  </div>
                  <dd className="mt-1 text-[13px] leading-relaxed text-muted">{why}</dd>
                  <div className="mt-3 h-px w-full bg-rule" aria-hidden="true">
                    <div className="h-px bg-signal/70"
                      style={{ width: `${Math.round((count / declines[0][1]) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ══ CURRENT STATE ══ */}
      <section className="border-b border-rule">
        <div className="mx-auto max-w-7xl px-6 py-20 md:px-10 md:py-24">
          <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-start">
            <div>
              <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em] text-signal">Current state</p>
              <h2 className="max-w-[20ch] text-balance text-[clamp(26px,3.4vw,42px)] font-bold leading-[1.1] tracking-[-0.02em]">
                {engine?.subscribed
                  ? "Running, and watching every window."
                  : "It is stopped, and the reason is worth reading."}
              </h2>
              <p className="mt-5 max-w-[54ch] leading-relaxed text-muted">
                Somnia bills a reactive callback at its{" "}
                <strong className="font-medium text-ink">gas limit</strong>, not at its usage. Ours
                was provisioned 10,000,000 and uses about 1,490,000 across twenty measured
                receipts, so every wake cost 0.07 STT rather than the 0.010 it burned — a 6.7×
                overpay. dreamDEX rolls about 147 windows an hour across every series and the engine
                is woken for all of them, which is 12.8 STT an hour on a testnet whose faucet pays
                0.5 a day.
              </p>
              <p className="mt-4 max-w-[54ch] leading-relaxed text-muted">
                The fix needs no new contract — the limit is a subscription parameter — but applying
                it means reopening the subscription, and that requires the engine to hold{" "}
                <strong className="font-medium text-ink">32 STT</strong>, a floor checked once at
                creation and never spent. It holds {engine ? (Number(engine.balance) / 1e18).toFixed(2) : "an amount we could not read"}.{" "}
                <strong className="font-medium text-ink">topUp() is payable and permissionless</strong>,
                so anyone can restart it.
              </p>
            </div>

            <dl className="rounded-xl border border-rule bg-raised p-6 font-mono text-[13px]">
              {[
                ["Engine balance", engine ? `${(Number(engine.balance) / 1e18).toFixed(6)} STT` : "—"],
                ["Subscribed", engine ? String(engine.subscribed) : "—"],
                ["Callbacks delivered", engine ? n0(Number(engine.callbackCount)) : "—"],
                ["Vault balance", vault ? `${n2(Number(vault.collateral) / 1e6)} tUSDC` : "—"],
                ["Withdrawable now", vault ? `${n2(Number(vault.free) / 1e6)} tUSDC` : "—"],
                ["ETH spot", ethPx ? n2(ethPx) : "unpriceable — book one-sided"],
                ["Read at", utc(Math.floor(Date.now() / 1000))],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 border-b border-rule py-2.5 last:border-0">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ══ FAQ ══ native details, so it opens without JavaScript ══ */}
      <section id="faq" className="border-b border-rule">
        <Faq exposure={exposure} coverNet={coverNet} premium={premium} qty={qty} />
      </section>

      {/* ══ GAPS ══ */}
      <section className="border-b border-rule">
        <div className="mx-auto max-w-7xl px-6 py-16 md:px-10 md:py-20">
          <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.18em] text-signal">What is not proven</p>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              ["A void has never happened on chain.", "The void settlement branch is covered by unit tests against a mock and has never executed against a real voided market."],
              ["poke() is untested at mainnet liquidity.", "It has only run against thin testnet books. Behaviour under deep books — partial fills in particular — is not demonstrated."],
              ["SOMI cannot be covered at all.", "Binary markets exist for BTC and ETH only, so SOMI spot has no corresponding binary. The exposure source returns zero rather than guessing."],
            ].map(([h, b]) => (
              <div key={h} className="border-t border-rulehi pt-4">
                <h3 className="font-medium leading-snug">{h}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function Cell({ k, v, u, tone }: { k: string; v: string; u: string; tone?: "paid" | "lost" }) {
  return (
    <div className="rounded-xl border border-rule bg-raised p-6">
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{k}</div>
      <div className={`mt-3 font-mono text-[clamp(24px,2.4vw,32px)] font-medium leading-none tracking-tight ${
        tone === "paid" ? "text-paid" : tone === "lost" ? "text-lost" : "text-ink"}`}>
        {v}
      </div>
      <div className="mt-2 font-mono text-[11px] text-muted">{u}</div>
    </div>
  );
}
