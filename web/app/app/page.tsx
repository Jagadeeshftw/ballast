import { ADDR, EXPLORER } from "@/lib/chain";
import { loadPreview, utc } from "../data";
import { positionsFor, totalsFor } from "@/lib/portfolio";
import { notificationsFor } from "./notifications";
import Checklist from "./Checklist";
import RunState from "../RunState";

export const dynamic = "force-dynamic";

const usd = (v: number) => v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Overview: what is my situation, in one screen. */
export default async function Overview() {
  const { vault, engine, shown, eth, tape } = await loadPreview();
  const rows = positionsFor(ADDR.demoUser);
  const t = totalsFor(rows);
  const notes = notificationsFor(ADDR.demoUser).slice(0, 5);
  const nowSec = Math.floor(Date.now() / 1000);

  const policyActive = vault.policy[0] && Number(vault.policy[3]) * 1000 > Date.now();
  const exposure = eth?.ok && eth.price ? eth.price * 2 : null; // the demonstration account holds 2 WETH

  return (
    <>
      <h1 className="viewH1">Overview</h1>

      {/* The one place the graduation field appears. */}
      <section className="band statusBand">
        <div className="statusGrid">
          <div>
            <dt>Measured exposure</dt>
            <dd className="big">{exposure ? `${usd(exposure)}` : "—"}</dd>
            <dd className="sub">{exposure ? "tUSDC of ETH, read from the book" : "unpriceable — the book is one-sided"}</dd>
          </div>
          <div>
            <dt>Policy</dt>
            <dd className="mid">{policyActive
              ? `Make whole a fall of ${(Number(vault.policy[1]) / 100).toFixed(2)}%`
              : "No active policy"}</dd>
            <dd className="sub">{policyActive
              ? `paying at most ${(Number(vault.policy[2]) / 100).toFixed(2)}% per window · to ${utc(vault.policy[3]).slice(0, 10)}`
              : "the engine can do nothing on this account"}</dd>
          </div>
          <div>
            <dt>Open cover</dt>
            <dd className="big">{t.open}</dd>
            <dd className="sub">windows still to settle</dd>
          </div>
          <div>
            <dt>Next window</dt>
            <dd className="mid">{shown ? `${shown.asset} · ${shown.intervalLabel}` : "none queued"}</dd>
            <dd className="sub">{shown
              ? shown.secondsLeft > 0 ? `closes in ${shown.secondsLeft}s` : "settling"
              : "the engine reacts when dreamDEX rolls the next one"}</dd>
          </div>
          <div>
            <dt>Engine</dt>
            <dd className="mid">{engine.subscribed ? "Watching" : "Stopped"}</dd>
            <dd className="sub">{engine.subscribed
              ? "subscribed to every window"
              : "out of gas — see Engine"}</dd>
          </div>
        </div>
      </section>

      <section>
        <h2 className="viewH2">Your setup</h2>
        <Checklist />
      </section>

      {!engine.subscribed && (
        <RunState subscribed={engine.subscribed} lastCallbackAt={engine.lastCallbackAt}
          balance={engine.balance} nowSec={nowSec} />
      )}

      <section>
        <h2 className="viewH2">Totals</h2>
        <div className="panel">
          <div className="figGrid">
            <Fig k="Premium, settled" v={usd(t.settledPremium)} u="tUSDC" />
            <Fig k="Paid out" v={usd(t.paidOut)} u="tUSDC" tone="up" />
            <Fig k="Net, settled" v={usd(t.settledNet)} u="tUSDC" tone={t.settledNet >= 0 ? "up" : "down"} />
            <Fig k="Windows covered" v={String(t.positions)} u={`${t.settled} settled`} />
            <Fig k="Windows that paid" v={`${t.paid} of ${t.settled}`} u={t.hitRate === null ? "too few to rate" : `${Math.round(t.hitRate * 100)}%`} />
          </div>
          <p className="why" style={{ marginTop: 20, marginBottom: 0 }}>
            Net counts <strong>settled</strong> positions only. {usd(t.committedPremium)} tUSDC
            of premium sits against {t.open} windows that expired without <code>settle()</code>{" "}
            being called — spent, but with outcomes not yet known, so it is not reported as a
            loss. <a href="/app/cover">Settle them on Cover</a>.
          </p>
        </div>
      </section>

      <section>
        <h2 className="viewH2">Recent activity</h2>
        {notes.length === 0 ? (
          <div className="panel"><p className="why">Nothing yet. Cover opening, settling and being declined all appear here.</p></div>
        ) : (
          <ol className="feed">
            {notes.map((n, i) => (
              <li key={`${n.tx}-${i}`}>
                <span className={`feedDot ${n.kind}`} aria-hidden="true" />
                <div>
                  <strong>{n.title}</strong>
                  <span className="feedDetail">{n.detail}</span>
                </div>
                <span className="feedWhen">{n.when ? utc(n.when).slice(0, 16) + " UTC" : "—"}</span>
                {n.tx && <a className="feedTx" href={`${EXPLORER}/tx/${n.tx}`}>tx</a>}
              </li>
            ))}
          </ol>
        )}
        <p className="why"><a href="/app/activity">All activity →</a> · block {String(tape.head)}</p>
      </section>
    </>
  );
}

function Fig({ k, v, u, tone }: { k: string; v: string; u: string; tone?: string }) {
  return (
    <div className="fig">
      <span className="figK">{k.toUpperCase()}</span>
      <span className={`figV ${tone ?? ""}`}>{v}</span>
      <span className="figU">{u}</span>
    </div>
  );
}
