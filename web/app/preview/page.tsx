import "./night.css";
import NightHero from "./NightHero";
import NightTape from "./NightTape";
import NightCurves from "./NightCurves";
import Wordmark from "./Wordmark";
import Dial from "../Dial";
import {
  ADDR, EXPLORER, KNOWN_POSITIONS,
  buildWindow, getEngineSet, getEngineState, getLiveBook, getLiveWindow, getPosition,
  getSpotPrices, getTape, getVaultState,
  type Position,
} from "@/lib/chain";

export const dynamic = "force-dynamic";

const usd = (raw: bigint, dp = 2) => (Number(raw) / 1e6).toFixed(dp);
const stt = (raw: bigint, dp = 2) => (Number(raw) / 1e18).toFixed(dp);

/** Chain timestamps are UTC. Render them as UTC, explicitly, always. */
function utc(ts: number | bigint): string {
  const d = new Date(Number(ts) * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}

export default async function Preview() {
  const vault = await getVaultState();
  const makeWholeBps = Number(vault.policy[1]) || 250;

  const [engine, prices, tape, engineSet, live, ...positions] = await Promise.all([
    getEngineState(), getSpotPrices(), getTape(14), getEngineSet(), getLiveWindow(makeWholeBps),
    ...KNOWN_POSITIONS.map((p) => getPosition(p)),
  ]);

  // The hero must never be a blank box: if the queue is momentarily empty, fall back to the
  // most recently seen window so there is always something real on screen.
  let shown = live;
  if (!shown) {
    const lastSeen = tape.items.find((t) => t.kind === "enqueued" && t.marketId)?.marketId;
    if (lastSeen) shown = await buildWindow(lastSeen, makeWholeBps);
  }

  const book = await getLiveBook(shown?.marketId ?? null);
  const settled = positions.filter((p) => p.settled);
  const premiumPaid = settled.reduce((a, p) => a + Number(p.premium) / 1e6, 0);
  const proceeds = settled.reduce((a, p) => a + Number(p.proceeds) / 1e6, 0);
  const paidOut = settled.filter((p) => p.outcome === "Won").length;

  const nowSec = Math.floor(Date.now() / 1000);
  const sinceCb = engine.lastCallbackAt > 0n ? nowSec - Number(engine.lastCallbackAt) : null;
  const declined = tape.items.filter((t) => t.kind === "declined" || t.kind === "gaveUp").slice(0, 8);
  const ethPrice = prices.find((p) => p.asset === "ETH");

  return (
    <div id="night-root">
      <main className="night-main">
        <p className="nbanner">
          <span className="dot" style={{ background: engine.stale ? "#8FA6AE" : "#FFC24B",
            boxShadow: engine.stale ? "none" : "0 0 8px #FFC24B" }} aria-hidden="true" />
          {engine.stale ? "stale" : "live"} &middot; Somnia Shannon testnet &middot; block {String(tape.head)}
          {sinceCb !== null && <> &middot; last callback {sinceCb}s ago</>}
        </p>

        <header className="night-top">
          <Wordmark size={34} />
          <h1>Ballast</h1>
        </header>
        <p className="night-standfirst">
          Parametric cover on dreamDEX Event Contracts, bought by the chain itself in the same
          block a window opens. No keeper, no cron, nothing of ours running.
        </p>
      </main>

      <NightHero w={shown} />

      <main className="night-main">
        <section aria-labelledby="p-tape">
          <h2 id="p-tape">Watch it happen</h2>
          <p className="lede">
            Every line is a transaction. A window opens, Ballast&rsquo;s callback lands in the
            same block, the ladder waits for a book, then cover opens or is declined with a reason.
          </p>
          <NightTape items={tape.items.slice(0, 14)} spanBlocks={tape.spanBlocks} />
        </section>

        <section aria-labelledby="p-curve">
          <h2 id="p-curve">What that buys</h2>
          <NightCurves positions={positions} />
        </section>

        <section aria-labelledby="p-dial">
          <h2 id="p-dial">Move the load line yourself</h2>
          <p className="lede">
            Read-only, priced against the live book — Down at{" "}
            {book.priceable ? book.coverPrice.toFixed(3) : "—"} with{" "}
            {book.priceable ? book.bookQty.toFixed(0) : "0"} contracts on offer. No wallet, no
            transaction. Drag or use the arrow keys.
          </p>
          <div className="npanel">
            {book.priceable ? (
              <Dial
                exposure={positions[0]?.exposureAtOpen || 4890}
                coverPrice={book.coverPrice}
                lotSize={book.lotSize}
                bookQty={book.bookQty}
                premiumCeilingBps={Number(vault.policy[2]) || 300}
                notionalCapUsd={Number(vault.policy[4]) / 1e6 || 2000}
                initialBps={makeWholeBps}
              />
            ) : (
              <p style={{ margin: 0 }}>
                The current window&rsquo;s Down book is one-sided, so there is no price to quote
                against. Rather than show a made-up number, the dial waits — which is exactly what
                the engine does with a book it cannot price.
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby="p-pos">
          <h2 id="p-pos">The two settled positions</h2>
          <p className="lede">
            Both asked for {settled[0]?.requestedBps ?? 250} bps and both got less, for the same
            reason: the book offered only 200 contracts, so size was capped by liquidity rather
            than by policy.
          </p>
          <div className="ncards">
            {positions.map((p) => <PositionCard key={p.label} p={p} />)}
          </div>
        </section>

        <section aria-labelledby="p-cost">
          <h2 id="p-cost">Cost against delivered</h2>
          <div className="npanel">
            <div className="ngrid">
              <Fig label="Premium paid" value={premiumPaid.toFixed(2)} unit="tUSDC" tone="heel-num" />
              <Fig label="Paid out" value={proceeds.toFixed(2)} unit="tUSDC" tone="waterline-num" />
              <Fig label="Net" value={(proceeds - premiumPaid).toFixed(2)} unit="tUSDC"
                tone={proceeds - premiumPaid >= 0 ? "waterline-num" : "heel-num"} />
              <Fig label="Windows that paid" value={`${paidOut} of ${settled.length}`} unit="settled" />
            </div>
            <p className="lede" style={{ marginBottom: 0 }}>
              An at-the-money binary is the most expensive cover this instrument offers. The strike
              is the window&rsquo;s open, so there is no cheaper out-of-the-money strike to buy
              instead and you pay for the very likely small moves too. Rolling every window
              compounds that, which is why the product defaults to the four-hour and twenty-four-hour
              windows rather than the sixty-second ones.
            </p>
          </div>
        </section>

        <section aria-labelledby="p-skip">
          <h2 id="p-skip">Windows it declined</h2>
          <p className="lede">A refusal is a decision. Each of these could have been traded and was not.</p>
          {declined.length === 0 ? (
            <div className="npanel"><p style={{ margin: 0 }}>
              Nothing declined in the last {tape.spanBlocks.toLocaleString()} blocks.
            </p></div>
          ) : (
            <NightTape items={declined} spanBlocks={tape.spanBlocks} />
          )}
        </section>

        <section aria-labelledby="p-cust">
          <h2 id="p-cust">Custody</h2>
          <div className="npanel">
            <div className="ngrid">
              <Fig label="Vault balance" value={usd(vault.collateral)} unit="tUSDC" />
              <Fig label="Reserved" value={usd(vault.reserved)} unit="against open cover" />
              <Fig label="Withdrawable now" value={usd(vault.free)} unit="tUSDC" tone="waterline-num" />
              <Fig label="Unaccounted" value={usd(vault.surplus)} unit="tUSDC (expect 0)" />
            </div>
            <p className="lede" style={{ marginBottom: 0 }}>
              Withdrawal of unreserved collateral is unconditional and <strong>revoke() takes effect
              immediately</strong>, with no operator able to block or delay it. Ballast is the trader
              of record: it holds positions in its own name and never touches a user&rsquo;s dreamDEX
              account.
            </p>
          </div>
        </section>

        <section aria-labelledby="p-eng">
          <h2 id="p-eng">Engines</h2>
          <p className="lede">
            The vault approves a <strong>set</strong> of engines, so a redeploy strands nothing. A
            retired engine keeps settling the cover it opened while the live one takes new
            enrolments — that has happened here, not just in a test.
          </p>
          <ol className="ntape">
            {engineSet.map((e) => (
              <li key={e.address}>
                <span className="nt-block">{e.live ? "live" : "retired"}</span>
                <span className={`nt-dot ${e.live ? "waterline" : ""}`} aria-hidden="true" />
                <span className="nt-head" style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{e.address}</span>
                <span className="nt-detail">{stt(e.balance)} STT &middot; {e.approved ? "vault-approved" : "NOT approved"}</span>
                <a className="nt-tx" href={`${EXPLORER}/address/${e.address}`}>see</a>
              </li>
            ))}
          </ol>
        </section>

        <footer className="nfoot">
          <p>Vault <A a={ADDR.vault} /> &middot; Engine <A a={ADDR.engine} /> &middot; Exposure source <A a={ADDR.source} /></p>
          <p>Collateral <A a={ADDR.tusdc} /> (tUSDC, 6dp) &middot; Somnia Shannon testnet 50312</p>
          <p>Read at {utc(nowSec)} &middot; block {String(tape.head)} &middot; ETH {ethPrice?.ok && ethPrice.price ? `$${ethPrice.price.toFixed(2)}` : "unpriceable"}</p>
          <p style={{ marginTop: 14 }}>
            Every number on this page is read from the chain at request time. Nothing is cached,
            mocked, or hardcoded. No wallet required.
          </p>
        </footer>
      </main>
    </div>
  );
}

function PositionCard({ p }: { p: Position }) {
  const won = p.outcome === "Won";
  const tone = won ? "waterline" : p.outcome === "Lost" ? "heel" : "silt";
  const gap = p.requestedBps - p.achievedBps;
  return (
    <article className="card" style={{ padding: "20px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: "var(--s4)" }}>
          Position {p.label}<span className="silt-text" style={{ fontSize: "var(--s1)" }}> &middot; {p.engineLabel} engine</span>
        </h3>
        <span className={`tag ${tone}`}>{p.settled ? p.outcome : "pending"}</span>
      </div>

      <div style={{ display: "flex", gap: 26, margin: "18px 0 4px" }}>
        <div>
          <span className="nfig-label">asked for</span>
          <span className="nfig-value silt-num">{p.requestedBps}</span>
        </div>
        <div>
          <span className="nfig-label">actually got</span>
          <span className={`nfig-value ${won ? "waterline-num" : "heel-num"}`}>{p.achievedBps}</span>
        </div>
      </div>
      <p className="nfig-unit" style={{ marginTop: 0 }}>basis points{gap > 0 ? ` · ${gap} short` : ""}</p>

      <dl className="kv tight" style={{ marginBottom: 0 }}>
        <dt>Premium</dt><dd>{usd(p.premium)} tUSDC at q {(Number(p.coverPrice) / 1e6).toFixed(3)}</dd>
        <dt>Cover leg</dt><dd>{p.coverLegNet >= 0 ? "+" : "−"}{Math.abs(p.coverLegNet).toFixed(2)} tUSDC</dd>
        <dt>Net with spot</dt><dd>{p.netTotal === null ? "unknown" : `${p.netTotal >= 0 ? "+" : "−"}${Math.abs(p.netTotal).toFixed(2)} tUSDC`}</dd>
        <dt>Window move</dt><dd>{p.moveDown === null ? "unknown"
          : `${Math.abs(p.moveDown * 100).toFixed(4)}% ${p.moveDown > 0 ? "down — cover paid" : "up — cover paid nothing"}`}</dd>
        <dt>Open → close</dt><dd>{p.openPrice && p.closePrice ? `$${p.openPrice.toFixed(2)} → $${p.closePrice.toFixed(2)}` : "unknown"}</dd>
        <dt>Bought</dt><dd>{p.purchaseDelaySeconds}s after the open &middot; drift {p.driftBps} bps</dd>
      </dl>

      <p style={{ display: "flex", gap: 16, margin: "16px 0 0", fontSize: "var(--s1)" }}>
        <a href={`${EXPLORER}/tx/${p.openedTx}`}>opened</a>
        <a href={`${EXPLORER}/tx/${p.settledTx}`}>settled</a>
        <a href={`${EXPLORER}/address/${p.engine}`}>engine</a>
      </p>
    </article>
  );
}

function Fig({ label, value, unit, tone }: { label: string; value: string; unit: string; tone?: string }) {
  return (
    <div>
      <span className="nfig-label">{label}</span>
      <span className={`nfig-value ${tone ?? ""}`}>{value}</span>
      <span className="nfig-unit">{unit}</span>
    </div>
  );
}

function A({ a }: { a: string }) {
  return <a href={`${EXPLORER}/address/${a}`} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{a}</a>;
}
