import { cn } from "@/lib/cn";

/**
 * The one thing on the page that is allowed to be large.
 *
 * The Overview had five bordered stat cells, then a stack of full-width prose panels, all at
 * the same visual weight — a spec sheet where nothing leads. This is the answer to "what am I
 * covered for", set at display size, with everything else on the page deliberately quieter.
 *
 * The glow border is the catalogue's `glowing-effect` idea reduced to what it is actually
 * worth here: a static conic ring at low opacity. The stock component tracks the pointer with
 * a `requestAnimationFrame` loop to sweep the highlight, which on a page that exists to be
 * read is motion for its own sake — and it is invisible to anyone arriving without a mouse.
 */
export function LeadPanel({
  eyebrow, children, aside, className,
}: {
  eyebrow: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-rule bg-raised", className)}>
      {/* Static, low-opacity, and behind everything. No pointer tracking, no rAF loop. */}
      <div aria-hidden="true"
        className="pointer-events-none absolute -inset-px opacity-[0.55]"
        style={{
          background:
            "radial-gradient(60% 120% at 12% 0%, color-mix(in srgb, var(--color-signal) 22%, transparent), transparent 60%)",
        }} />
      {/* `1fr auto` pushed the secondary figures to the far right edge and left a void across
         the middle at wide widths. A ruled second column keeps them adjacent to the prose and
         reads as a deliberate division rather than as leftover space. */}
      <div className="relative grid gap-8 p-6 md:grid-cols-[minmax(0,1fr)_minmax(300px,36%)] md:gap-10 md:p-9">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">{eyebrow}</div>
          {children}
        </div>
        {aside && (
          <div className="self-center border-t border-rule pt-6 md:border-l md:border-t-0 md:pl-10 md:pt-0">
            {aside}
          </div>
        )}
      </div>
    </div>
  );
}

/** A thin state banner. Not a panel — it must not compete with the lead. */
export function StateBanner({
  tone = "warn", children, href, cta,
}: { tone?: "warn" | "bad"; children: React.ReactNode; href?: string; cta?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-2.5 text-[13px]",
        tone === "bad"
          ? "border-lost/40 bg-lost/[0.07] text-ink"
          : "border-signal/40 bg-signal/[0.07] text-ink",
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", tone === "bad" ? "bg-lost" : "bg-signal")}
        aria-hidden="true" />
      <span>{children}</span>
      {href && cta && (
        <a href={href} className="ml-auto whitespace-nowrap font-medium underline underline-offset-4">
          {cta}
        </a>
      )}
    </div>
  );
}
