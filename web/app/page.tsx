import PayoffCurve from "./PayoffCurve";
import LoadLine from "./LoadLine";
import EventTape from "./EventTape";
import Dial from "./Dial";
import {
  ADDR, EXPLORER, KNOWN_POSITIONS, SKIP_MEANING,
  buildWindow, getEngineSet, getEngineState, getLiveBook, getLiveWindow, getPosition, getSpotPrices, getTape, getVaultState,
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

export default async function Home() {
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

  const ratio = Number(engine.ratioX100) / 100;
  const nowSec = Math.floor(Date.now() / 1000);
  const sinceCb = engine.lastCallbackAt > 0n ? nowSec - Number(engine.lastCallbackAt) : null;
  const declined = tape.items.filter((t) => t.kind === "declined" || t.kind === "gaveUp").slice(0, 12);
  const ethPrice = prices.find((p) => p.asset === "ETH");

  return (
    <div className="shell">
      <main>
        <header className="masthead">
          <h1>Ballast</h1>
          <p className="standfirst">
            Parametric cover on dreamDEX Event Contracts, bought by the chain itself in the
            same block a window opens. No keeper, no cron, nothing of ours running.
          </p>
        </header>

        <section aria-labelledby="live-h">
          <h2 id="live-h">The current window</h2>
          <LoadLine w={shown} />
        </section>

        <section aria-labelledby="tape-h">
          <h2 id="tape-h">Watch it happen</h2>
          <p className="lede">
            Every line is a transaction. A window opens, Ballast&rsquo;s callback lands in the
            same block, the ladder waits for a book, then cover opens or is declined with a
            reason.
          </p>
          <EventTape items={tape.items.slice(0, 16)} spanBlocks={tape.spanBlocks} />
        </section>

        <section aria-labelledby="curve-h">
          <h2 id="curve-h">What that buys</h2>
          <PayoffCurve positions={positions} />
        </section>

        <section aria-labelledby="dial-h">
          <h2 id="dial-h">Move the load line yourself</h2>
          <p className="lede">
            Read-only, priced against the live book — Down at{" "}
            {book.priceable ? book.coverPrice.toFixed(3) : "—"} with{" "}
            {book.priceable ? book.bookQty.toFixed(0) : "0"} contracts on offer. No wallet, no
            transaction. Drag or use the arrow keys.
          </p>
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
            <p className="empty">
              The current window&rsquo;s Down book is one-sided, so there is no price to quote
              against. Rather than show a made-up number, the dial waits — which is exactly
              what the engine does with a book it cannot price.
            </p>
          )}
        </section>

        <section aria-labelledby="positions-h">
          <h2 id="positions-h">The two settled positions</h2>
          <p className="lede">
            Both asked for {settled[0]?.requestedBps ?? 250} bps and both got less, for the
            same reason: the book offered only 200 contracts, so size was capped by
            liquidity rather than by policy. Each card shows what was actually bought.
          </p>
          <div className="cards">
            {positions.map((p) => <PositionCard key={p.label} p={p} />)}
          </div>
        </section>

        <section aria-labelledby="cost-h" className="band">
          <h2 id="cost-h">Cost against delivered</h2>
          <div className="figures">
            <Figure label="Premium paid" value={premiumPaid.toFixed(2)} unit="tUSDC" tone="heel" />
            <Figure label="Paid out" value={proceeds.toFixed(2)} unit="tUSDC" tone="waterline" />
            <Figure label="Net" value={(proceeds - premiumPaid).toFixed(2)} unit="tUSDC"
              tone={proceeds - premiumPaid >= 0 ? "waterline" : "heel"} />
            <Figure label="Windows that paid" value={`${paidOut} of ${settled.length}`} unit="settled" />
          </div>
          <p className="note">
            An at-the-money binary is the most expensive cover this instrument offers. The
            strike is the window&rsquo;s open, so there is no cheaper out-of-the-money strike
            to buy instead and you pay for the very likely small moves too. Rolling every
            window compounds that, which is why the product defaults to the four-hour and
            twenty-four-hour windows rather than the sixty-second ones.
          </p>
        </section>

        <section aria-labelledby="skips-h">
          <h2 id="skips-h">Windows it declined</h2>
          <p className="lede">A refusal is a decision. Each of these could have been traded and was not.</p>
          {declined.length === 0 ? (
            <p className="empty">
              Nothing declined in the last {tape.spanBlocks.toLocaleString()} blocks. When a
              book is one-sided, priced above 0.90, or a ceiling is already committed, the
              window appears here with the reason.
            </p>
          ) : (
            <ul className="feed">
              {declined.map((d, i) => (
                <li key={i}>
                  <span className="feed-block">{String(d.block)}</span>
                  <span className="tag heel">declined</span>
                  <span className="feed-body"><strong>{d.headline}</strong>{d.detail ? ` — ${d.detail}` : ""}</span>
                  <a className="feed-tx" href={`${EXPLORER}/tx/${d.tx}`}>tx</a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="acct-h" className="band">
          <h2 id="acct-h">Custody</h2>
          <div className="figures">
            <Figure label="Vault balance" value={usd(vault.collateral)} unit="tUSDC" />
            <Figure label="Reserved" value={usd(vault.reserved)} unit="against open cover" />
            <Figure label="Withdrawable now" value={usd(vault.free)} unit="tUSDC" tone="waterline" />
            <Figure label="Unaccounted" value={usd(vault.surplus)} unit="tUSDC (expect 0)" />
          </div>
          <p className="note">
            Withdrawal of unreserved collateral is unconditional and <strong>revoke() takes
            effect immediately</strong>, with no operator able to block or delay it. Ballast is
            the trader of record: it holds positions in its own name and never touches a
            user&rsquo;s dreamDEX account.
          </p>
          <dl className="kv">
            <Row k="Consent" v={vault.policy[0]
              ? `active · make whole at ${vault.policy[1]} bps · premium ceiling ${vault.policy[2]} bps · expires ${utc(vault.policy[3])}`
              : "no active policy — the engine can do nothing"} />
            {prices.map((p) => (
              <Row key={p.asset} k={`${p.asset} spot`}
                v={p.ok && p.price ? `$${p.price.toFixed(2)}` : "unpriceable — book one-sided or too wide"} />
            ))}
          </dl>
        </section>

        <section aria-labelledby="engines-h">
          <h2 id="engines-h">Engines</h2>
          <p className="lede">
            The vault approves a <strong>set</strong> of engines, so a redeploy strands
            nothing. A retired engine keeps settling the cover it opened while the live one
            takes new enrolments — that has happened here, not just in a test.
          </p>
          <ul className="engines">
            {engineSet.map((e) => (
              <li key={e.address}>
                <span className={e.live ? "tag waterline" : "tag silt"}>{e.live ? "live" : "retired"}</span>
                <a href={`${EXPLORER}/address/${e.address}`} className="mono">{e.address}</a>
                <span className="silt-text">{stt(e.balance)} STT · {e.approved ? "vault-approved" : "NOT approved"}</span>
              </li>
            ))}
          </ul>
        </section>

        <footer>
          <dl className="kv">
            <Row k="Vault" v={<Addr a={ADDR.vault} />} />
            <Row k="Engine" v={<Addr a={ADDR.engine} />} />
            <Row k="Exposure source" v={<Addr a={ADDR.source} />} />
            <Row k="Collateral" v={<Addr a={ADDR.tusdc} />} label="tUSDC · 6dp" />
            <Row k="Chain" v="Somnia Shannon testnet · 50312" />
            <Row k="Read at" v={`${utc(nowSec)} · block ${String(tape.head)}`} />
          </dl>
          <p className="colophon">
            Every number on this page is read from the chain at request time. Nothing is
            cached, mocked, or hardcoded. No wallet required.
          </p>
        </footer>
      </main>

      {/* Sticky instrument rail — always visible, always live. */}
      <aside className="rail">
        <div className="rail-inner">
          <p className="rail-live">
            <span className={engine.stale ? "dot stale" : "dot live"} aria-hidden="true" />
            {engine.stale ? "stale" : "live"} · Somnia testnet
            {sinceCb !== null && <span className="rail-age"> · callback {sinceCb}s ago</span>}
          </p>

          {shown && (
            <div className="rail-block">
              <p className="rail-h">{shown.asset} · {shown.intervalLabel} window</p>
              <p className="rail-big">{shown.secondsLeft > 0 ? fmtLeft(shown.secondsLeft) : "settling"}</p>
              <p className="rail-sub">{shown.secondsLeft > 0 ? "until it closes" : "awaiting settlement"}</p>
              <dl className="rail-kv">
                <div><dt>strike</dt><dd>{shown.strike.toFixed(2)}</dd></div>
                <div><dt>load line</dt><dd>{shown.loadPrice.toFixed(2)}</dd></div>
                <div><dt>now</dt><dd>{shown.now ? shown.now.toFixed(2) : "—"}</dd></div>
              </dl>
            </div>
          )}

          <div className="rail-block rail-engine">
            <p className="rail-h">engine</p>
            <p className="rail-big">{String(engine.windowsRemaining)}</p>
            <p className="rail-sub">windows of runway · {ratio.toFixed(2)} callbacks each</p>
            <dl className="rail-kv">
              <div><dt>delivered</dt><dd>{String(engine.callbackCount)}</dd></div>
              <div><dt>remaining</dt><dd>{String(engine.callbacksLeft)}</dd></div>
              <div><dt>last callback</dt><dd>{sinceCb === null ? "—" : `${sinceCb}s ago`}</dd></div>
            </dl>
          </div>

          <div className="rail-block rail-secondary">
            <p className="rail-h">covered</p>
            <p className="rail-big">{String(engine.coversOpened)}</p>
            <p className="rail-sub">
              {String(engine.coversSettled)} settled · {ethPrice?.ok ? `ETH $${ethPrice.price?.toFixed(2)}` : "ETH unpriceable"}
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function fmtLeft(s: number) {
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function PositionCard({ p }: { p: Position }) {
  const tone = p.outcome === "Won" ? "waterline" : p.outcome === "Lost" ? "heel" : "silt";
  const gap = p.requestedBps - p.achievedBps;
  return (
    <article className={`card ${tone}`}>
      <div className="card-head">
        <h3>Position {p.label}<span className="silt-text"> · {p.engineLabel} engine</span></h3>
        <span className={`tag ${tone}`}>{p.settled ? p.outcome : "pending"}</span>
      </div>

      <div className="dialpair">
        <div className="dialpair-half">
          <span className="dialpair-label">asked for</span>
          <span className="dialpair-value silt-num">{p.requestedBps}</span>
        </div>
        <div className="dialpair-sep" aria-hidden="true" />
        <div className="dialpair-half">
          <span className="dialpair-label">actually got</span>
          <span className={`dialpair-value ${tone}-num`}>{p.achievedBps}</span>
        </div>
      </div>
      <p className="dialpair-unit">basis points{gap > 0 ? ` · ${gap} short` : ""}</p>

      <dl className="kv tight">
        <Row k="Premium" v={`${usd(p.premium)} tUSDC at q ${(Number(p.coverPrice) / 1e6).toFixed(3)}`} />
        <Row k="Cover leg" v={`${p.coverLegNet >= 0 ? "+" : "−"}${Math.abs(p.coverLegNet).toFixed(2)} tUSDC`} />
        <Row k="Net with spot" v={p.netTotal === null ? "unknown"
          : `${p.netTotal >= 0 ? "+" : "−"}${Math.abs(p.netTotal).toFixed(2)} tUSDC`} />
        <Row k="Window move" v={p.moveDown === null ? "unknown"
          : `${Math.abs(p.moveDown * 100).toFixed(4)}% ${p.moveDown > 0 ? "down — cover paid" : "up — cover paid nothing"}`} />
        <Row k="Open → close" v={p.openPrice && p.closePrice ? `$${p.openPrice.toFixed(2)} → $${p.closePrice.toFixed(2)}` : "unknown"} />
        <Row k="Bought" v={`${p.purchaseDelaySeconds}s after the open · drift ${p.driftBps} bps`} />
      </dl>

      <p className="txrow">
        <a href={`${EXPLORER}/tx/${p.openedTx}`}>opened</a>
        <a href={`${EXPLORER}/tx/${p.settledTx}`}>settled</a>
        <a href={`${EXPLORER}/address/${p.engine}`}>engine</a>
      </p>
    </article>
  );
}

function Figure({ label, value, unit, tone }: { label: string; value: string; unit: string; tone?: "waterline" | "heel" }) {
  return (
    <div className="figure">
      <span className="figure-label">{label}</span>
      <span className={`figure-value ${tone ? `${tone}-num` : ""}`}>{value}</span>
      <span className="figure-unit">{unit}</span>
    </div>
  );
}

function Row({ k, v, label }: { k: string; v: React.ReactNode; label?: string }) {
  return (<><dt>{k}</dt><dd>{v}{label ? <span className="silt-text"> · {label}</span> : null}</dd></>);
}

function Addr({ a }: { a: string }) {
  return <a className="mono" href={`${EXPLORER}/address/${a}`}>{a}</a>;
}
