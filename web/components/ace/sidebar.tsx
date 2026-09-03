"use client";

import { cn } from "@/lib/cn";
import React, { createContext, useContext, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconMenu2, IconX } from "@tabler/icons-react";

/**
 * Aceternity's Sidebar (`@aceternity/sidebar`), restyled to the palette and with one
 * structural change on the desktop side.
 *
 * The catalogue's version drives the collapse from React state: the rail is `useState(false)`
 * and each label is a `motion.span` with `animate={{ opacity: open ? 1 : 0, display: open ?
 * "inline-block" : "none" }}`. Because that is `animate` rather than `initial`, framer-motion
 * server-renders the labels already at `opacity: 0; display: none` -- and since the expansion
 * is a JS hover handler, nothing ever brings them back without scripting. The rail would ship
 * as six unlabelled icons with no way to read them.
 *
 * So the desktop rail expands through CSS instead: the container is `overflow-hidden` at rail
 * width and grows on `:hover`/`:focus-within`, while each row is a fixed full-width grid whose
 * label is simply CLIPPED rather than hidden. The label text is present, at full opacity, in
 * the server-rendered HTML; hovering reveals it with no JavaScript involved, and keyboard
 * focus does the same, which the state-driven version never handled. Same look, same motion,
 * and it survives the no-JS render the dashboard is required to produce.
 *
 * The mobile half is the catalogue's unchanged in behaviour -- a hamburger opening a
 * full-screen overlay -- because it is gated behind `open &&` inside `AnimatePresence`, so
 * nothing of it is server-rendered invisible.
 */

type SidebarCtx = { open: boolean; setOpen: React.Dispatch<React.SetStateAction<boolean>> };
const SidebarContext = createContext<SidebarCtx | undefined>(undefined);

export const useSidebar = () => {
  const c = useContext(SidebarContext);
  if (!c) throw new Error("useSidebar must be used within <Sidebar>");
  return c;
};

export const Sidebar = ({ children }: { children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  return <SidebarContext.Provider value={{ open, setOpen }}>{children}</SidebarContext.Provider>;
};

export const SidebarBody = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <>
    <DesktopSidebar className={className}>{children}</DesktopSidebar>
    <MobileSidebar>{children}</MobileSidebar>
  </>
);

/** Rail width collapsed, full width on hover or keyboard focus. Pure CSS. */
export const DesktopSidebar = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <aside
    aria-label="Sections"
    className={cn(
      /* Fixed, not in flow: the rail reserves 68px in the grid and the expansion OVERLAYS the
         content. In flow it would push the page sideways on every hover -- layout shift on an
         idle mouse move, which the quality floor rules out. */
      "group/rail fixed left-0 top-0 z-50 hidden h-svh flex-col overflow-hidden border-r border-rule bg-raised",
      "shadow-none hover:shadow-2xl hover:shadow-black/25 focus-within:shadow-2xl",
      "w-[68px] focus-within:w-[248px] hover:w-[248px]",
      "transition-[width] duration-300 ease-out motion-reduce:transition-none md:flex",
      className,
    )}
  >
    {/* Fixed inner width so labels are clipped by the rail rather than reflowing as it grows. */}
    <div className="flex h-full w-[248px] flex-col gap-1 p-3">{children}</div>
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
    aria-current={active ? "page" : undefined}
    {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    className={cn(
      "group/link flex items-center gap-3 rounded-lg px-2.5 py-2 text-[14px] transition-colors",
      active ? "bg-signal/10 text-ink" : "text-muted hover:bg-ink/[0.04] hover:text-ink",
    )}
  >
    <span className={cn("grid size-6 shrink-0 place-items-center", active && "text-signal")}>
      {icon}
    </span>
    {/* Always rendered, always opaque -- the rail clips it when collapsed. */}
    <span className="whitespace-nowrap transition-transform duration-150 group-hover/link:translate-x-0.5">
      {label}
    </span>
  </a>
);
