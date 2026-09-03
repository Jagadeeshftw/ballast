"use client";

import { cn } from "@/lib/cn";
import React, { createContext, useContext, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconMenu2, IconX } from "@tabler/icons-react";

/**
 * Aceternity's Sidebar (`@aceternity/sidebar`), restyled to the palette.
 *
 * It behaves as the catalogue component does: the rail sits in flow at icon width, expands on
 * hover, collapses when the pointer leaves, and the content column shifts with it. Being in
 * flow it cannot overlap the content at all -- the shift IS the mechanism.
 *
 * ONE deviation, and only one. The catalogue's labels are `motion.span`s carrying
 * `animate={{ opacity: open ? 1 : 0, display: open ? "inline-block" : "none" }}`. Because that
 * is `animate` and not `initial`, framer-motion server-renders them already at
 * `opacity: 0; display: none`, and since the expansion is a JS hover handler nothing ever
 * brings them back: the rail ships as six unlabelled icons to anyone without scripting. So the
 * collapse is CSS here. Each row is a grid whose first track is EXACTLY the rail width, which
 * puts the label column at the clip edge rather than a few pixels inside it -- inside it, the
 * rail renders as a column of first letters and reads as a fault. Labels are present at full
 * opacity in the server HTML, and `:hover` / `:focus-within` reveal them with no JavaScript.
 */

type SidebarCtx = { open: boolean; setOpen: React.Dispatch<React.SetStateAction<boolean>> };
const SidebarContext = createContext<SidebarCtx | undefined>(undefined);

export const useSidebar = () => {
  const c = useContext(SidebarContext);
  if (!c) throw new Error("useSidebar must be used within <Sidebar>");
  return c;
};

export const Sidebar = ({ children }: { children: React.ReactNode }) => {
  const [open, setOpen] = useState(false); // mobile overlay only
  return <SidebarContext.Provider value={{ open, setOpen }}>{children}</SidebarContext.Provider>;
};

export const SidebarBody = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <>
    <DesktopSidebar className={className}>{children}</DesktopSidebar>
    <MobileSidebar>{children}</MobileSidebar>
  </>
);

export const DesktopSidebar = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <aside
    aria-label="Sections"
    className={cn(
      "railAside sticky top-0 hidden h-svh shrink-0 flex-col overflow-hidden border-r border-rule bg-raised",
      "w-[var(--rail-w)] hover:w-[var(--rail-open)] focus-within:w-[var(--rail-open)]",
      "transition-[width] duration-200 ease-out motion-reduce:transition-none md:flex",
      className,
    )}
  >
    <div className="flex h-full w-[var(--rail-open)] flex-col gap-1 py-3">{children}</div>
  </aside>
);

export const MobileSidebar = ({ children }: { children: React.ReactNode }) => {
  const { open, setOpen } = useSidebar();
  return (
    <div className="sticky top-0 z-40 flex h-12 w-full flex-row items-center justify-between border-b border-rule bg-raised px-3 md:hidden">
      <span className="font-semibold text-ink">Ballast</span>
      <button type="button" aria-label="Open sections" aria-expanded={open}
        className="rounded-md p-1.5 text-muted hover:text-ink" onClick={() => setOpen(true)}>
        <IconMenu2 size={20} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: "-100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "-100%", opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeInOut" }}
            className="fixed inset-0 z-[100] flex flex-col gap-1 bg-ground p-6"
          >
            <button type="button" aria-label="Close sections"
              className="absolute right-5 top-5 rounded-md p-1.5 text-muted hover:text-ink"
              onClick={() => setOpen(false)}>
              <IconX size={20} />
            </button>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const SidebarLink = ({
  href, label, icon, active, external, onClick,
}: {
  href: string; label: string; icon: React.ReactNode;
  active?: boolean; external?: boolean; onClick?: () => void;
}) => (
  <a
    href={href}
    onClick={onClick}
    title={label}
    aria-current={active ? "page" : undefined}
    {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    className={cn(
      "group/link grid h-10 grid-cols-[var(--rail-w)_1fr] items-center rounded-lg text-[14px] transition-colors",
      active ? "bg-signal/10 text-ink" : "text-muted hover:bg-ink/[0.04] hover:text-ink",
    )}
  >
    <span className={cn("grid place-items-center", active && "text-signal")} aria-hidden="true">
      {icon}
    </span>
    <span className="whitespace-nowrap pr-4 transition-transform duration-150 group-hover/link:translate-x-0.5">
      {label}
    </span>
  </a>
);
