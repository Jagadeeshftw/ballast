"use client";

import { useEffect } from "react";
import { ADDR, EXPLORER } from "@/lib/chain";

/**
 * What the dashboard says when a read fails.
 *
 * Every figure on these views is read from Somnia at request time, so the realistic failure
 * is not a bug in the page — it is the RPC being unreachable or rate-limiting. Saying
 * "something went wrong" would leave a reader unable to tell that apart from Ballast being
 * broken, which is the distinction that actually matters here: the contracts are fine, the
 * money is fine, and the evidence is still on chain whatever this page manages to render.
 *
 * So this names the failure, carries the real message rather than hiding it, and gives two
 * ways past it — retry, and the explorer, which does not depend on us at all.
 */
export default function DashboardError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("dashboard read failed:", error); }, [error]);

  /* Production builds replace the real message with a fixed notice about the redaction. */
  const redacted = !error.message || /omitted in production|digest property is included/i.test(error.message);

  return (
    <div className="panel warn" role="alert">
      <h3>This view could not read the chain</h3>
      <p className="why">
        The dashboard reads every figure from Somnia when you load it, so this is almost
        always the RPC endpoint refusing or timing out rather than a fault in Ballast.{" "}
        <strong>Nothing is lost by it.</strong> The vault still holds what it held, open cover
        is still open, and every position and payout is on chain whether this page renders or
        not.
      </p>

      {/* Next redacts server-component error messages in production builds and substitutes a
          paragraph of boilerplate about the redaction. Printing that verbatim under the words
          "What failed" is a generic error wearing a specific label -- it is longer than "something
          went wrong" and says exactly as much. So it is detected and replaced with the one fact
          that IS available and IS actionable: the digest, which matches this failure to its line
          in the server log. */}
      <p className="why">
        <strong>What failed:</strong>{" "}
        {redacted ? (
          <>
            the message is withheld by the production build. The failure is recorded server-side
            against digest{" "}
            <span className="mono">{error.digest ?? "none issued"}</span>, which identifies this
            exact error in the deployment log.
          </>
        ) : (
          <>
            <span className="mono">{error.message}</span>
            {error.digest && <> · digest <span className="mono">{error.digest}</span></>}
          </>
        )}
      </p>

      <div className="errActions">
        <button type="button" className="btn" onClick={reset}>Try the read again</button>
        <a className="btn ghost" href={`${EXPLORER}/address/${ADDR.vault}`}
          target="_blank" rel="noreferrer">
          Read the vault on the explorer
        </a>
      </div>

      <p className="why" style={{ marginTop: 16, marginBottom: 0 }}>
        If it keeps failing, <a href="/app/activity">Activity</a> is served from the recorded
        run committed to the repository and does not need the RPC at all.
      </p>
    </div>
  );
}
