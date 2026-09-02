import "../a/a.css";
import "./app.css";
import Dashboard from "./Dashboard";
import Wordmark from "../Wordmark";
import { loadPreview, utc } from "../data";
import { ADDR, EXPLORER } from "@/lib/chain";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const { vault, engine, tape, shown, eth, makeWholeBps } = await loadPreview();
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

        {/* Server-rendered, so the page is never an empty shell: with no wallet, with no
            JavaScript, or with a connection that fails, this is still a working page. */}
        <section className="dLiveState">
          <h2 className="dH2">Live protocol state</h2>
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
