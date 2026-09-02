"use client";

import { useEffect, useState } from "react";
import Wordmark from "./Wordmark";

const SECTIONS = [
  { id: "how", label: "How it works" },
  { id: "live", label: "Live" },
  { id: "numbers", label: "The numbers" },
  { id: "hood", label: "Under the hood" },
];

/**
 * Slim, sticky, on `deep` with a hairline rule.
 *
 * The active-section highlight is the only thing here that needs JavaScript, and it is the
 * only thing that is lost without it: the links are ordinary anchors and the button is an
 * ordinary link, so with scripting off this is a working nav that simply does not highlight.
 *
 * Four links do not earn a hamburger. On narrow viewports it collapses to the mark and the
 * button, which are the two things a visitor actually needs.
 */
export default function Nav() {
  const [active, setActive] = useState<string>("");
  // Rendered visible, so with scripting off there is always a call to action in the nav.
  // JavaScript then hides it while the hero -- which has its own -- is still on screen.
  const [heroOut, setHeroOut] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      // Trigger when a section crosses the upper third, so the highlight changes when the
      // section is being read rather than when it first peeks in at the bottom.
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));

    const hero = document.getElementById("top");
    let heroIo: IntersectionObserver | undefined;
    if (hero) {
      heroIo = new IntersectionObserver(
        ([e]) => {
          setHeroOut(!e.isIntersecting);
          // Enable the transition only after the first measurement, so the button does not
          // visibly fade out on load when the hero is obviously already on screen.
          requestAnimationFrame(() => setReady(true));
        },
        { rootMargin: "-70px 0px 0px 0px", threshold: 0 },
      );
      heroIo.observe(hero);
    }
    return () => { io.disconnect(); heroIo?.disconnect(); };
  }, []);

  return (
    <nav className="aNav" aria-label="Main">
      <div className="aNavIn">
        <a className="aNavBrand" href="#top">
          <Wordmark size={24} />
          <span>Ballast</span>
        </a>
        <ul className="aNavLinks">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className={active === s.id ? "on" : undefined}
                aria-current={active === s.id ? "true" : undefined}>
                {s.label}
              </a>
            </li>
          ))}
        </ul>
        <a className={`aNavCta ${heroOut ? "in" : "out"} ${ready ? "anim" : ""}`} href="/app">
          Open the dashboard
        </a>
      </div>
    </nav>
  );
}
