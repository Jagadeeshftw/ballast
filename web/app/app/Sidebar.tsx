"use client";

import { usePathname } from "next/navigation";
import {
  IconLayoutDashboard, IconShieldHalf, IconTargetArrow, IconWallet,
  IconBolt, IconTimelineEvent, IconBrandGithub, IconFileText, IconWorld,
} from "@tabler/icons-react";
import { Sidebar, SidebarBody, SidebarLink, useSidebar } from "@/components/ace/sidebar";
import Wordmark from "../Wordmark";

const BASE = "/app";

const NAV = [
  { href: BASE, label: "Overview", icon: <IconLayoutDashboard size={20} stroke={1.6} /> },
  { href: `${BASE}/cover`, label: "Cover", icon: <IconShieldHalf size={20} stroke={1.6} /> },
  { href: `${BASE}/policy`, label: "Policy", icon: <IconTargetArrow size={20} stroke={1.6} /> },
  { href: `${BASE}/funds`, label: "Funds", icon: <IconWallet size={20} stroke={1.6} /> },
  { href: `${BASE}/engine`, label: "Engine", icon: <IconBolt size={20} stroke={1.6} /> },
  { href: `${BASE}/activity`, label: "Activity", icon: <IconTimelineEvent size={20} stroke={1.6} /> },
] as const;

const EXTERNAL = [
  { href: "https://github.com/Jagadeeshftw/ballast/tree/main/docs", label: "Docs", icon: <IconFileText size={18} stroke={1.6} /> },
  { href: "https://github.com/Jagadeeshftw/ballast", label: "Repo", icon: <IconBrandGithub size={18} stroke={1.6} /> },
  { href: "/", label: "ballast.0xo.in", icon: <IconWorld size={18} stroke={1.6} /> },
] as const;

/**
 * `usePathname` resolves during server rendering too, so the active destination is marked in
 * the HTML rather than appearing after hydration -- no flash, and correct with scripting off.
 */
function Links() {
  const path = usePathname();
  const { setOpen } = useSidebar();
  const isActive = (href: string) => (href === BASE ? path === BASE : path.startsWith(href));
  const close = () => setOpen(false);

  return (
    <>
      <a href={BASE} onClick={close}
        className="mb-4 flex items-center gap-3 rounded-lg px-2 py-1.5 text-[17px] font-bold text-ink">
        <span className="grid size-6 shrink-0 place-items-center"><Wordmark size={22} /></span>
        <span className="whitespace-nowrap">Ballast</span>
      </a>

      <nav className="flex flex-col gap-1">
        {NAV.map((n) => (
          <SidebarLink key={n.href} href={n.href} label={n.label} icon={n.icon}
            active={isActive(n.href)} onClick={close} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-rule pt-3">
        {EXTERNAL.map((e) => (
          <SidebarLink key={e.href} href={e.href} label={e.label} icon={e.icon}
            external={e.href.startsWith("http")} onClick={close} />
        ))}
      </div>
    </>
  );
}

export default function AppSidebar() {
  return (
    <Sidebar>
      <SidebarBody>
        <Links />
      </SidebarBody>
    </Sidebar>
  );
}
