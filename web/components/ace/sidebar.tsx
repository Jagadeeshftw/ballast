"use client";

import { cn } from "@/lib/cn";
import React, { createContext, useContext, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconMenu2, IconX, IconLayoutSidebarLeftExpand, IconLayoutSidebarLeftCollapse } from "@tabler/icons-react";

/**
 * Aceternity's Sidebar (`@aceternity/sidebar`), restyled, with two changes.
 *
 * FIRST -- the collapse is CSS, not React state. The catalogue's labels are `motion.span`s with
 * `animate={{ opacity: open ? 1 : 0, display: open ? "inline-block" : "none" }}`. Because that
 * is `animate` and not `initial`, framer-motion server-renders them already hidden, and since
 * the expansion is a JS hover handler nothing brings them back: the rail ships as six
 * unlabelled icons. Here the labels are always in the HTML at full opacity, and the rail
 * simply clips them -- each row is a grid whose first track is EXACTLY the rail width, so the
 * label column starts at the clip edge rather than a few pixels inside it (which rendered as a
 * column of first letters and looked like a fault).
 *
 * SECOND -- expansion is pinned by a click, not by hover. Hover-expand on a fixed rail covers
 * the content underneath, and the alternative -- letting the content shrink as the rail grows
 * -- reflows the page while the pointer is moving across it. Neither is acceptable. A pin is a
 * deliberate act: the content column shifts once, because the reader asked for it. Keyboard
 * focus expands too, and shifts the content the same way, because tabbing into the rail is
 * equally deliberate. Nothing is ever obscured in either state.
 */

type SidebarCtx = {
  open: boolean; setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  pinned: boolean; togglePin: () => void; mounted: boolean;
};
const SidebarContext = createContext<SidebarCtx | undefined>(undefined);

export const useSidebar = () => {
  const c = useContext(SidebarContext);
  if (!c) throw new Error("useSidebar must be used within <Sidebar>");
  return c;
};

export const Sidebar = ({ children }: { children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);          // mobile overlay
  const [pinned, setPinned] = useState(false);      // desktop rail
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try { setPinned(localStorage.getItem("ballast.rail") === "pinned"); } catch { /* private mode */ }
    setMounted(true);
  }, []);

  /* The class goes on the shell rather than the rail: the content column is what has to move,
     and it is not a descendant of the rail. */
  useEffect(() => {
    const shell = document.getElementById("dir-a");
    if (shell) shell.classList.toggle("railPinned", pinned);
  }, [pinned]);

  const togglePin = () => {
    setPinned((v) => {
      const next = !v;
      try { localStorage.setItem("ballast.rail", next ? "pinned" : "rail"); } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <SidebarContext.Provider value={{ open, setOpen, pinned, togglePin, mounted }}>
      {children}
    </SidebarContext.Provider>
  );
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
      "railAside fixed left-0 top-0 z-50 hidden h-svh flex-col overflow-hidden border-r border-rule bg-raised",
      "transition-[width] duration-200 ease-out motion-reduce:transition-none md:flex",
      className,
    )}
  >
    <div className="flex h-full w-[248px] flex-col gap-1 py-3">{children}</div>
  </aside>
);

/** Pin control. Renders only after mount, so it is never a dead button with scripting off. */
export const PinToggle = () => {
  const { pinned, togglePin, mounted } = useSidebar();
  if (!mounted) return null;
  return (
    <button
      type="button"
      onClick={togglePin}
      aria-pressed={pinned}
      title={pinned ? "Collapse the sidebar" : "Keep the sidebar open"}
      aria-label={pinned ? "Collapse the sidebar" : "Keep the sidebar open"}
      className="grid h-10 grid-cols-[var(--rail-w)_1fr] items-center rounded-lg text-[13px] text-muted transition-colors hover:bg-ink/[0.04] hover:text-ink"
    >
      <span className="grid place-items-center" aria-hidden="true">
        {pinned ? <IconLayoutSidebarLeftCollapse size={19} stroke={1.6} />
                : <IconLayoutSidebarLeftExpand size={19} stroke={1.6} />}
      </span>
      <span className="whitespace-nowrap text-left">{pinned ? "Collapse" : "Keep open"}</span>
    </button>
  );
};

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
