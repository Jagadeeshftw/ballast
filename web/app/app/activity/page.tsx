import { EXPLORER, SKIP_MEANING, type TapeItem } from "@/lib/chain";
import { RECORD, recordRange } from "@/lib/record";
import { getTape } from "@/lib/chain";
import { RecordedBanner } from "../../RunState";
import { EmptyState } from "@/components/ace/empty-state";

export const dynamic = "force-dynamic";

/* Grouped, not one row per event type: a reader wants "what did it refuse" and "what did it
   buy", not the raw enum. `all` stays first because it is the honest default -- filtering to
   the good news by default would be a choice about what to show. */
const FILTERS: { k: string; label: string; kinds: TapeItem["kind"][] | null }[] = [
  { k: "all", label: "All", kinds: null },
  { k: "cover", label: "Cover", kinds: ["opened", "settled"] },
  { k: "declined", label: "Refusals", kinds: ["declined", "gaveUp"] },
  { k: "callbacks", label: "Callbacks", kinds: ["callback", "tick", "tickExpired"] },
  { k: "windows", label: "Windows", kinds: ["enqueued", "attempt"] },
];

const PAGE = 60;

/** The full run's event total, from the capture's own counts rather than the shipped slice. */
const RUN_TOTAL = Object.values(RECORD.counts).reduce((a, b) => a + b, 0);

function Row({ i }: { i: TapeItem }) {
  const why = i.kind === "declined" ? SKIP_MEANING[i.headline] : null;
  return (
    <li>
      <span className={`feedDot ${i.kind}`} aria-hidden="true" />
      <span>
        {i.headline}
        <span className="feedDetail">{why ?? i.detail}</span>
      </span>
      <span className="feedWhen">block {i.block.toLocaleString("en-GB")}</span>
      <a className="feedTx" href={`${EXPLORER}/tx/${i.tx}`} target="_blank" rel="noreferrer">
        tx&nbsp;↗
      </a>
    </li>
  );
}

export default async function Activity({
  searchParams,
}: { searchParams: Promise<{ show?: string; page?: string }> }) {
  const sp = await searchParams;
  const show = FILTERS.some((f) => f.k === sp.show) ? sp.show! : "all";
  const filter = FILTERS.find((f) => f.k === show)!;

  /* The live tail is the OPTIONAL half of this page — the record carries it whenever the tail
     is empty, which is already the normal case with the engine stopped. A failed read is just
     another empty tail, so it degrades into exactly the path that already exists. */
  const live = await getTape(14).catch(() => ({ items: [], head: 0n, spanBlocks: 0 }));
  /* The live tail is a rolling ~1,400-block window -- about two minutes on this chain. With
     the engine stopped it is empty, and an empty list would read as "nothing ever happened"
     rather than "nothing happened in the last two minutes". The record stands in, and says
     so. It is never merged with live data. */
  const recorded = live.items.length === 0;
  const source = recorded ? RECORD.items : live.items;

  const rows = filter.kinds ? source.filter((i) => filter.kinds!.includes(i.kind)) : source;
  const page = Math.max(1, Number(sp.page) || 1);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const clamped = Math.min(page, pages);
  const slice = rows.slice((clamped - 1) * PAGE, clamped * PAGE);
  const qs = (p: number) =>
    `?${show === "all" ? "" : `show=${show}&`}${p > 1 ? `page=${p}` : ""}`.replace(/[?&]$/, "") || "?";

  return (
    <>
      <h1 className="viewH1">Activity</h1>
      <p className="why" style={{ marginTop: 8 }}>
        Every decision the engine made, in the order the chain recorded it — the windows it
        saw, the cover it bought, and every window it refused with the reason it gave.
        Refusals are not failures and are not hidden here: they outnumber the covers by more
        than twenty to one, which is the engine declining to buy something it could not price
        honestly.
      </p>

      {recorded && (
        <RecordedBanner what={`${RUN_TOTAL.toLocaleString("en-GB")} events across ${RECORD.counts.WindowEnqueued?.toLocaleString("en-GB") ?? "?"} windows`} />
      )}

      <section>
        <div className="tableHead">
          <h2 className="viewH2" style={{ marginBottom: 0 }}>
            {rows.length.toLocaleString("en-GB")} {rows.length === 1 ? "event" : "events"}
          </h2>
          <div className="filters" role="group" aria-label="Filter activity">
            {FILTERS.map((f) => (
              <a key={f.k} href={f.k === "all" ? "?" : `?show=${f.k}`}
                className={show === f.k ? "on" : undefined}
                aria-current={show === f.k ? "true" : undefined}>{f.label}</a>
            ))}
          </div>
        </div>

        {recorded && (
          <p className="why">
            This page ships {RECORD.total.toLocaleString("en-GB")} of the run&rsquo;s{" "}
            {RUN_TOTAL.toLocaleString("en-GB")} events — enough to read the behaviour without
            shipping a megabyte of JSON to every visitor. The complete capture is in the
            repository at{" "}
            <a href="https://github.com/Jagadeeshftw/ballast/blob/main/docs/run-record.json">
              <code>docs/run-record.json</code>
            </a>, and every row below links to the transaction that proves it.
          </p>
        )}

        {slice.length === 0 ? (
          <EmptyState title="Nothing under this filter">
            The run recorded no {filter.label.toLowerCase()} events. That is a property of this
            filter, not of the run — <a href="?">show everything</a>.
          </EmptyState>
        ) : (
          <ul className="feed">
            {slice.map((i, n) => <Row key={`${i.tx}-${i.block}-${n}`} i={i} />)}
          </ul>
        )}

        {pages > 1 && (
          <nav className="pager" aria-label="Pages">
            {clamped > 1
              ? <a href={qs(clamped - 1)}>← Newer</a>
              : <span aria-disabled="true">← Newer</span>}
            <span className="pagerAt">Page {clamped} of {pages}</span>
            {clamped < pages
              ? <a href={qs(clamped + 1)}>Older →</a>
              : <span aria-disabled="true">Older →</span>}
          </nav>
        )}
      </section>
    </>
  );
}
