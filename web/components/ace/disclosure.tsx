import { cn } from "@/lib/cn";

/**
 * The catalogue's FAQ accordion treatment (`frequently-asked-questions-accordion`) — the
 * plus/minus affordance and the ruled rows — on `<details>/<summary>` instead of React state.
 *
 * The catalogue version renders its answer only inside `{open === q && <motion.div>}`, so with
 * scripting off the content is not merely collapsed, it is absent from the document. On a page
 * whose job is to be checkable evidence that is the wrong trade. `<details>` keeps every answer
 * in the DOM, toggles without JavaScript, is announced correctly by screen readers, and is
 * found by in-page search. The icon swap is CSS on `[open]`, so it needs no JavaScript either.
 */
export function Disclosure({
  summary, children, defaultOpen = false, className,
}: {
  summary: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean; className?: string;
}) {
  return (
    <details open={defaultOpen} className={cn("group/d border-b border-rule last:border-b-0", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[15px] font-medium text-ink marker:hidden [&::-webkit-details-marker]:hidden">
        {summary}
        <span aria-hidden="true"
          className="relative grid size-5 shrink-0 place-items-center rounded-full border border-rule text-muted transition-colors group-open/d:border-rulehi">
          <span className="absolute h-px w-2.5 bg-current" />
          <span className="absolute h-2.5 w-px bg-current transition-transform duration-200 group-open/d:scale-y-0 motion-reduce:transition-none" />
        </span>
      </summary>
      <div className="pb-4 text-[14px] leading-relaxed text-muted">{children}</div>
    </details>
  );
}
