"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

/**
 * Renders nothing until mounted, so with JavaScript disabled the control is ABSENT rather
 * than present and dead. A toggle that does nothing when pressed is worse than no toggle.
 *
 * The stamp itself is applied by an inline script in the document head before first paint,
 * so the server-rendered page never flashes the wrong theme; this component only reads back
 * what that script decided and lets the reader change it.
 */
export default function ThemeToggle({ className }: { className?: string } = {}) {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stamped = document.documentElement.getAttribute("data-theme") as Theme | null;
    setTheme(stamped ?? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const set = (next: Theme) => {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("ballast.theme", next); } catch { /* private mode */ }
  };

  return (
    <button
      type="button"
      onClick={() => set(theme === "dark" ? "light" : "dark")}
      aria-label={`Switch to the ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to the ${theme === "dark" ? "light" : "dark"} theme`}
      /* The dashboard passes its own chip class so the control matches the bar it sits in
         rather than importing the landing page's button shape into a denser surface. */
      className={className ?? "flex size-9 items-center justify-center rounded-full border border-rule text-muted transition-colors hover:border-rulehi hover:text-ink"}
    >
      {theme === "dark" ? (
        /* sun: offers the light theme */
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
        </svg>
      ) : (
        /* moon: offers the dark theme */
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 13.4A8.2 8.2 0 1 1 10.6 4a6.6 6.6 0 0 0 9.4 9.4Z" />
        </svg>
      )}
    </button>
  );
}
