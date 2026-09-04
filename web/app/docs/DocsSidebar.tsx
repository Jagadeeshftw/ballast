"use client";

import { usePathname } from "next/navigation";
import {
  IconBook2, IconCoins, IconChartHistogram, IconCpu, IconLock,
  IconCircleOff, IconMicroscope, IconAlertTriangle, IconListDetails,
  IconArrowLeft, IconLayoutDashboard,
} from "@tabler/icons-react";
import { Sidebar, SidebarBody, SidebarLink, useSidebar } from "@/components/ace/sidebar";
import { DOC_GROUPS, docHref } from "@/lib/docs-nav";
import Wordmark from "../Wordmark";

const ICONS: Record<string, React.ReactNode> = {
  "what-it-is": <IconBook2 size={20} stroke={1.6} />,
  "what-it-pays": <IconCoins size={20} stroke={1.6} />,
  "economics": <IconChartHistogram size={20} stroke={1.6} />,
  "how-it-works": <IconCpu size={20} stroke={1.6} />,
  "custody": <IconLock size={20} stroke={1.6} />,
  "refusals": <IconCircleOff size={20} stroke={1.6} />,
  "findings": <IconMicroscope size={20} stroke={1.6} />,
  "limitations": <IconAlertTriangle size={20} stroke={1.6} />,
  "reference": <IconListDetails size={20} stroke={1.6} />,
};

/** Same rail as `/app`: icons collapsed, expanding on hover, labels present without JS. */
function Links() {
  const path = usePathname();
  const { setOpen } = useSidebar();
  const close = () => setOpen(false);

  return (
    <>
      <a href="/docs" onClick={close} title="Ballast docs"
        className="mb-4 grid h-10 grid-cols-[var(--rail-w,68px)_1fr] items-center text-[17px] font-bold text-ink">
        <span className="grid place-items-center"><Wordmark size={22} /></span>
        <span className="whitespace-nowrap">Docs</span>
      </a>

      {DOC_GROUPS.map((g) => (
        <div key={g.label} className="mb-1">
          {/* The group label is clipped with the rail, so it never shows as a stray letter. */}
          <div className="grid h-7 grid-cols-[var(--rail-w,68px)_1fr] items-center">
            <span aria-hidden="true" className="grid place-items-center">
              <span className="h-px w-4 bg-rule" />
            </span>
            <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
              {g.label}
            </span>
          </div>
          {g.pages.map((p) => (
            <SidebarLink key={p.slug} href={docHref(p.slug)} label={p.title}
              icon={ICONS[p.slug]} active={path === docHref(p.slug)} onClick={close} />
          ))}
        </div>
      ))}

      <div className="mt-auto flex flex-col gap-1 border-t border-rule pt-3">
        <SidebarLink href="/app" label="Dashboard" icon={<IconLayoutDashboard size={18} stroke={1.6} />} onClick={close} />
        <SidebarLink href="/" label="Landing page" icon={<IconArrowLeft size={18} stroke={1.6} />} onClick={close} />
      </div>
    </>
  );
}

export default function DocsSidebar() {
  return (
    <Sidebar>
      <SidebarBody>
        <Links />
      </SidebarBody>
    </Sidebar>
  );
}
