import { EXPLORER, type Position } from "@/lib/chain";
import { positionsFor, totalsFor, type PositionRow } from "@/lib/portfolio";
import { recordRange } from "@/lib/record";
import PayoffA from "../a/PayoffA";

/**
 * Where the flow ends: a place you come back to.
 *
 * Server-rendered from the frozen record, so it is complete with no wallet, no JavaScript
 * and a stopped engine. Live data wins whenever the engine is running.
 *
 * Two decisions the data forced:
 *
 *  - Net is computed on SETTLED positions only. Forty-three of these windows expired without
 *    settle() being called; their premium is spent but their outcome is unknown, and folding
 *    them into one net figure would report unknowns as losses.
 *  - There is no cumulative P&L line. Two settled points is not a time series, and a chart
 *    with two points advertises how little data there is. The payoff scatter says the same
 *    thing honestly, and the cumulative line appears on its own once five positions settle.
 */

const usd = (v: number) => v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const utcShort = (ts: number | null) =>
  ts ? new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—";

export default function Portfolio({ user, settledPositions }: { user: string; settledPositions: Position[] }) {
  const rows = positionsFor(user);
  const t = totalsFor(rows);
  const range = recordRange();

  if (rows.length === 0) return <EmptyPortfolio />;

  return (
    <section className="pfWrap">
      <div className="pfHead">
        <h2 className="dH2">Position history</h2>
        <span className="pfSrc">
          The demonstration account{" "}
          <a className="mono" href={`${EXPLORER}/address/${user}`}>{user.slice(0, 10)}…</a>,
          recorded run{range ? `, ${range}` : ""}. Said plainly because a wallet you connect
          will have its own history here, and this one is not yours.
        </span>
      </div>

      {/* Running totals. Plain figures, no gauges. */}
      <div className="pfTotals">
        <Fig k="Positions" v={String(t.positions)} u={`${t.settled} settled · ${t.open} unsettled`} />
        <Fig k="Premium, settled" v={usd(t.settledPremium)} u="tUSDC" />
        <Fig k="Paid out" v={usd(t.paidOut)} u="tUSDC" tone="up" />
        <Fig k="Net, settled" v={usd(t.settledNet)} u="tUSDC" tone={t.settledNet >= 0 ? "up" : "down"} />
        <Fig k="Windows that paid" v={`${t.paid} of ${t.settled}`} u={t.hitRate === null ? "too few to rate" : `${Math.round(t.hitRate * 100)}% hit rate`} />
      </div>

      <p className="pfNote">
        <strong>{usd(t.committedPremium)} tUSDC</strong> of premium sits against{" "}
        {t.open} windows that expired without <code>settle()</code> being called. That premium
        is spent, but the outcomes are not known, so it is kept out of the net figure rather
        than counted as a loss. <code>settle()</code> is permissionless — anyone can close
        them, including you.
      </p>

      {/* Two settled points is not a time series. The payoff scatter is. */}
      {t.settled >= 5 ? null : (
        <div className="pfChart">
          <h3 className="pfSub">The settled positions, on the payoff</h3>
          <PayoffA positions={settledPositions} />
          <p className="pfNote">
            A cumulative line needs more than two points to mean anything, so this plots the
            two settled positions where they actually landed instead. The time series appears
            here on its own once five have settled.
          </p>
        </div>
      )}

      <p className="pfNote">
        Where <em>got</em> is below <em>asked</em>, something bound the size. The event does
        not say which, but it is recoverable: exposure falls out of quantity, price and the
        achieved point, so a premium comfortably under the ceiling means the <em>book</em> was
        the constraint, not the policy. On this account that is 39 of 40.
      </p>

      <div className="pfTableWrap">
        <table className="pfTable">
          <thead>
            <tr>
              <th>Window</th><th>Opened</th><th className="num">Premium</th>
              <th className="num">Asked / got</th><th>Outcome</th>
              <th className="num">Payout</th><th className="num">Net</th><th>Chain</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => <Row key={`${r.marketId}-${r.openedBlock}`} r={r} />)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({ r }: { r: PositionRow }) {
  const tone = r.outcome === "Won" ? "up" : r.outcome === "Lost" ? "down" : "dim";
  return (
    <tr>
      <td><strong>{r.asset}</strong> <span className="pfDim">#{parseInt(r.marketId, 16)}</span></td>
      <td className="pfDim">{utcShort(r.openedAt)}</td>
      <td className="num">{usd(r.premium)}</td>
      <td className="num">
        {r.requestedBps} / <strong className={r.shortfall ? "down" : "up"}>{r.achievedBps}</strong>
        {r.shortfall && <span className="pfWhy" title="Derived from quantity, cover price and the achieved point">{r.shortfall}</span>}
      </td>
      <td><span className={`pfTag ${tone}`}>{r.outcome}</span></td>
      <td className="num">{r.proceeds === null ? "—" : usd(r.proceeds)}</td>
      <td className={`num ${r.net === null ? "" : r.net >= 0 ? "up" : "down"}`}>
        {r.net === null ? "—" : usd(r.net)}
      </td>
      <td className="pfLinks">
        <a href={`${EXPLORER}/tx/${r.openedTx}`}>opened</a>
        {r.settledTx ? <a href={`${EXPLORER}/tx/${r.settledTx}`}>settled</a> : <span className="pfDim">—</span>}
      </td>
    </tr>
  );
}

/** Never a blank panel: say what would be here and how to get there. */
export function EmptyPortfolio() {
  return (
    <section className="pfWrap">
      <h2 className="dH2">Position history</h2>
      <div className="pfEmpty">
        <p>
          Nothing here yet — this account has never held cover. Once it does, every window
          appears here: what you asked for, what the book actually gave you and why they
          differed, the outcome, and what it paid.
        </p>
        <ol>
          <li>Mint test dollars and test ETH, so there is exposure to measure.</li>
          <li>Deposit and set a load line.</li>
          <li>Enrol — from then on the chain buys cover every window without you.</li>
        </ol>
      </div>
    </section>
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
