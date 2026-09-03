/** Site-level 404. Plain, and it points at the two things worth reaching. */
export default function NotFound() {
  return (
    <div className="site flex min-h-svh flex-col items-center justify-center gap-6 bg-ground px-6 text-center font-sans text-ink">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
        404 · no such page
      </p>
      <h1 className="max-w-[22ch] text-[clamp(26px,4vw,40px)] font-semibold leading-tight tracking-tight">
        That page does not exist.
      </h1>
      <p className="max-w-[52ch] text-[15px] leading-relaxed text-muted">
        Ballast is two things: an explanation of what the cover pays, and a dashboard that
        reads the live contracts without a wallet.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <a href="/" className="rounded-full bg-signal px-5 py-2.5 text-[14px] font-semibold text-ground">
          What it pays
        </a>
        <a href="/app" className="rounded-full px-5 py-2.5 text-[14px] font-semibold text-ink ring-1 ring-rule transition-colors hover:ring-rulehi">
          Open the dashboard
        </a>
      </div>
    </div>
  );
}
