import { cn } from "@/lib/cn";
import React from "react";

/**
 * A row of figures sharing one ruled frame.
 *
 * This replaces the catalogue's `stats-with-grid-background`. That treatment put an SVG grid
 * wash and a folded-corner ornament behind every cell, and behind a column of currency figures
 * it read as noise rather than as a surface -- the numbers are the content, and the background
 * was competing with them. What survives from it is the part that was actually working: one
 * frame with dividers instead of a scatter of separate boxes.
 *
 * Two other catalogue treatments were considered and rejected. `stats-with-number-ticker`
 * declares `initial={{ y: 20, opacity: 0, filter: "blur(4px)" }}`, which framer-motion
 * server-renders AS the initial state, so every figure ships invisible to a reader without
 * JavaScript; and its count-up animation would imply these numbers are still moving when they
 * are a closed, settled record. `card-hover-effect` animates a shared background between cards
 * through `layoutId` and client state, which is a lot of machinery for what one CSS hover rule
 * does on a server-rendered row.
 *
 * Tone is carried by a rule on the top edge rather than by colouring the figure alone, so it
 * survives being read at a glance and does not depend on hue discrimination.
 */

export type Stat = {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "paid" | "lost";
};

export function StatGrid({
  items, cols = 3, className,
}: { items: Stat[]; cols?: 2 | 3 | 4 | 5; className?: string }) {
  const colClass = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4", 5: "md:grid-cols-5" }[cols];
  return (
    <div className={cn("overflow-hidden rounded-xl border border-rule bg-raised", className)}>
      <div className={cn("grid grid-cols-1 divide-y divide-rule sm:grid-cols-2 sm:divide-y-0", colClass,
        "sm:[&>*]:border-r sm:[&>*]:border-rule sm:[&>*:last-child]:border-r-0")}>
        {items.map((s) => (
          <div key={s.label}
            className="group/cell relative px-5 py-5 transition-colors hover:bg-ink/[0.02] md:px-6 md:py-6">
            {/* Semantic edge. Sits above the cell so it reads before the figure does. */}
            <span aria-hidden="true"
              className={cn(
                "absolute inset-x-0 top-0 h-0.5",
                s.tone === "paid" ? "bg-paid/70" : s.tone === "lost" ? "bg-lost/70" : "bg-transparent",
              )} />
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-muted">
              {s.icon && <span className="grid size-3.5 place-items-center">{s.icon}</span>}
              <span className="truncate">{s.label}</span>
            </div>
            <div className={cn(
              "mt-3.5 font-mono text-[clamp(24px,2.3vw,32px)] font-medium leading-none tracking-[-0.02em] tabular-nums",
              s.tone === "paid" ? "text-paid" : s.tone === "lost" ? "text-lost" : "text-ink",
            )}>
              {s.value}
            </div>
            {s.note && (
              <div className="mt-2.5 text-[13px] leading-snug text-muted">{s.note}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
