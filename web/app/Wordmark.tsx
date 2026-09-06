/**
 * The Plimsoll load line: a circle with a bar through it, painted on a hull to mark how deep
 * the ship may safely sit. It is the product, drawn — so it is the mark, and it reads as a
 * symbol at 24px in a way a gradient gets no chance to.
 *
 * The brand mark is reserved for the places that want a picture rather than a symbol: the
 * favicons and apple-touch-icon, the social preview, and the README.
 *
 * Both colours come from the theme rather than being fixed. The earlier version of this
 * stroked #EAF2F3, which on the light theme's #FFFDF7 ground was very nearly invisible — the
 * mark only worked on one of the two grounds it had to work on. `currentColor` inherits the
 * ink of whatever it sits in, and the bar takes the identity accent, which is defined for
 * both themes and clears contrast on each.
 */
export default function Wordmark({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      aria-hidden="true" style={{ flex: "none", display: "block" }}
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <line x1="1" y1="12" x2="23" y2="12" stroke="var(--color-signal)" strokeWidth="2.2" />
    </svg>
  );
}
