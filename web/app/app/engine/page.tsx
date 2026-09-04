import { ADDR, EXPLORER } from "@/lib/chain";
import { getEngineState } from "@/lib/chain";
import { RECORD, recordRange } from "@/lib/record";
import RunState from "../../RunState";
import { StatGrid } from "@/components/ace/stat-grid";
import ChainNote from "@/components/site/ChainNote";
import { Disclosure } from "@/components/ace/disclosure";
import { IconPlugConnected, IconCoin, IconReceipt2, IconRepeat, IconCalendarEvent } from "@tabler/icons-react";

export const dynamic = "force-dynamic";

const stt = (v: bigint) => (Number(v) / 1e18).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const usd = (v: bigint) => (Number(v) / 1e6).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n0 = (v: bigint | number) => Number(v).toLocaleString("en-GB");


function Kv({ k, v, note }: { k: string; v: React.ReactNode; note?: string }) {
  return (
    <div className="engRow">
      <dt>{k}</dt>
      <dd>
        {v}
        {note && <span className="engNote">{note}</span>}
      </dd>
    </div>
  );
}

/**
 * The engine's own state, and the arithmetic of why it is not running.
 *
 * The counters here are live reads of the engine contract, not the frozen record: they are
 * the engine's permanent totals and survive the subscription closing, so they need no
 * recorded-run label. Only the rolling event tail needs that, and it lives on Activity.
 */
