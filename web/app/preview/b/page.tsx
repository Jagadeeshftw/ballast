import "./b.css";
import { EXPLORER } from "@/lib/chain";
import { loadPreview, STEPS, utc } from "../data";
import { WideGauge, NarrowGauge, fmtLeft } from "../Gauge";

export const dynamic = "force-dynamic";

/** The mark, engraved rather than lit: an ink circle with a bar through it. */
function Mark({ size = 30 }: { size?: number }) {
  const r = size / 2 - 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ flex: "none" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#0B0F12" strokeWidth="2" />
      <line x1={size / 2 - r - 3} y1={size / 2} x2={size / 2 + r + 3} y2={size / 2} stroke="#0B0F12" strokeWidth="2.6" />
    </svg>
  );
}

export default async function DirectionB() {
  const { engine, tape, shown, book, makeWholeBps, eth } = await loadPreview();
  const ethPx = eth?.ok && eth.price ? eth.price : null;
  const nowSec = Math.floor(Date.now() / 1000);

  return (
    <div id="dir-b">
      {/* ------------------------------------------------------------ hero */}
      <section className="bHero">
        <div className="wrap">
          <div className="brandbar">
            <div className="l"><Mark size={30} /><span>Ballast</span></div>
            <div className="r">Somnia Shannon testnet &middot; {utc(nowSec)}</div>
          </div>

          <div className="heroGrid">
            <div>
              <h1>Automatic downside cover, bought by <u>the chain itself</u>.</h1>
              <p className="sub">
                You hold ETH. It can fall while you sleep. Ballast buys cover in the same block
                each window opens — no keeper, no cron, nothing of ours running.
              </p>
              <a className="cta" href="#dash">Open the dashboard →</a>
            </div>
            <div className="bignum">
              <b>{String(engine.coversOpened)}</b>
              <i>Windows covered, on chain</i>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- how it works */}
      <section className="fieldSand">
        <div className="wrap">
          <div className="rulehead"><span className="no">§1</span><span className="ti">How it works</span></div>
          <h2>Three steps, then nothing to do.</h2>
          <p className="bLede">
            Ballast covers what it can <strong>measure</strong> you holding. Never a number you
            type in.
          </p>
          <div className="form">
            {STEPS.map((s) => (
              <div className="row" key={s.n}>
                <span className="n">{s.n}</span>
                <h3>{s.head}</h3>
                <p>{s.body}</p>
                <span className="foot">{s.foot}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- watch it happen */}
      <section className="fieldSea">
        <div className="wrap">
          <div className="rulehead"><span className="no">§2</span><span className="ti">Live · watch it happen</span></div>
          <h2>Every line is a transaction you can open.</h2>
          <p className="bLede">
            A window opens, Ballast&rsquo;s callback lands in the same block, then cover opens or
            is declined with a reason.
          </p>

          {shown ? (
            <>
              <div className="gaugeGrid">
                <div>
                  <WideGauge w={shown} />
                  <NarrowGauge w={shown} />
                </div>
                <div className="count">
                  <p className="asset">{shown.asset} &middot; {shown.intervalLabel}</p>
                  <p className="cl">{shown.secondsLeft > 0 ? "Closes in" : "Closed"}</p>
                  <p className={`big ${shown.secondsLeft > 0 ? "" : "word"}`}>
                    {shown.secondsLeft > 0 ? fmtLeft(shown.secondsLeft) : "settling"}
                  </p>
                  <p className="cs">
                    {shown.moveDown === null ? "move unknown"
                      : `${Math.abs(shown.moveDown * 100).toFixed(3)}% ${shown.moveDown > 0 ? "down" : "up"}`}
                  </p>
                </div>
              </div>

              <table className="reg">
                <thead>
                  <tr>
                    <th>Block</th><th></th><th>Event</th>
                    <th className="hideSm">Detail</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {tape.items.slice(0, 8).map((t, i) => (
                    <tr key={`${t.tx}-${i}`}>
                      <td className="blk">{String(t.block)}</td>
                      <td><span className={`mk ${t.tone}`} aria-hidden="true" /></td>
                      <td className="hd">{t.headline}</td>
                      <td className="dt hideSm">{t.detail}</td>
                      <td><a href={`${EXPLORER}/tx/${t.tx}`}>tx →</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="bLede">No window is queued right now — the next rolls within a minute.</p>
          )}
        </div>
      </section>

      {/* ------------------------------------------------- dashboard, step 03 */}
      <section className="dash" id="dash">
        <div className="wrap">
          <div className="rulehead"><span className="no">§3</span><span className="ti">Dashboard</span></div>
          <h2>Step 03 — get test ETH.</h2>

          <div className="stepbar">
            <span className="done">01 Connect ✓</span>
            <span className="done">02 Test dollars ✓</span>
            <span className="now">03 Test ETH</span>
            <span>04 Deposit</span>
            <span>05 Load line</span>
            <span>06 Enrol</span>
          </div>

          <div className="bCard">
            <h3>Mint test ETH</h3>
            <p className="why">
              Ballast covers measured exposure, so you need to actually hold something. On
              testnet WETH is openly mintable — one transaction, no approval, and it never
              touches the order book.
            </p>
            <table className="spec">
              <tbody>
                <tr><th>You will receive</th><td>1.00 WETH</td></tr>
                <tr><th>Ballast will measure</th>
                  <td>{ethPx ? `${ethPx.toFixed(2)} tUSDC of ETH exposure` : "unpriceable right now"}</td></tr>
                <tr><th>Cost</th><td>~0.008 STT (about a cent)</td></tr>
              </tbody>
            </table>
            <a className="btn" href="#">Mint 1 test ETH</a>{" "}
            <a className="btn ghost" href="#">Buy on dreamDEX instead</a>
            <p className="bNote">
              Buying on the spot pool is capped to one book level. Taking more than that empties
              the ask side, and Ballast then reads your exposure as zero.
            </p>
          </div>

          <div className="bCard stamp">
            <span className="tag">Exposure unpriceable</span>
            <h3>You hold the ETH. This window will be skipped.</h3>
            <table className="spec">
              <tbody>
                <tr><th>What is true</th><td>You hold 1.00 WETH. It has not moved.</td></tr>
                <tr><th>What Ballast sees</th><td>No two-sided book to price against, so exposure reads 0.</td></tr>
                <tr><th>What happens next</th><td>This window is skipped. The next will almost certainly price.</td></tr>
              </tbody>
            </table>
            <p className="bNote">
              Shown here deliberately: it is a state, not a failure, and never means a deposit
              went missing.
            </p>
          </div>

          <div className="bCard">
            <h3>Your load line</h3>
            <p className="why">
              Read-only preview against the live book — Down at{" "}
              {book.priceable ? book.coverPrice.toFixed(3) : "—"} with{" "}
              {book.priceable ? book.bookQty.toFixed(0) : "0"} contracts on offer.
            </p>
            <table className="spec">
              <tbody>
                <tr><th>Make whole at</th><td>{makeWholeBps} bps</td></tr>
                <tr><th>Premium ceiling</th><td>300 bps per window</td></tr>
                <tr><th>Revoke</th><td>one action, immediate, always reachable</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
