"use client";

/**
 * Last resort: the root layout itself failed, so no theme tokens, no fonts and no shell are
 * available. Everything here is inline and self-contained for that reason — a stylesheet
 * reference would be one more thing to fail.
 *
 * It should be unreachable in practice. It exists so that the one path we cannot otherwise
 * cover still says something true rather than showing the framework's default.
 */
export default function GlobalError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{
        margin: 0, minHeight: "100vh", display: "grid", placeItems: "center",
        background: "#16150F", color: "#F2EEE4", padding: "24px",
        fontFamily: "ui-sans-serif, system-ui, sans-serif", lineHeight: 1.55,
      }}>
        <main style={{ maxWidth: "56ch" }}>
          <p style={{ margin: "0 0 10px", fontSize: 12, letterSpacing: ".14em",
            textTransform: "uppercase", color: "#E0A130" }}>
            Ballast
          </p>
          <h1 style={{ margin: "0 0 12px", fontSize: 26, fontWeight: 700 }}>
            The page failed to start.
          </h1>
          <p style={{ margin: "0 0 18px", color: "#9A9384", fontSize: 15 }}>
            This is a fault in the site, not in the contracts. Nothing on chain is affected by
            it: the vault, every open position and every payout are unchanged and remain
            readable on the explorer without this page.
            {error.digest && <> The failure is logged against digest {error.digest}.</>}
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={reset} style={{
              background: "#E0A130", color: "#16150F", border: 0, borderRadius: 999,
              padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit",
            }}>Reload</button>
            <a href="https://shannon-explorer.somnia.network/address/0x9026b93dc240244A34B3568aF704a60f4703a115"
              style={{
                color: "#F2EEE4", textDecoration: "none", border: "1px solid #45402F",
                borderRadius: 999, padding: "10px 18px", fontSize: 14, fontWeight: 600,
              }}>Read the engine on the explorer</a>
          </div>
        </main>
      </body>
    </html>
  );
}
