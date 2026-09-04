/**
 * What a page says when a live read did not answer.
 *
 * Same voice as the engine-stopped copy: a state, not a fault. Everything on these pages that
 * comes from the committed record still renders — positions, totals, refusal counts, the
 * cumulative chart — so this covers only the handful of genuinely live figures.
 *
 * Server-rendered, because the point is that the HTML is complete without JavaScript.
 */
export default function ChainNote({ className = "" }: { className?: string }) {
  return (
    <p className={`chainNote ${className}`} role="status">
      <span className="chainNoteDot" aria-hidden="true" />
      <span>
        <strong>Live figures are unavailable right now.</strong> The Somnia testnet RPC did not
        answer this request, so the readings that need it are shown as &ldquo;—&rdquo;. Nothing
        is wrong with the contracts or with any position: everything below that comes from the
        recorded run is on chain and unaffected, and the live figures return when the endpoint
        does.
      </span>
    </p>
  );
}

/** A figure that needs the chain. Renders an em dash rather than a zero when it is unknown,
 *  because a zero is a number and we did not read one. */
export function Live({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  if (!ok) return <span title="Could not be read from the chain">—</span>;
  return <>{children}</>;
}
