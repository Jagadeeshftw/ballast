"use client";

import { useState } from "react";
import {
  Navbar, NavBody, NavItems, MobileNav, MobileNavHeader, MobileNavMenu, MobileNavToggle,
} from "@/components/ace/resizable-navbar";

const LINKS = [
  { name: "What it pays", link: "#pays" },
  { name: "How it works", link: "#how" },
  { name: "The numbers", link: "#numbers" },
  { name: "Questions", link: "#faq" },
];

/** The Plimsoll load line: a circle with a bar through it. */
function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" className="shrink-0">
      <circle cx="11" cy="11" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <line x1="0" y1="11" x2="22" y2="11" stroke="#E0A130" strokeWidth="2.2" />
    </svg>
  );
}

export default function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <Navbar>
      <NavBody>
        <a href="#top" className="relative z-20 flex items-center gap-2.5 px-2 text-ink">
          <Mark />
          <span className="font-bold tracking-tight">Ballast</span>
        </a>
        <NavItems items={LINKS} />
        <div className="relative z-20 flex items-center gap-2">
          <a href="/app"
            className="rounded-md bg-signal px-4 py-2 text-sm font-bold text-ground transition hover:brightness-110">
            Open the dashboard
          </a>
        </div>
      </NavBody>

      <MobileNav>
        <MobileNavHeader>
          <a href="#top" className="flex items-center gap-2.5 text-ink">
            <Mark /><span className="font-bold tracking-tight">Ballast</span>
          </a>
          <MobileNavToggle isOpen={open} onClick={() => setOpen(!open)} />
        </MobileNavHeader>
        <MobileNavMenu isOpen={open} onClose={() => setOpen(false)}>
          {LINKS.map((l) => (
            <a key={l.link} href={l.link} onClick={() => setOpen(false)} className="w-full py-1 text-muted">
              {l.name}
            </a>
          ))}
          <a href="/app" className="mt-2 w-full rounded-md bg-signal px-4 py-2 text-center text-sm font-bold text-ground">
            Open the dashboard
          </a>
        </MobileNavMenu>
      </MobileNav>
    </Navbar>
  );
}
