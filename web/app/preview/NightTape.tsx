import { EXPLORER, type TapeItem } from "@/lib/chain";

/**
 * The claim proving itself, as a designed object rather than a table: alternating row tint,
 * block numbers held back in `chart`, status dots carrying their own semantic colour.
 *
 * The newest row arrives with one soft `beacon` pulse. That is the only motion on the page
 * the reader did not ask for, and under `prefers-reduced-motion` it renders as a plain list
 * with no animation at all — the CSS drops the keyframe, not the row.
 */
export default function NightTape({ items, spanBlocks }: { items: TapeItem[]; spanBlocks: number }) {
  if (items.length === 0) {
    return (
      <div className="npanel">
        <p style={{ margin: 0 }}>
          Nothing in the last {spanBlocks.toLocaleString()} blocks. The engine reacts when
          dreamDEX rolls a window; the short series runs every 60 seconds, so this fills within
          about a minute.
        </p>
      </div>
    );
  }
  return (
    <ol className="ntape">
      {items.map((t, i) => (
        <li key={`${t.tx}-${i}`} className={i === 0 ? "newest" : undefined}>
          <span className="nt-block">{String(t.block)}</span>
          <span className={`nt-dot ${t.tone}`} aria-hidden="true" />
          <span className="nt-head">{t.headline}</span>
          <span className="nt-detail">{t.detail}</span>
          <a className="nt-tx" href={`${EXPLORER}/tx/${t.tx}`}>tx</a>
        </li>
      ))}
    </ol>
  );
}
