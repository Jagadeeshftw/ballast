/**
 * The Ballast mark.
 *
 * This was a drawn Plimsoll load line -- the right idea, and it stays in the writing -- but
 * it was stroked in two fixed colours, one of them #EAF2F3. On the light theme's #FFFDF7
 * ground that circle was very nearly invisible, so the mark only ever worked on one of the
 * two grounds it had to work on.
 *
 * The real mark is used instead, extracted from the lockup in `assets/` and un-premultiplied
 * off the black it was drawn on, so it carries its own alpha and sits on either theme
 * without a tile behind it. Being an image rather than a glyph, it needs no colour token and
 * cannot drift out of contrast: it is the same mark in both themes, as a logo should be.
 *
 * `width`/`height` are set so the slot reserves its space before the file arrives and
 * nothing moves when it does.
 */
export default function Wordmark({ size = 34 }: { size?: number }) {
  return (
    <img
      src="/logo-mark.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{ width: size, height: size, flex: "none", display: "block" }}
    />
  );
}
