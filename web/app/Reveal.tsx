"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Adds a class once, when the element first comes into view.
 *
 * The contract that makes this safe: the element's DEFAULT styling is its FINAL state.
 * Nothing is hidden waiting for an observer. If JavaScript never runs -- or the observer
 * never fires, or the browser has no IntersectionObserver -- the content is simply there,
 * fully drawn. The class only ever adds a one-shot animation that ends where the static
 * styling already was.
 *
 * That is why this animates *from* visible rather than *to* visible.
 */
export default function Reveal({
  className, children, as: Tag = "div",
}: {
  className: string;
  children: React.ReactNode;
  as?: "div" | "section";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [go, setGo] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // Someone who has asked for less motion gets the static page, which is the same page.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setGo(true); io.disconnect(); } },
      { rootMargin: "0px 0px -18% 0px", threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref as never} className={`${className}${go ? " go" : ""}`}>
      {children}
    </Tag>
  );
}
