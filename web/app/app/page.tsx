import { ADDR, EXPLORER } from "@/lib/chain";
import { loadPreview, utc } from "../data";
import { positionsFor, totalsFor } from "@/lib/portfolio";
import { notificationsFor } from "./notifications";
import Checklist from "./Checklist";
import { StatGrid } from "@/components/ace/stat-grid";
import ChainNote from "@/components/site/ChainNote";
import { StateBanner } from "@/components/ace/lead-panel";
import CoverInForce from "./CoverInForce";
import { IconChartLine, IconTargetArrow, IconShieldHalf, IconClockPlay, IconBolt } from "@tabler/icons-react";

export const dynamic = "force-dynamic";

const usd = (v: number) => v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Overview: what is my situation, in one screen. */
export default async function Overview() {
  const { vault, engine, shown, eth, tape, chainOk } = await loadPreview();
  const rows = positionsFor(ADDR.demoUser);
  const t = totalsFor(rows);
  const notes = notificationsFor(ADDR.demoUser).slice(0, 5);
  const nowSec = Math.floor(Date.now() / 1000);

  const policyActive = !!vault && vault.policy[0] && Number(vault.policy[3]) * 1000 > Date.now();
  const exposure = eth?.ok && eth.price ? eth.price * 2 : null; // the demonstration account holds 2 WETH
  /* What the cover pays where it is exact. Same derivation as the landing page's worked
     example -- at the make-whole point the position's loss and the cover's net payout are
     equal by construction -- but from the LIVE policy rather than a constant, so the two
     surfaces cannot drift apart. */
  const makeWhole = vault ? Number(vault.policy[1]) / 10_000 : 0;
  const madeWhole = exposure !== null && policyActive ? exposure * makeWhole : null;

  return (
    <>
      {!chainOk && <ChainNote />}
      <h1 className="viewH1">Overview</h1>

      {/* The one place the graduation field appears. */}
      {engine && !engine.subscribed && (
        <StateBanner href="/app/engine" cta="Why, and how to restart it">
          The engine is not running, so no new cover is being bought. Everything it did is
          settled and on chain, and the vault is withdrawable as normal.
        </StateBanner>
      )}

      <CoverInForce
        demoExposure={exposure}
        demoMakeWhole={makeWhole}
        demoPremiumCap={vault ? (Number(vault.policy[2]) / 100).toFixed(2) : "—"}
        demoExpiry={vault ? utc(vault.policy[3]).slice(0, 10) : "—"}
        demoOpen={t.open}
      />

      <section>
        <h2 className="viewH2">Your setup</h2>
        <Checklist />
      </section>

      <section>
        {/* The attribution is load-bearing. Sitting under "Your setup", an unqualified
            "Totals" reads as the connected wallet's own history -- 45 positions and +770 that
            belong to someone else. Cover already names the account and says so; this must too.
            Presenting a number as belonging to a reader it does not belong to is the one thing
            this build has been careful never to do. */}
        <h2 className="viewH2">The demonstration account&rsquo;s totals</h2>
        <p className="why" style={{ marginTop: -4 }}>
          Settled positions only, held by{" "}
          <a className="mono" href={`${EXPLORER}/address/${ADDR.demoUser}`}>{ADDR.demoUser.slice(0, 10)}…</a>{" "}
          — not by any wallet you connect. A wallet you connect will have its own history, and
          it starts empty.{" "}
          <a href="/docs/economics#sample">Why this is a sample, not a result</a>.
        </p>
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
            of premium sits against {t.open} {t.open === 1 ? "window" : "windows"} that expired
            without <code>settle()</code>{" "}
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

