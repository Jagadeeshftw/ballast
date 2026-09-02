import "../a/a.css";
import "./app.css";
import Dashboard from "./Dashboard";
import Wordmark from "../Wordmark";
import { loadPreview, utc } from "../data";
import Portfolio from "./Portfolio";
import RunState from "../a/RunState";
import { positionsFor } from "@/lib/portfolio";
import { ADDR, EXPLORER, KNOWN_POSITIONS, getPosition } from "@/lib/chain";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const { vault, engine, tape, shown, eth, makeWholeBps } = await loadPreview();
  const settledPositions = await Promise.all(KNOWN_POSITIONS.map((p) => getPosition(p)));
  const rows = positionsFor(ADDR.demoUser);
  const openCover = rows.filter((r) => r.outcome === "Open").length;
  const policyActive = vault.policy[0] && Number(vault.policy[3]) * 1000 > Date.now();
  const ethExposure = eth?.ok && eth.price ? eth.price * 2 : null; // the demo account holds 2 WETH
  const nowSec = Math.floor(Date.now() / 1000);
  const usd = (v: bigint) => (Number(v) / 1e6).toFixed(2);

  return (
    <div id="dir-a" className="dPage">
      <nav className="aNav">
        <div className="aNavIn">
          <a className="aNavBrand" href="/preview/a"><Wordmark size={24} /><span>Ballast</span></a>
          <span className="dChip">Dashboard</span>
          <a className="aNavCta in" href="/preview/a">
            <span className="dWide">Back to the landing page</span>
            <span className="dNarrow">Landing page</span>
          </a>
        </div>
      </nav>

      <main className="wrap dMain">
        <header className="dTop">
          <p className="eyebrow">Dashboard</p>
          <h1 className="dH1">Put a load line on your own position.</h1>
          <p className="aLede">
            Six steps, then nothing to do. Everything here is readable without a wallet — the
            protocol state below is read from the chain at request time, whether or not you
            ever connect one.
          </p>
        </header>

        <Dashboard />

        {/* Where you land on returning: state first, then history. Server-rendered, so it is
            complete with no wallet, no JavaScript, or a connection that fails. */}
        <section className="dLiveState">
          <h2 className="dH2">Current state</h2>
          <dl className="dState2">
            <div>
              <dt>Measured exposure</dt>
              <dd>{ethExposure ? `${ethExposure.toFixed(2)} tUSDC of ETH` : "unpriceable — the book is one-sided"}</dd>
            </div>
            <div>
              <dt>Policy</dt>
              <dd>{policyActive
                ? `Active. Make whole a fall of ${(Number(vault.policy[1]) / 100).toFixed(2)}%, paying at most ${(Number(vault.policy[2]) / 100).toFixed(2)}% of the position per window, until ${utc(vault.policy[3])}.`
                : "No active policy — the engine can do nothing on this account."}</dd>
            </div>
            <div>
              <dt>Open cover</dt>
              <dd>{openCover} window{openCover === 1 ? "" : "s"} still to settle</dd>
            </div>
            <div>
              <dt>Next window</dt>
              <dd>{shown
                ? `${shown.asset} · ${shown.intervalLabel} · ${shown.secondsLeft > 0 ? `closes in ${shown.secondsLeft}s` : "settling"}`
                : "none queued"}</dd>
            </div>
            <div>
              <dt>Engine</dt>
              <dd>{engine.subscribed ? "Subscribed and watching every window." : "Stopped — out of gas. See below."}</dd>
            </div>
          </dl>
        </section>

        <RunState subscribed={engine.subscribed} lastCallbackAt={engine.lastCallbackAt}
          balance={engine.balance} nowSec={nowSec} />

        <Portfolio user={ADDR.demoUser} settledPositions={settledPositions} />

        <section className="dLiveState">
          <h2 className="dH2">Protocol</h2>
          <div className="dGrid">
            <Fig k="Vault balance" v={`${usd(vault.collateral)}`} u="tUSDC" />
            <Fig k="Reserved" v={`${usd(vault.reserved)}`} u="against open cover" />
            <Fig k="Withdrawable" v={`${usd(vault.free)}`} u="tUSDC" tone="up" />
            <Fig k="Windows covered" v={String(engine.coversOpened)} u="on chain" />
          </div>
          <dl className="hoodKv">
            <dt>Current window</dt>
            <dd>{shown ? `${shown.asset} · ${shown.intervalLabel} · closes in ${Math.max(0, shown.secondsLeft)}s` : "none queued"}</dd>
            <dt>Default load line</dt><dd>{makeWholeBps} bps</dd>
            <dt>ETH spot</dt>
            <dd>{eth?.ok && eth.price ? `$${eth.price.toFixed(2)}` : "unpriceable — book one-sided or too wide"}</dd>
            <dt>Vault</dt><dd><a className="mono" href={`${EXPLORER}/address/${ADDR.vault}`}>{ADDR.vault}</a></dd>
            <dt>Engine</dt><dd><a className="mono" href={`${EXPLORER}/address/${ADDR.engine}`}>{ADDR.engine}</a></dd>
            <dt>Read at</dt><dd>{utc(nowSec)} · block {String(tape.head)}</dd>
          </dl>
        </section>
      </main>
    </div>
  );
}

function Fig({ k, v, u, tone }: { k: string; v: string; u: string; tone?: string }) {
  return (
    <div>
      <span className="statLabel">{k.toUpperCase()}</span>
      <span className={`statNum ${tone ?? ""}`}>{v}</span>
      <span className="statLabel">{u}</span>
    </div>
  );
}
