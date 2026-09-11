"use client";

import { cn } from "@/lib/utils";
import React, { useEffect, useState } from "react";

export const InfiniteMovingCards = ({
  items,
  direction = "left",
  speed = "fast",
  pauseOnHover = true,
  className,
}: {
  items: {
    quote: string;
    name: string;
    title: string;
  }[];
  direction?: "left" | "right";
  speed?: "fast" | "normal" | "slow";
  pauseOnHover?: boolean;
  className?: string;
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const scrollerRef = React.useRef<HTMLUListElement>(null);

  const [start, setStart] = useState(false);
  // Reduced motion: no clones, no scrolling, and the cards wrap into a still grid so every
  // one is visible once. It follows the preference if it changes mid-visit. This was the last
  // animation on the site that ignored it.
  const [still, setStill] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      if (mq.matches) {
        removeClones();
        setStart(false);
        setStill(true);
      } else {
        setStill(false);
        addAnimation();
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  function removeClones() {
    scrollerRef.current?.querySelectorAll("[data-clone]").forEach((n) => n.remove());
  }

  function addAnimation() {
    if (containerRef.current && scrollerRef.current) {
      // Clone once. The effect can run twice (a preference flip, or React's dev re-mount),
      // and cloning again would double the row. Clones are hidden from assistive tech so
      // each card is announced once, not twice.
      if (!scrollerRef.current.querySelector("[data-clone]")) {
        Array.from(scrollerRef.current.children).forEach((item) => {
          const duplicatedItem = item.cloneNode(true) as HTMLElement;
          duplicatedItem.setAttribute("data-clone", "");
          duplicatedItem.setAttribute("aria-hidden", "true");
          scrollerRef.current?.appendChild(duplicatedItem);
        });
      }

      getDirection();
      getSpeed();
      setStart(true);
    }
  }
  const getDirection = () => {
    if (containerRef.current) {
      if (direction === "left") {
        containerRef.current.style.setProperty(
          "--animation-direction",
          "forwards",
        );
      } else {
        containerRef.current.style.setProperty(
          "--animation-direction",
          "reverse",
        );
      }
    }
  };
  const getSpeed = () => {
    if (containerRef.current) {
      if (speed === "fast") {
        containerRef.current.style.setProperty("--animation-duration", "20s");
      } else if (speed === "normal") {
        containerRef.current.style.setProperty("--animation-duration", "40s");
      } else {
        containerRef.current.style.setProperty("--animation-duration", "80s");
      }
    }
  };
  return (
    <div
      ref={containerRef}
      className={cn(
        "scroller relative z-20 max-w-7xl",
        !still && "overflow-hidden [mask-image:linear-gradient(to_right,transparent,white_20%,white_80%,transparent)]",
        className,
      )}
    >
      <ul
        ref={scrollerRef}
        className={cn(
          "flex min-w-full shrink-0 gap-4 py-4",
          still ? "w-full flex-wrap" : "w-max flex-nowrap",
          start && "animate-scroll",
          pauseOnHover && "hover:[animation-play-state:paused]",
        )}
      >
        {items.map((item, idx) => (
          <li
            className="relative w-[300px] max-w-full shrink-0 rounded-xl border border-rule bg-raised px-6 py-5 md:w-[360px] border-rule dark:bg-raised"
            key={item.name}
          >
            <blockquote>
              <div
                aria-hidden="true"
                className="user-select-none pointer-events-none absolute -top-0.5 -left-0.5 -z-1 h-[calc(100%_+_4px)] w-[calc(100%_+_4px)]"
              ></div>
              <span className="relative z-20 text-[15px] font-medium leading-snug text-ink text-ink">
                {item.quote}
              </span>
              <div className="relative z-20 mt-6 flex flex-row items-center">
                <span className="flex flex-col gap-1">
                  <span className="text-[15px] font-medium leading-snug text-muted text-muted">
                    {item.name}
                  </span>
                  <span className="text-[15px] font-medium leading-snug text-muted text-muted">
                    {item.title}
                  </span>
                </span>
              </div>
            </blockquote>
          </li>
        ))}
      </ul>
    </div>
  );
};
