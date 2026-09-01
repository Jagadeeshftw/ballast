/**
 * The Plimsoll load line: a circle with a horizontal bar through it, painted on a hull to
 * mark how deep the ship may safely sit. It is the product, drawn — so it is the mark.
 */
export default function Wordmark({ size = 34 }: { size?: number }) {
  const r = size / 2 - 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ flex: "none" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EAF2F3" strokeWidth="1.6" />
      <line x1={size / 2 - r - 3} y1={size / 2} x2={size / 2 + r + 3} y2={size / 2}
        stroke="#2FBFA3" strokeWidth="2.4" />
    </svg>
  );
}