export default async function Engine() {
  const e = await getEngineState().catch(() => null);

  /* Almost every figure on this page is a live counter, so there is no partial version worth
     rendering. It says what it could not read and shows the recorded run, which needs no
     network — rather than a page of em dashes pretending to be a reading. */
  if (!e) {
    return (
      <>
        <ChainNote />
        <h1 className="viewH1">Engine</h1>
        <p className="why" style={{ marginTop: 8 }}>
          The reactive contract that does the buying.{" "}
          <a className="mono" href={`${EXPLORER}/address/${ADDR.engine}`}>{ADDR.engine}</a> —
          subscribed to dreamDEX&rsquo;s window events, woken by Somnia&rsquo;s reactivity
          precompile inside the block that triggered it.
        </p>
        <div className="panel">
          <h3>Its live state could not be read</h3>
          <p className="why">
            This view is almost entirely live counters, and the RPC did not answer, so there is
            nothing here worth showing as a number. The contract is unaffected: its counters are
            on chain and readable on{" "}
            <a href={`${EXPLORER}/address/${ADDR.engine}`}>the explorer</a> whether this page can
            reach them or not.
          </p>
          <p className="why" style={{ marginBottom: 0 }}>
            What it did over the recorded run is committed to the repository and needs no
            network at all: {n0(RECORD.counts.WindowEnqueued ?? 0)} windows seen,{" "}
            {n0(RECORD.counts.CallbackRan ?? 0)} callbacks,{" "}
            {n0(RECORD.counts.CoverOpened ?? 0)} covers opened,{" "}
            {n0(RECORD.counts.CoverSettled ?? 0)} settled{recordRange() ? `, ${recordRange()}` : ""}.{" "}
            <a href="/app/activity">Read it on Activity</a>, or{" "}
            <a href="/docs/findings">why it is stopped</a>.
          </p>
        </div>
      </>
    );
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const range = recordRange();

  /* Achieved over requested, with the reason: the engine opened cover on a small fraction of
     the windows it saw, and the gap is the product working rather than a shortfall. */
  const seen = Number(e.windowsEnqueued);
  const opened = Number(e.coversOpened);

  return (
    <>
      <h1 className="viewH1">Engine</h1>
      <p className="why" style={{ marginTop: 8 }}>
        The reactive contract that does the buying.{" "}
        <a className="mono" href={`${EXPLORER}/address/${ADDR.engine}`}>{ADDR.engine}</a>{" "}
        — subscribed to dreamDEX&rsquo;s window events, woken by Somnia&rsquo;s reactivity
        precompile inside the block that triggered it. Nothing of ours polls, and there is no
        keeper to trust.
      </p>

      <StatGrid
        cols={5}
        items={[
          { label: "Subscription", icon: <IconPlugConnected size={14} stroke={1.8} />,
            value: e.subscribed ? "Open" : "Closed",
            note: e.subscribed ? `id ${n0(e.subId)}` : "no subscription is open",
            tone: e.subscribed ? "paid" : "lost" },
          { label: "Engine balance", icon: <IconCoin size={14} stroke={1.8} />,
            value: stt(e.balance), note: "STT" },
          { label: "Cost per callback", icon: <IconReceipt2 size={14} stroke={1.8} />,
            value: stt(e.costPerCallback), note: "STT, as this contract computes it" },
          { label: "Callbacks left", icon: <IconRepeat size={14} stroke={1.8} />,
            value: n0(e.callbacksLeft), note: "at the current balance and that figure" },
          { label: "Can schedule", icon: <IconCalendarEvent size={14} stroke={1.8} />,
            value: e.canSchedule ? "Yes" : "No",
            note: e.canSchedule ? "a wake can be booked now" : "no wake can be booked",
            tone: e.canSchedule ? "paid" : "lost" },
        ]}
      />

      {!e.subscribed && (
        <RunState subscribed={e.subscribed} lastCallbackAt={e.lastCallbackAt}
          balance={e.balance} nowSec={nowSec} />
      )}

      <section>
        <h2 className="viewH2">What this deployment did</h2>
        <p className="why">
          Live counters on the engine contract — permanent, and unaffected by the subscription
          closing. It opened cover on {n0(opened)} of the {n0(seen)} windows it saw. The gap is
          not a miss rate: most windows carry no exposure to cover, or no book to price it
          against, and refusing those is the behaviour, not a failure of it.{" "}
          <a href="/app/activity">Every refusal, with its reason</a>.
        </p>
        <StatGrid
          cols={4}
          items={[
            { label: "Windows seen", value: n0(e.windowsEnqueued), note: "reacted to in-block" },
            { label: "Wakes billed", value: n0(e.callbackCount), note: "every event the subscription matched" },
            { label: "Windows scanned", value: n0(RECORD.counts.CallbackRan ?? 0), note: "wakes that did cover work" },
            { label: "Covers opened", value: n0(e.coversOpened), note: "positions taken" },
            { label: "Covers settled", value: n0(e.coversSettled), note: "outcomes known" },
            { label: "Premium paid", value: usd(e.premiumPaidTotal), note: "tUSDC" },
            { label: "Proceeds paid", value: usd(e.proceedsPaidTotal), note: "tUSDC", tone: "paid" },
          ]}
        />
        {/* ═══════════════════════════════════════════════════════════════════
            LOAD-BEARING. Three numbers on this page disagree with three numbers in
            the panel above it, and a reader who spots that and gets no explanation
            stops believing the rest. Both sets are correct; they count different
            things. Do not delete this to save space -- delete a figure instead. */}
        <p className="why">
          Two of these need saying plainly, because they do not match the recorded run above
          and a reader who notices that deserves the reason rather than the benefit of the
          doubt. <strong>Wakes billed</strong> counts every event the subscription matched, and
          Somnia charged for all {n0(e.callbackCount)} of them at the gas limit; only{" "}
          {n0(RECORD.counts.CallbackRan ?? 0)} of those wakes had a window to scan. That gap is
          the cost problem, not an accounting one. And <strong>covers opened</strong> reads{" "}
          {n0(opened)} here against {n0(RECORD.counts.CoverOpened ?? 0)} in the record, because
          the record spans every engine Ballast has deployed: three of those covers were opened
          by two earlier engines before this one existed. This page counts only this contract.
        </p>
      </section>

      <section>
        <h2 className="viewH2">Parameters</h2>
        <p className="why">
          Every one of these is a subscription or constructor parameter, readable on chain.
          None of them requires a new contract to change.
        </p>
        <div className="panel" style={{ paddingTop: 4, paddingBottom: 4 }}>
          <Disclosure summary="Enrolment and queue" defaultOpen>
            <dl className="engKv">
              <Kv k="Enrolled accounts" v={n0(e.enrolledCount)}
                note="accounts the engine will act for" />
              <Kv k="Windows pending" v={n0(e.pendingCount)}
                note="seen, not yet resolved either way" />
            </dl>
          </Disclosure>
          <Disclosure summary="Retry ladder" defaultOpen>
            <dl className="engKv">
              <Kv k="Max attempts" v={n0(e.maxAttempts)}
                note="tries before a window is given up as unpriceable" />
              <Kv k="Initial delay" v={`${n0(e.initialDelay)}s`}
                note="wait before the first attempt, so the book can form" />
            </dl>
          </Disclosure>
          <Disclosure summary="Cost and runway">
            <dl className="engKv">
              <Kv k="Callbacks per window" v={(Number(e.ratioX100) / 100).toFixed(2)}
                note="measured, not configured — how many wakes each window costs" />
              <Kv k="Windows remaining" v={n0(e.windowsRemaining)}
                note="at the current balance and this contract's own cost estimate" />
              <Kv k="Health reading" v={e.stale ? "Stale" : "Fresh"}
                note={e.stale ? "the engine has not been woken recently" : "recently woken"} />
            </dl>
          </Disclosure>
        </div>
      </section>

      <section>
        <h2 className="viewH2">The recorded run</h2>
        <p className="why">
          The engine ran continuously{range ? ` over ${range}` : ""} before the subscription
          closed, writing {Object.values(RECORD.counts).reduce((a, b) => a + b, 0).toLocaleString("en-GB")}{" "}
          events to the chain across blocks {RECORD.fromBlock.toLocaleString("en-GB")}–
          {RECORD.toBlock.toLocaleString("en-GB")}. That history is on chain and independently
          checkable; the capture committed to the repository is a convenience, not the source
          of truth. <a href="/app/activity">Read it on Activity</a>, or{" "}
          <a href={`${EXPLORER}/address/${ADDR.engine}`}>verify it on the explorer</a>.
        </p>
      </section>
    </>
  );
}
