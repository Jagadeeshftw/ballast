import { cn } from "@/lib/cn";
import React, { useId } from "react";

/**
 * Aceternity's `stats-with-grid-background`, restyled to the palette.
 *
 * Three things changed on the way in.
 *
 * The catalogue's `Grid` defaults its square pattern to five `Math.random()` pairs. Rendered
 * on the server and again on the client, those are different numbers -- a guaranteed
 * hydration mismatch on every card. The pattern is derived from the cell's own label here, so
 * it is stable across renders and still varies between cells.
 *
 * The stock palette is `neutral-*` / `zinc-*` with a `from-[#5D5D5D] to-black` icon well,
 * which reads as grey plastic on a warm ground. Everything resolves from our tokens.
 *
 * And it is a pure SVG pattern with no motion, so there is no hidden-initial state to fix and
 * nothing to declare in the theme -- it renders identically with scripting off.
 */

/** Stable per-label pattern: same input, same squares, server and client alike. */
function patternFor(seed: string): number[][] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return Array.from({ length: 5 }, (_, i) => {
    const a = (h >> (i * 3)) % 4;
    const b = (h >> (i * 5)) % 6;
    return [a + 7, b + 1];
  });
}

function GridPattern({
  width, height, x, y, squares, ...props
}: {
  width: number; height: number; x: number | string; y: number | string; squares: number[][];
} & React.SVGProps<SVGSVGElement>) {
  const patternId = useId();
  return (
    <svg aria-hidden="true" {...props}>
      <defs>
        <pattern id={patternId} width={width} height={height} patternUnits="userSpaceOnUse" x={x} y={y}>
          <path d={`M.5 ${height}V.5H${width}`} fill="none" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${patternId})`} />
      <svg x={x} y={y} className="overflow-visible">
        {squares.map(([sx, sy]) => (
          <rect strokeWidth="0" key={`${sx}-${sy}`} width={width + 1} height={height + 1}
            x={sx * width} y={sy * height} />
        ))}
      </svg>
    </svg>
  );
}

function Grid({ seed, size = 20 }: { seed: string; size?: number }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-0 -ml-20 -mt-2 h-full w-full [mask-image:linear-gradient(white,transparent)]">
      <div className="absolute inset-0 [mask-image:radial-gradient(farthest-side_at_top,white,transparent)]">
        <GridPattern width={size} height={size} x="-12" y="4" squares={patternFor(seed)}
          className="absolute inset-0 h-full w-full fill-ink/[0.045] stroke-ink/[0.06]" />
      </div>
    </div>
  );
}

/** The folded corner that slides away on hover. Catalogue detail, palette colours. */
function EdgeElement() {
  return (
    <div className="absolute right-0 top-0 h-10 w-10 overflow-hidden border-b border-l border-rule bg-ground transition duration-200 group-hover/cell:-translate-y-14 group-hover/cell:translate-x-14 motion-reduce:transition-none">
      <div className="absolute left-0 top-0 h-px w-[141%] origin-top-left rotate-45 bg-rule" />
    </div>
  );
}

export type Stat = {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "paid" | "lost";
};

/**
 * A row of stats sharing one ruled frame — dividers between, not gaps, so the group reads as
 * one instrument rather than a scatter of boxes.
 */
export function StatGrid({ items, cols = 3, className }: { items: Stat[]; cols?: 2 | 3 | 4 | 5; className?: string }) {
  const colClass = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4", 5: "md:grid-cols-5" }[cols];
  return (
    <div className={cn("overflow-hidden rounded-xl border border-rule bg-raised", className)}>
      <div className={cn("grid grid-cols-1 sm:grid-cols-2", colClass)}>
        {items.map((s, i) => (
          <div key={s.label}
            className={cn(
              "group/cell relative overflow-hidden p-5 md:p-6",
              "border-b border-rule last:border-b-0 sm:[&:nth-last-child(-n+1)]:border-b-0",
              i !== items.length - 1 && "md:border-b-0 md:border-r",
            )}>
            <Grid seed={s.label} />
            <EdgeElement />
            <div className="relative">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                {s.icon && <span className="grid size-4 place-items-center">{s.icon}</span>}
                {s.label}
              </div>
              <div className={cn(
                "mt-3 font-mono text-[clamp(22px,2.2vw,30px)] font-medium leading-none tracking-tight tabular-nums",
                s.tone === "paid" ? "text-paid" : s.tone === "lost" ? "text-lost" : "text-ink",
              )}>
                {s.value}
              </div>
              {s.note && <div className="mt-2 text-[13px] leading-snug text-muted">{s.note}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
