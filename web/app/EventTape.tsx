import { EXPLORER, type TapeItem } from "@/lib/chain";

/**
 * The claim, proving itself. A window opens, Ballast's callback lands in the same block,
 * the ladder ticks, cover opens or is declined with its reason. Block numbers throughout so
 * every line is checkable.
 *
 * Rendered as a plain list: no animation is required to read it, which is also what
 * `prefers-reduced-motion` gets.
 */
export default function EventTape({ items, spanBlocks }: { items: TapeItem[]; spanBlocks: number }) {
  if (items.length === 0) {
    return (
      <p className="empty">
        Nothing in the last {spanBlocks.toLocaleString()} blocks. The engine reacts when
        dreamDEX rolls a window; the short series runs every 60 seconds, so this fills within
        about a minute.
      </p>
    );
  }
  return (
    <ol className="tape">
      {items.map((t, i) => (
        <li key={`${t.tx}-${i}`} className={t.tone}>
          <span className="tape-block">{String(t.block)}</span>
          <span className={`tape-dot ${t.tone}`} aria-hidden="true" />
          <span className="tape-head">{t.headline}</span>
          <span className="tape-detail">{t.detail}</span>
          <a className="tape-tx" href={`${EXPLORER}/tx/${t.tx}`}>tx</a>
        </li>
      ))}
    </ol>
  );
}
