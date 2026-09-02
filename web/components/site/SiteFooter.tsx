import { ADDR, EXPLORER } from "@/lib/chain";

/** Addresses are the footer's real content here, so they are set as content, not fine print. */
export default function SiteFooter() {
  const contracts: [string, string][] = [
    ["Vault", ADDR.vault],
    ["Engine", ADDR.engine],
    ["Exposure source", ADDR.source],
    ["Collateral · tUSDC", ADDR.tusdc],
  ];

  return (
    <footer className="mx-auto max-w-7xl px-6 py-16 md:px-10 md:py-20">
      <div className="grid gap-10 md:grid-cols-[1.1fr_1fr_0.8fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
              <circle cx="11" cy="11" r="9" fill="none" stroke="#F2EEE4" strokeWidth="1.6" />
              <line x1="0" y1="11" x2="22" y2="11" stroke="#E0A130" strokeWidth="2.2" />
            </svg>
            <span className="font-bold tracking-tight">Ballast</span>
          </div>
          <p className="mt-4 max-w-[42ch] text-[14px] leading-relaxed text-muted">
            Parametric cover on dreamDEX Event Contracts, bought by the chain itself in the same
            block a window opens. Every number on this page is read from the chain at request
            time — nothing cached, mocked or hardcoded, and no wallet required to read it.
          </p>
        </div>

        <dl className="font-mono text-[12px]">
          {contracts.map(([k, a]) => (
            <div key={k} className="border-b border-rule py-2.5 last:border-0">
              <dt className="text-[10px] uppercase tracking-[0.14em] text-muted">{k}</dt>
              <dd className="mt-1">
                <a href={`${EXPLORER}/address/${a}`}
                  className="break-all text-ink underline decoration-rulehi decoration-dotted underline-offset-4 hover:decoration-signal">
                  {a}
                </a>
              </dd>
            </div>
          ))}
        </dl>

        <nav className="text-[14px]">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Elsewhere</div>
          <ul className="mt-3 space-y-2">
            {[
              ["Dashboard", "/app"],
              ["Repository", "https://github.com/Jagadeeshftw/ballast"],
              ["Documents", "https://github.com/Jagadeeshftw/ballast/tree/main/docs"],
              ["Run record", "https://github.com/Jagadeeshftw/ballast/blob/main/docs/run-record.json"],
              ["Findings for Somnia", "https://github.com/Jagadeeshftw/ballast/blob/main/docs/somnia-feedback.md"],
            ].map(([label, href]) => (
              <li key={label}>
                <a href={href} className="text-muted transition hover:text-ink">{label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <p className="mt-12 border-t border-rule pt-6 font-mono text-[11px] text-muted">
        Somnia Shannon testnet · chain 50312 · MIT licensed
      </p>
    </footer>
  );
}
