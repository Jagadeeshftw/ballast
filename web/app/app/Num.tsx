"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A figure that counts from its previous value to its new one when it changes.
 *
 * The idea is the catalogue's `stats-with-number-ticker`; the implementation is not, for two
 * reasons that matter here. The catalogue counts from zero on mount, behind a framer
 * `initial={{ opacity: 0 }}` -- so a reader without JavaScript gets nothing and everyone else
 * watches a settled balance pretend to accrue. This renders the real value immediately, on
 * the server and on the client, and only ever animates a CHANGE: the old figure runs to the
 * new one over half a second, so a balance that moved is seen to move. With reduced motion
 * it jumps.
 */
export default function Num({ value, decimals = 2, className }: { value: number; decimals?: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (value === from.current) return;
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !Number.isFinite(value) || !Number.isFinite(from.current)) { from.current = value; setShown(value); return; }
    const start = performance.now(), a = from.current, b = value, ms = 550;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms), e = 1 - Math.pow(1 - k, 3);
      setShown(a + (b - a) * e);
      if (k < 1) raf.current = requestAnimationFrame(step); else { from.current = b; setShown(b); }
    };
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value]);

  return (
    <span className={className} data-num="">
      {shown.toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
}
