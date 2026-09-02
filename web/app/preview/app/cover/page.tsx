import { ADDR, EXPLORER, KNOWN_POSITIONS, getPosition } from "@/lib/chain";
import { positionsFor, totalsFor, type PositionRow } from "@/lib/portfolio";
import { recordRange } from "@/lib/record";
import PayoffA from "../../a/PayoffA";
import { SettleButton, SettleRun } from "../cover-actions";

export const dynamic = "force-dynamic";

const usd = (v: number) => v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const utcShort = (ts: number | null) =>
  ts ? new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—";

const FILTERS = [
  { k: "all", label: "All" },
  { k: "open", label: "Unsettled" },
  { k: "won", label: "Won" },
  { k: "lost", label: "Lost" },
] as const;

/** Every position this account has held. */
export default async function Cover({
  searchParams,
}: { searchParams: Promise<{ show?: string }> }) {
  const { show = "all" } = await searchParams;
  const settledPositions = await Promise.all(KNOWN_POSITIONS.map((p) => getPosition(p)));

  const all = positionsFor(ADDR.demoUser);
  const t = totalsFor(all);
  const rows = all.filter((r) =>
    show === "open" ? r.outcome === "Open"
    : show === "won" ? r.outcome === "Won"
    : show === "lost" ? r.outcome === "Lost"
    : true);
  const unsettled = all.filter((r) => r.outcome === "Open").map((r) => r.marketId);
  const range = recordRange();

  return (
    <>
      <h1 className="viewH1">Cover</h1>
      <p className="why" style={{ marginTop: 8 }}>
        Every position the demonstration account{" "}
        <a className="mono" href={`${EXPLORER}/address/${ADDR.demoUser}`}>{ADDR.demoUser.slice(0, 10)}…</a>{" "}
        has held{range ? `, ${range}` : ""}. A wallet you connect will have its own history
        here; this one is not yours.
      </p>

      <section>
        <div className="panel">
          <div className="figGrid">
            <Fig k="Positions" v={String(t.positions)} u={`${t.settled} settled · ${t.open} unsettled`} />
            <Fig k="Premium, settled" v={usd(t.settledPremium)} u="tUSDC" />
            <Fig k="Paid out" v={usd(t.paidOut)} u="tUSDC" tone="up" />
            <Fig k="Net, settled" v={usd(t.settledNet)} u="tUSDC" tone={t.settledNet >= 0 ? "up" : "down"} />
            <Fig k="Windows that paid" v={`${t.paid} of ${t.settled}`}
              u={t.hitRate === null ? "too few to rate" : `${Math.round(t.hitRate * 100)}%`} />
          </div>
        </div>
      </section>

      {unsettled.length > 0 && (
        <section>
          <SettleRun user={ADDR.demoUser} marketIds={unsettled} />
        </section>
      )}

      {/* Two settled points is not a time series. The scatter is honest at two and at fifty. */}
      {t.settled < 5 && (
        <section>
          <h2 className="viewH2">The settled positions, on the payoff</h2>
          <div className="panel">
            <PayoffA positions={settledPositions} />
            <p className="why" style={{ marginTop: 16, marginBottom: 0 }}>
              A cumulative line needs more than two points to mean anything, so this plots the
              settled positions where they actually landed. The time series appears here on its
              own once five have settled.
            </p>
          </div>
        </section>
      )}

      <section>
        <div className="tableHead">
          <h2 className="viewH2" style={{ marginBottom: 0 }}>Positions</h2>
          <div className="filters" role="group" aria-label="Filter positions">
            {FILTERS.map((f) => (
              <a key={f.k} href={f.k === "all" ? "?" : `?show=${f.k}`}
                className={show === f.k ? "on" : undefined}
                aria-current={show === f.k ? "true" : undefined}>{f.label}</a>
            ))}
          </div>
        </div>

        <p className="why">
          Where <em>got</em> is below <em>asked</em>, something bound the size. The event does
          not record which, but it is recoverable: exposure falls out of quantity, price and
          the achieved point, so a premium comfortably under the ceiling means the{" "}
          <em>book</em> was the constraint, not the policy. On this account that is 39 of 40.
        </p>

        {rows.length === 0 ? (
          <div className="panel"><p className="why">No positions match that filter.</p></div>
        ) : (
          <div className="tableWrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Window</th><th>Opened</th><th className="num">Premium</th>
                  <th className="num">Asked / got</th><th>Outcome</th>
                  <th className="num">Payout</th><th className="num">Net</th><th>Chain</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => <Row key={`${r.marketId}-${r.openedBlock}`} r={r} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Row({ r }: { r: PositionRow }) {
  const tone = r.outcome === "Won" ? "up" : r.outcome === "Lost" ? "down" : "dim";
  return (
    <tr>
      <td><strong>{r.asset}</strong> <span className="dim">#{parseInt(r.marketId, 16)}</span></td>
      <td className="dim">{utcShort(r.openedAt)}</td>
      <td className="num">{usd(r.premium)}</td>
      <td className="num">
        {r.requestedBps} / <strong className={r.shortfall ? "down" : "up"}>{r.achievedBps}</strong>
        {r.shortfall && <span className="whyCell">{r.shortfall}</span>}
      </td>
      <td><span className={`tag ${tone}`}>{r.outcome}</span></td>
      <td className="num">{r.proceeds === null ? "—" : usd(r.proceeds)}</td>
      <td className={`num ${r.net === null ? "" : r.net >= 0 ? "up" : "down"}`}>
        {r.net === null ? "—" : usd(r.net)}
      </td>
      <td className="links">
        <a href={`${EXPLORER}/tx/${r.openedTx}`}>opened</a>
        {r.settledTx ? <a href={`${EXPLORER}/tx/${r.settledTx}`}>settled</a> : <span className="dim">—</span>}
      </td>
      <td>{r.outcome === "Open" && <SettleButton user={ADDR.demoUser} marketId={r.marketId} />}</td>
    </tr>
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
