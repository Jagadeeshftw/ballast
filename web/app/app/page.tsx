import { ADDR, EXPLORER } from "@/lib/chain";
import { loadPreview, utc } from "../data";
import { positionsFor, totalsFor } from "@/lib/portfolio";
import { notificationsFor } from "./notifications";
import Checklist from "./Checklist";
import RunState from "../RunState";
import { StatGrid } from "@/components/ace/stat-grid";
import { IconChartLine, IconTargetArrow, IconShieldHalf, IconClockPlay, IconBolt } from "@tabler/icons-react";

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
      <StatGrid
        cols={5}
        items={[
          {
            label: "Measured exposure",
            icon: <IconChartLine size={14} stroke={1.8} />,
            value: exposure ? usd(exposure) : "—",
            note: exposure
              ? "tUSDC of ETH, read from the book"
              : "unpriceable — the book is one-sided",
          },
          {
            label: "Policy",
            icon: <IconTargetArrow size={14} stroke={1.8} />,
            value: policyActive ? `${(Number(vault.policy[1]) / 100).toFixed(2)}%` : "None",
            note: policyActive
              ? `made whole, paying at most ${(Number(vault.policy[2]) / 100).toFixed(2)}% per window · to ${utc(vault.policy[3]).slice(0, 10)}`
              : "the engine can do nothing on this account",
          },
          {
            label: "Open cover",
            icon: <IconShieldHalf size={14} stroke={1.8} />,
            value: t.open,
            note: "windows still to settle",
          },
          {
            label: "Next window",
            icon: <IconClockPlay size={14} stroke={1.8} />,
            value: shown ? `${shown.asset} · ${shown.intervalLabel}` : "None",
            note: shown
              ? shown.secondsLeft > 0 ? `closes in ${shown.secondsLeft}s` : "settling"
              : "the engine reacts when dreamDEX rolls the next one",
          },
          {
            label: "Engine",
            icon: <IconBolt size={14} stroke={1.8} />,
            value: engine.subscribed ? "Watching" : "Stopped",
            note: engine.subscribed ? "subscribed to every window" : "out of gas — see Engine",
            tone: engine.subscribed ? undefined : "lost",
          },
        ]}
      />

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
        <StatGrid
          cols={5}
          items={[
            { label: "Premium, settled", value: usd(t.settledPremium), note: "tUSDC" },
            { label: "Paid out", value: usd(t.paidOut), note: "tUSDC", tone: "paid" },
            { label: "Net, settled", value: usd(t.settledNet), note: "tUSDC",
              tone: t.settledNet >= 0 ? "paid" : "lost" },
            { label: "Windows covered", value: String(t.positions), note: `${t.settled} settled` },
            { label: "Windows that paid", value: `${t.paid} of ${t.settled}`,
              note: t.hitRate === null ? "too few to rate" : `${Math.round(t.hitRate * 100)}%` },
          ]}
        />
        <div className="panel" style={{ marginTop: 12 }}>
          <p className="why" style={{ marginBottom: 0 }}>
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

