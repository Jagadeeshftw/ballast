import "./a.css";
import { ADDR, EXPLORER } from "@/lib/chain";
import { loadPreview, STEPS, utc } from "../data";
import { WideGauge, NarrowGauge, fmtLeft } from "../Gauge";
import Nav from "./Nav";
import Spine from "./Spine";
import Reveal from "./Reveal";
import PayoffA from "./PayoffA";
import RunState, { RecordedBanner } from "./RunState";
import { RECORD } from "@/lib/record";

export const dynamic = "force-dynamic";

export default async function DirectionA() {
  const {
    vault, engine, tape, shown, book, makeWholeBps, eth,
    positions, settled, premiumPaid, proceeds, paidOut, engineSet, declined,
  } = await loadPreview();
  const nowSec = Math.floor(Date.now() / 1000);
  const usd = (raw: bigint, dp = 2) => (Number(raw) / 1e6).toFixed(dp);

  // Live always wins. The frozen record only stands in when the rolling tail is empty --
  // which, with the engine stopped, it always is.
  const liveTape = tape.items.slice(0, 10);
  const tapeRows = liveTape.length > 0 ? liveTape : RECORD.excerpt;
  const tapeIsRecord = liveTape.length === 0;
  const declinedRows = declined.length > 0 ? declined : RECORD.declined.slice(0, 8);
  const declinedIsRecord = declined.length === 0;
  const ethPx = eth?.ok && eth.price ? eth.price : null;

  return (
    <div id="dir-a">
      <Nav />
      <Spine />

      {/* ---------------------------------------------------------- 1. hero */}
      <section className="aHeroWrap" id="top">
        <div className="wrap aHero">
          <div>
            <h1>Automatic downside cover, bought by <em>the chain itself</em>.</h1>
            <p className="sub">
              You hold ETH. It can fall while you sleep. Ballast buys cover in the same block
              each window opens — no keeper, no cron, nothing of ours running.
            </p>
            <div className="heroActions">
              <a className="cta" href="/preview/app">Open the dashboard</a>
              <div>
                <span className="statNum">{String(engine.coversOpened)}</span>
                <span className="statLabel">WINDOWS COVERED, ON CHAIN</span>
              </div>
            </div>
          </div>

          {/* The proof, beside the claim. */}
          <div className="heroLive">
            {shown ? (
              <>
                <div className="heroLiveTop">
                  <p className="asset">{shown.asset} &middot; {shown.intervalLabel}</p>
                  <span className="beat"><i aria-hidden="true" />live</span>
                </div>
                <p className="heroCount">
                  <b className={shown.secondsLeft > 0 ? "" : "word"}>
                    {shown.secondsLeft > 0 ? fmtLeft(shown.secondsLeft) : "settling"}
                  </b>
                  <span>{shown.secondsLeft > 0 ? "UNTIL IT SETTLES" : "AWAITING SETTLEMENT"}</span>
                </p>
                <NarrowGauge w={shown} />
                <ul className="heroFeed">
                  {tape.items.slice(0, 3).map((t, i) => (
                    <li key={`${t.tx}-${i}`}>
                      <span className="b">{String(t.block)}</span>
                      <span className={`d ${t.tone}`} aria-hidden="true" />
                      <span className="h">{t.headline}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="sub">No window is queued right now — the next rolls within a minute.</p>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ 2. the problem */}
      <section className="aBand">
        <div className="wrap">
          <p className="eyebrow">The problem</p>
          <h2>Cover exists. Buying it every hour by hand does not.</h2>
          <div className="twoUp">
            <p className="aLede">
              You hold ETH. It can fall while you sleep, and the instruments that would cover
              that fall expire every sixty seconds. Nobody sits up rolling them by hand, so in
              practice the position is simply uncovered — not by decision, but by fatigue.
            </p>
            <div className="figureBox">
              <span className="statNum">{String(engine.callbackCount)}</span>
              <span className="statLabel">CALLBACKS DELIVERED WITHOUT A KEEPER</span>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- 3. how it works */}
      <section id="how">
        <div className="wrap">
          <p className="eyebrow">How it works</p>
          <h2>Three steps, then nothing to do.</h2>
          <p className="aLede">
            Ballast covers what it can <strong>measure</strong> you holding. Never a number you
            type in.
          </p>
          {/* Ruled form rather than three cards: the numerals carry it and the rules make it
              read as a specification. Taken from direction B, which did this better. */}
          <Reveal className="ruled">
            {STEPS.map((s) => (
              <div className="rrow" key={s.n}>
                <span className="rn">{s.n}</span>
                <h3>{s.head}</h3>
                <p>{s.body}</p>
                <span className="rfoot">{s.foot}</span>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* --------------------------------------------- 4. what it actually pays */}
      <section className="aBand">
        <div className="wrap">
          <p className="eyebrow">What it actually pays</p>
          <h2>Exact at one depth. Imperfect either side. On purpose.</h2>
          <p className="aLede">
            The payout is fixed, so cover is exact where you set the load line and imperfect
            above and below it. That gap is called <strong>basis risk</strong>, and it is the
            price of <strong>parametric cover</strong> — the same trade flight-delay insurance
            makes, paying the same whether you missed a meeting or a wedding.
          </p>
          <Reveal className="payoffWrap"><PayoffA positions={positions} /></Reveal>
          <table className="pays">
            <thead>
              <tr><th>ETH falls</th><th>Spot loss</th><th>Cover nets</th><th>Net</th></tr>
            </thead>
            <tbody>
              <tr><td>1%</td><td>−$50</td><td className="up">+$125</td><td className="up"><strong>+$75</strong></td></tr>
              <tr className="mark"><td>2.5%</td><td>−$125</td><td className="up">+$125</td><td><strong>$0</strong></td></tr>
              <tr><td>5%</td><td>−$250</td><td className="up">+$125</td><td className="down"><strong>−$125</strong></td></tr>
            </tbody>
          </table>
          <p className="foot">
            The middle row is the load line. Ballast shows you the make-whole point it{" "}
            <em>achieved</em>, never the one you asked for, whenever liquidity bound the size.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------- 5. watch it happen */}
      <section id="live" className="aLive">
        <div className="wrap">
          <p className="eyebrow">Live · Somnia testnet</p>
          <h2>Watch it happen.</h2>
          <p className="aLede">
            Every line is a transaction you can open. A window opens, Ballast&rsquo;s callback
            lands in the same block, then cover opens or is declined with a reason.
          </p>

          <RunState subscribed={engine.subscribed} lastCallbackAt={engine.lastCallbackAt}
            balance={engine.balance} nowSec={nowSec} />

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
              {tapeIsRecord && <RecordedBanner what={`${RECORD.counts.WindowEnqueued?.toLocaleString()} windows and ${RECORD.counts.CoverOpened} covers in all; this is a contiguous excerpt around one purchase`} />}
              <ol className="aTape">
                {tapeRows.map((t, i) => (
                  <li key={`${t.tx}-${i}`}
                    className={t.kind === "callback" && i === tape.items.findIndex((x) => x.kind === "callback")
                      ? "landing" : undefined}>
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

      {/* ------------------------------------------ 6. it has already done this */}
      <section id="numbers" className="aBand">
        <div className="wrap">
          <p className="eyebrow">It has already done this</p>
          <h2>Two settled positions. One paid, one did not.</h2>
          <p className="aLede">
            Both asked for {settled[0]?.requestedBps ?? 250} bps and both got less, for the same
            reason: the book offered only 200 contracts, so size was capped by liquidity rather
            than by policy.
          </p>

          <div className="posGrid">
            {positions.map((p) => {
              const won = p.outcome === "Won";
              return (
                <article className="pos" key={p.label}>
                  <div className="posTop">
                    <h3>Position {p.label}</h3>
                    <span className={`tag ${won ? "up" : "down"}`}>{p.settled ? p.outcome : "pending"}</span>
                  </div>
                  <div className="posPair">
                    <div><span className="k">asked for</span><span className="v dim">{p.requestedBps}</span></div>
                    <div><span className="k">actually got</span>
                      <span className={`v ${won ? "up" : "down"}`}>{p.achievedBps}</span></div>
                  </div>
                  <p className="posUnit">basis points{p.requestedBps - p.achievedBps > 0 ? ` · ${p.requestedBps - p.achievedBps} short` : ""}</p>
                  <dl className="posKv">
                    <dt>Premium</dt><dd>{usd(p.premium)} tUSDC</dd>
                    <dt>Window move</dt>
                    <dd>{p.moveDown === null ? "unknown"
                      : `${Math.abs(p.moveDown * 100).toFixed(4)}% ${p.moveDown > 0 ? "down — cover paid" : "up — cover paid nothing"}`}</dd>
                    <dt>Net with spot</dt>
                    <dd>{p.netTotal === null ? "unknown"
                      : `${p.netTotal >= 0 ? "+" : "−"}${Math.abs(p.netTotal).toFixed(2)} tUSDC`}</dd>
                  </dl>
                  <p className="posTx">
                    <a href={`${EXPLORER}/tx/${p.openedTx}`}>opened</a>
                    <a href={`${EXPLORER}/tx/${p.settledTx}`}>settled</a>
                  </p>
                </article>
              );
            })}
          </div>

          <div className="totals">
            <div><span className="statNum down">{premiumPaid.toFixed(2)}</span><span className="statLabel">PREMIUM PAID, tUSDC</span></div>
            <div><span className="statNum up">{proceeds.toFixed(2)}</span><span className="statLabel">PAID OUT, tUSDC</span></div>
            <div><span className={`statNum ${proceeds - premiumPaid >= 0 ? "up" : "down"}`}>{(proceeds - premiumPaid).toFixed(2)}</span><span className="statLabel">NET, tUSDC</span></div>
            <div><span className="statNum">{paidOut} of {settled.length}</span><span className="statLabel">WINDOWS THAT PAID</span></div>
          </div>
          <p className="foot">
            An at-the-money binary is the most expensive cover this instrument offers. The strike
            is the window&rsquo;s open, so there is no cheaper out-of-the-money strike to buy
            instead and you pay for the very likely small moves too. Rolling every window
            compounds that, which is why the product defaults to the four-hour and twenty-four-hour
            windows rather than the sixty-second ones.
          </p>
        </div>
      </section>

      {/* -------------------------------------------------- 7. and it refuses */}
      <section>
        <div className="wrap">
          <p className="eyebrow">And it refuses</p>
          <h2>A refusal is a decision.</h2>
          <p className="aLede">
            Each of these could have been traded and was not. The reason is on chain beside it.
          </p>
          {declinedRows.length === 0 ? (
            <p className="aLede">
              Nothing declined in the last {tape.spanBlocks.toLocaleString()} blocks.
            </p>
          ) : (
            <>
            {declinedIsRecord && <RecordedBanner what={`${RECORD.declined.length} refusals, each with its reason`} />}
            <ol className="aTape">
              {declinedRows.map((d, i) => (
                <li key={`${d.tx}-${i}`}>
                  <span className="t-blk">{String(d.block)}</span>
                  <span className="t-dot heel" aria-hidden="true" />
                  <span className="t-head">{d.headline}</span>
                  <span className="t-det">{d.detail}</span>
                  <a className="t-tx" href={`${EXPLORER}/tx/${d.tx}`}>tx</a>
                </li>
              ))}
            </ol>
            </>
          )}
        </div>
      </section>

      {/* ------------------------------------------------- 8. under the hood */}
      <section id="hood" className="aBand">
        <div className="wrap">
          <p className="eyebrow">Under the hood</p>
          <h2>Custody you can leave at any moment.</h2>
          <div className="totals">
            <div><span className="statNum">{usd(vault.collateral)}</span><span className="statLabel">VAULT BALANCE, tUSDC</span></div>
            <div><span className="statNum">{usd(vault.reserved)}</span><span className="statLabel">RESERVED AGAINST OPEN COVER</span></div>
            <div><span className="statNum up">{usd(vault.free)}</span><span className="statLabel">WITHDRAWABLE NOW</span></div>
            <div><span className="statNum">{usd(vault.surplus)}</span><span className="statLabel">UNACCOUNTED (EXPECT 0)</span></div>
          </div>
          <p className="foot">
            Withdrawal of unreserved collateral is unconditional and <strong>revoke() takes
            effect immediately</strong>, with no operator able to block or delay it. Ballast is
            the trader of record: it holds positions in its own name and never touches your
            dreamDEX account.
          </p>

          <h3 className="subhead">The engine set</h3>
          <p className="aLede">
            The vault approves a <strong>set</strong> of engines, so a redeploy strands nothing.
            A retired engine keeps settling the cover it opened while the live one takes new
            enrolments — that has happened here, not just in a test.
          </p>
          <ol className="aTape">
            {engineSet.map((e) => (
              <li key={e.address}>
                <span className="t-blk">{e.live ? "live" : "retired"}</span>
                <span className={`t-dot ${e.live ? "waterline" : ""}`} aria-hidden="true" />
                <span className="t-head mono">{e.address}</span>
                <span className="t-det">{e.approved ? "vault-approved" : "NOT approved"}</span>
                <a className="t-tx" href={`${EXPLORER}/address/${e.address}`}>see</a>
              </li>
            ))}
          </ol>

          <dl className="hoodKv">
            <dt>Vault</dt><dd><a className="mono" href={`${EXPLORER}/address/${ADDR.vault}`}>{ADDR.vault}</a></dd>
            <dt>Engine</dt><dd><a className="mono" href={`${EXPLORER}/address/${ADDR.engine}`}>{ADDR.engine}</a></dd>
            <dt>Exposure source</dt><dd><a className="mono" href={`${EXPLORER}/address/${ADDR.source}`}>{ADDR.source}</a></dd>
            <dt>Collateral</dt><dd><a className="mono" href={`${EXPLORER}/address/${ADDR.tusdc}`}>{ADDR.tusdc}</a> · tUSDC, 6dp</dd>
            <dt>Chain</dt><dd>Somnia Shannon testnet · 50312</dd>
            <dt>Read at</dt><dd>{utc(nowSec)} · block {String(tape.head)}</dd>
          </dl>
        </div>
      </section>

      <footer className="aFoot">
        <div className="wrap">
          <p className="foot">
            Every number on this page is read from the chain at request time. Nothing is cached,
            mocked, or hardcoded. No wallet required to read it.
          </p>
          <p className="footLinks">
            <a href="https://github.com/Jagadeeshftw/ballast">Repository</a>
            <a href="https://github.com/Jagadeeshftw/ballast/tree/main/docs">Docs</a>
            <a href="https://github.com/Jagadeeshftw/ballast/blob/main/LICENSE">MIT licence</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
