import { ADDR, EXPLORER } from "@/lib/chain";
import { RECORD, recordRange } from "@/lib/record";
import { IconHistory, IconAlertTriangle, IconTool, IconPlayerPlay } from "@tabler/icons-react";

/**
 * What the page says when the engine is not running.
 *
 * A product that explains its own dead state is more convincing than one that pretends. This
 * is not an error panel: nothing is broken, the subscription ran out of gas, and the reason
 * is a measured property of the venue rather than a fault in the engine. Everything it did is
 * permanent and still on chain, and anyone at all can restart it.
 */
export default function RunState({
  subscribed, lastCallbackAt, balance, nowSec,
}: {
  subscribed: boolean; lastCallbackAt: bigint; balance: bigint; nowSec: number;
}) {
  if (subscribed) return null;

  const since = lastCallbackAt > 0n ? nowSec - Number(lastCallbackAt) : null;
  /* Plural agreement, because "1 days ago" on the one panel that exists to sound candid
     undermines the whole thing. */
  const unit = (n: number, one: string) => `${n} ${n === 1 ? one : one + "s"} ago`;
  const ago = since === null ? "unknown"
    : since < 3600 ? unit(Math.round(since / 60), "minute")
    : since < 86_400 ? unit(Math.round(since / 3600), "hour")
    : unit(Math.round(since / 86_400), "day");

  const bal = Number(balance) / 1e18;
  const range = recordRange();

  return (
    <div className="runState">
      <p className="runTag">Not currently running</p>
      <h3>The engine is out of gas.</h3>
      <p className="runLede">
        Its last callback landed <strong>{ago}</strong>. Nothing is broken and nothing was
        lost: every window it covered is settled, every payout is on chain, and the vault is
        withdrawable as normal. What stopped is the subscription that wakes it.
      </p>

      {/* The catalogue's feature-with-inline-icons treatment: an icon per part so the four
          answers scan as four answers rather than as one block of prose. Its neutral-400
          icon colour and its copy are gone; the structure is what was worth taking. */}
      <dl className="runParts">
        <div>
          <dt><IconHistory size={16} stroke={1.7} aria-hidden="true" />What it did</dt>
          <dd>
            {(RECORD.counts.WindowEnqueued ?? 0).toLocaleString("en-GB")} windows seen ·{" "}
            {(RECORD.counts.CallbackRan ?? 0).toLocaleString("en-GB")} callbacks ·{" "}
            {(RECORD.counts.CoverOpened ?? 0).toLocaleString("en-GB")} covers opened ·{" "}
            {(RECORD.counts.CoverSettled ?? 0).toLocaleString("en-GB")} settled
            {range ? `, ${range}` : ""}
          </dd>
        </div>
        <div>
          <dt><IconAlertTriangle size={16} stroke={1.7} aria-hidden="true" />Why it stopped</dt>
          <dd>
            Somnia bills a reactive callback at its <strong>gas limit</strong>, not its usage.
            Ours was provisioned 10,000,000 and uses about 1,490,000 — so every wake cost
            0.070 STT rather than the 0.010 it burned. dreamDEX rolls about{" "}
            <strong>147 windows an hour</strong> across every series, and the engine is woken for
            all of them. That is 12.8 STT an hour on a testnet whose faucet pays 0.5 a day.
          </dd>
        </div>
        <div>
          <dt><IconTool size={16} stroke={1.7} aria-hidden="true" />What fixes it</dt>
          <dd>
            A gas limit of 4,000,000 — twice the worst path we measured — cuts the cost 2.5×.
            It is a subscription parameter, so it needs no new contract. Reopening requires the
            engine to hold 32 STT, a floor checked once at creation and never spent.
          </dd>
        </div>
        <div>
          <dt><IconPlayerPlay size={16} stroke={1.7} aria-hidden="true" />Restarting it</dt>
          <dd>
            <code>topUp()</code> on the engine is <strong>payable and permissionless</strong> —
            anyone can fund it, including you, and no permission of ours is involved. It holds{" "}
            {bal.toFixed(2)} STT now.
          </dd>
        </div>
      </dl>

      <p className="runFoot">
        <a href={`${EXPLORER}/address/${ADDR.engine}`}>Engine on the explorer</a>
        <a href="https://github.com/Jagadeeshftw/ballast/blob/main/docs/somnia-feedback.md">The measurements, written up</a>
      </p>
    </div>
  );
}

/** Labels a section that is showing the frozen record rather than the live tail. */
export function RecordedBanner({ what }: { what: string }) {
  const range = recordRange();
  return (
    <p className="recBanner">
      <span className="recDot" aria-hidden="true" />
      Recorded run{range ? `, ${range}` : ""} — {what}. Not live: the engine is stopped, and
      this is the history it wrote to the chain while it ran.
    </p>
  );
}
