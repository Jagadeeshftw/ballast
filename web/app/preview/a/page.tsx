import "./a.css";
import { EXPLORER } from "@/lib/chain";
import { loadPreview, STEPS } from "../data";
import { WideGauge, NarrowGauge, fmtLeft } from "../Gauge";
import Wordmark from "../Wordmark";

export const dynamic = "force-dynamic";

export default async function DirectionA() {
  const { engine, tape, shown, book, makeWholeBps, eth } = await loadPreview();
  const ethPx = eth?.ok && eth.price ? eth.price : null;

  return (
    <div id="dir-a">
      {/* ---------------------------------------------------------- 1. hero */}
      <section className="aHero">
        <div className="wrap">
          <div className="brand"><Wordmark size={34} /><span>Ballast</span></div>
          <h1>Automatic downside cover, bought by <em>the chain itself</em>.</h1>
          <p className="sub">
            You hold ETH. It can fall while you sleep. Ballast buys cover in the same block
            each window opens — no keeper, no cron, nothing of ours running.
          </p>
          <div className="heroRow">
            <a className="cta" href="#dash">Open the dashboard</a>
            <div>
              <span className="statNum">{String(engine.coversOpened)}</span>
              <span className="statLabel">WINDOWS COVERED, ON CHAIN</span>
            </div>
            <div>
              <span className="statNum">0</span>
              <span className="statLabel">BLOCKS OF LATENCY</span>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- 2. how it works */}
      <section className="aBand">
        <div className="wrap">
          <p className="eyebrow">How it works</p>
          <h2>Three steps, then nothing to do.</h2>
          <p className="aLede">
            Ballast covers what it can <strong>measure</strong> you holding. Never a number you
            type in.
          </p>
          <div className="steps">
            {STEPS.map((s) => (
              <div className="step" key={s.n}>
                <span className="n">{s.n}</span>
                <h3>{s.head}</h3>
                <p>{s.body}</p>
                <span className="foot">{s.foot}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------- 3. watch it happen */}
      <section className="aLive">
        <div className="wrap">
          <p className="eyebrow">Live · Somnia testnet</p>
          <h2>Watch it happen.</h2>
          <p className="aLede">
            Every line below is a transaction you can open. A window opens, Ballast&rsquo;s
            callback lands in the same block, then cover opens or is declined with a reason.
          </p>

          {shown ? (
            <>
              <div className="gaugeRow">
                <div>
                  <WideGauge w={shown} />
                  <NarrowGauge w={shown} />
                </div>
                <div className="count">
                  <p className="asset">{shown.asset} &middot; {shown.intervalLabel}</p>
                  <p className="cl">{shown.secondsLeft > 0 ? "closes in" : "closed"}</p>
                  <p className={`big ${shown.secondsLeft > 0 ? "" : "word"}`}>
                    {shown.secondsLeft > 0 ? fmtLeft(shown.secondsLeft) : "settling"}
                  </p>
                  <p className="cs">
                    {shown.moveDown === null ? "move unknown"
                      : `${Math.abs(shown.moveDown * 100).toFixed(3)}% ${shown.moveDown > 0 ? "down" : "up"}`}
                  </p>
                </div>
              </div>
              <ol className="aTape">
                {tape.items.slice(0, 8).map((t, i) => (
                  <li key={`${t.tx}-${i}`} className={i === 0 ? "newest" : undefined}>
                    <span className="t-blk">{String(t.block)}</span>
                    <span className={`t-dot ${t.tone}`} aria-hidden="true" />
                    <span className="t-head">{t.headline}</span>
                    <span className="t-det">{t.detail}</span>
                    <a className="t-tx" href={`${EXPLORER}/tx/${t.tx}`}>tx</a>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="aLede">No window is queued right now — the next rolls within a minute.</p>
          )}
        </div>
      </section>

      {/* ------------------------------------------- 4. dashboard, step 03 */}
      <section className="dash" id="dash">
        <div className="wrap">
          <p className="eyebrow">Dashboard</p>
          <h2>Step 03 — get test ETH.</h2>

          <div className="aRail">
            <span className="pip done">✓ Connect</span>
            <span className="pip done">✓ Test dollars</span>
            <span className="pip now">03 Test ETH</span>
            <span className="pip">04 Deposit</span>
            <span className="pip">05 Load line</span>
            <span className="pip">06 Enrol</span>
          </div>

          <div className="panel">
            <h3>Mint test ETH</h3>
            <p className="why">
              Ballast covers measured exposure, so you need to actually hold something. On
              testnet WETH is openly mintable — one transaction, no approval, and it never
              touches the order book.
            </p>
            <dl className="aKv">
              <dt>You will receive</dt><dd>1.00 WETH</dd>
              <dt>Ballast will measure</dt>
              <dd>{ethPx ? `${ethPx.toFixed(2)} tUSDC of ETH exposure` : "unpriceable right now"}</dd>
              <dt>Cost</dt><dd>~0.008 STT (about a cent)</dd>
            </dl>
            <a className="btn" href="#">Mint 1 test ETH</a>{" "}
            <a className="btn ghost" href="#">Buy on dreamDEX instead</a>
            <p className="gas">
              Buying on the spot pool is capped to one book level. Taking more than that empties
              the ask side, and Ballast then reads your exposure as zero.
            </p>
          </div>

          <div className="panel">
            <div className="state">
              <h4>Exposure is unpriceable right now</h4>
              <dl>
                <dt>What is true</dt><dd>You hold 1.00 WETH. It has not moved.</dd>
                <dt>What Ballast sees</dt>
                <dd>No two-sided book to price against, so exposure reads 0.</dd>
                <dt>What happens next</dt>
                <dd>This window is skipped. The next one will almost certainly price.</dd>
              </dl>
            </div>
            <p className="gas">
              Shown here deliberately: it is a state, not a failure, and never means a deposit
              went missing.
            </p>
          </div>

          <div className="panel">
            <h3>Your load line</h3>
            <p className="why">
              Read-only preview against the live book — Down at{" "}
              {book.priceable ? book.coverPrice.toFixed(3) : "—"} with{" "}
              {book.priceable ? book.bookQty.toFixed(0) : "0"} contracts on offer.
            </p>
            <dl className="aKv">
              <dt>Make whole at</dt><dd>{makeWholeBps} bps</dd>
              <dt>Premium ceiling</dt><dd>300 bps per window</dd>
              <dt>Revoke</dt><dd>one action, immediate, always reachable</dd>
            </dl>
          </div>
        </div>
      </section>
    </div>
  );
}
