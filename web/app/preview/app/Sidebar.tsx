"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Wordmark from "../Wordmark";

const BASE = "/preview/app";

const NAV = [
  { href: BASE, label: "Overview", icon: "◐", primary: true },
  { href: `${BASE}/cover`, label: "Cover", icon: "▤", primary: true },
  { href: `${BASE}/policy`, label: "Policy", icon: "◎", primary: true },
  { href: `${BASE}/funds`, label: "Funds", icon: "▦", primary: true },
  { href: `${BASE}/engine`, label: "Engine", icon: "⌁", primary: false },
  { href: `${BASE}/activity`, label: "Activity", icon: "≡", primary: false },
] as const;

const EXTERNAL = [
  { href: "https://github.com/Jagadeeshftw/ballast/tree/main/docs", label: "Docs" },
  { href: "https://github.com/Jagadeeshftw/ballast", label: "Repo" },
  { href: "/preview/a", label: "ballast.0xo.in" },
] as const;

/**
 * Persistent sidebar, and a bottom bar on phones.
 *
 * `usePathname` resolves during server rendering too, so the active destination is marked in
 * the HTML rather than appearing after hydration — no flash, and correct with scripting off.
 * The active mark is a `covered` rule on the leading edge, not a filled pill.
 */
export default function Sidebar() {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem("ballast.rail") === "1"); } catch { /* private mode */ }
  }, []);

  const toggle = () => {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem("ballast.rail", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  const isActive = (href: string) => (href === BASE ? path === BASE : path.startsWith(href));

  return (
    <>
      <aside className={`sbar ${collapsed ? "narrow" : ""}`} aria-label="Sections">
        <a className="sbarBrand" href={BASE}>
          <Wordmark size={22} />
          <span>Ballast</span>
        </a>

        <nav className="sbarNav">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className={isActive(n.href) ? "on" : undefined}
              aria-current={isActive(n.href) ? "page" : undefined} title={n.label}>
              <i aria-hidden="true">{n.icon}</i><span>{n.label}</span>
            </a>
          ))}
        </nav>

        <div className="sbarFoot">
          {EXTERNAL.map((e) => (
            <a key={e.href} href={e.href} title={e.label}
              {...(e.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>
              <i aria-hidden="true">↗</i><span>{e.label}</span>
            </a>
          ))}
          <button type="button" className="sbarToggle" onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <i aria-hidden="true">{collapsed ? "»" : "«"}</i><span>Collapse</span>
          </button>
        </div>
      </aside>

      {/* Phones get the four most-used destinations, not a hamburger for six links. */}
      <nav className="bbar" aria-label="Sections">
        {NAV.filter((n) => n.primary).map((n) => (
          <a key={n.href} href={n.href} className={isActive(n.href) ? "on" : undefined}
            aria-current={isActive(n.href) ? "page" : undefined}>
            <i aria-hidden="true">{n.icon}</i><span>{n.label}</span>
          </a>
        ))}
      </nav>
    </>
  );
}
