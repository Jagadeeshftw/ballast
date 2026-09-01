"use client";

import { useEffect, useState } from "react";

const MARKS = [
  { id: "top", label: "Hero" },
  { id: "how", label: "How it works" },
  { id: "live", label: "Live" },
  { id: "numbers", label: "The numbers" },
  { id: "hood", label: "Under the hood" },
];

/**
 * The draft scale: depth markings down the outer margin, the way they are painted on a hull.
 *
 * It gives the outer margin a job, ties the page to the load-line metaphor, and is the one
 * small custom thing no component library provides. Sections sit at their real scroll
 * positions, so it is a map of the page rather than a decorative progress bar.
 *
 * Server-rendered with the scale present and the marker at zero, so with scripting off it is
 * a static engraving rather than a missing element. It is decorative to a screen reader --
 * the nav already provides these destinations -- so the whole thing is aria-hidden.
 */
export default function Spine() {
  const [pct, setPct] = useState(0);
  const [marks, setMarks] = useState<{ id: string; label: string; at: number }[]>([]);

  useEffect(() => {
    const measure = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      setPct(scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0);
      setMarks(
        MARKS.map((m) => {
          const el = document.getElementById(m.id);
          const at = el && scrollable > 0
            ? Math.min(1, (el.getBoundingClientRect().top + window.scrollY) / (scrollable + window.innerHeight))
            : 0;
          return { ...m, at };
        }),
      );
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Graduations every 5%, longer every 25% — a draft scale, not a ruler.
  const ticks = Array.from({ length: 21 }, (_, i) => i * 5);

  return (
    <div className="spine" aria-hidden="true">
      <div className="spineRule">
        <div className="spineFill" style={{ height: `${pct * 100}%` }} />
        {ticks.map((t) => (
          <span key={t} className={`spineTick ${t % 25 === 0 ? "major" : ""}`} style={{ top: `${t}%` }} />
        ))}
        {marks.map((m) => (
          <span key={m.id} className="spineMark" style={{ top: `${m.at * 100}%` }}>
            <i />
            <b>{m.label}</b>
          </span>
        ))}
        <span className="spineHead" style={{ top: `${pct * 100}%` }} />
      </div>
    </div>
  );
}
