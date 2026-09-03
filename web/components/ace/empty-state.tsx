import { cn } from "@/lib/cn";

/**
 * The framing device from the catalogue's `empty-state-with-cards` — four grid lines ruling
 * the edges of a centred message — on our own copy.
 *
 * The catalogue's version is a full-viewport section carrying vendor text ("Let's create
 * something amazing", "you haven't created any projects yet"). An empty state on this
 * dashboard is never nothing-has-happened; it is a filter that matched nothing, on a run that
 * definitely happened. So it takes the frame and says what is actually true, with the way
 * back.
 */
function GridLine({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute bg-rule",
        className,
      )}
    />
  );
}

export function EmptyState({
  title, children, className,
}: { title: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-rule bg-raised px-6 py-14", className)}>
      <GridLine className="left-6 right-6 top-0 h-px" />
      <GridLine className="left-6 right-6 bottom-0 h-px" />
      <GridLine className="left-0 top-6 bottom-6 w-px" />
      <GridLine className="right-0 top-6 bottom-6 w-px" />
      <div className="mx-auto flex max-w-[54ch] flex-col items-center gap-3 text-center">
        <h3 className="text-[17px] font-semibold text-ink">{title}</h3>
        {children && <div className="text-[14px] leading-relaxed text-muted">{children}</div>}
      </div>
    </div>
  );
}
