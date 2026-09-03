"use client";
import React, { useEffect, useRef, useState } from "react";
import { useMotionValueEvent, useScroll } from "motion/react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export const StickyScroll = ({
  content,
  contentClassName,
}: {
  content: {
    title: string;
    description: string;
    content?: React.ReactNode | any;
  }[];
  contentClassName?: string;
}) => {
  const [activeCard, setActiveCard] = React.useState(0);
  const ref = useRef<any>(null);
  const { scrollYProgress } = useScroll({
    // uncomment line 22 and comment line 23 if you DONT want the overflow container and want to have it change on the entire page scroll
    // target: ref
    container: ref,
    offset: ["start start", "end start"],
  });
  const cardLength = content.length;

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    const cardsBreakpoints = content.map((_, index) => index / cardLength);
    const closestBreakpointIndex = cardsBreakpoints.reduce(
      (acc, breakpoint, index) => {
        const distance = Math.abs(latest - breakpoint);
        if (distance < Math.abs(latest - cardsBreakpoints[acc])) {
          return index;
        }
        return acc;
      },
      0,
    );
    setActiveCard(closestBreakpointIndex);
  });

  const backgroundColors = ["var(--color-ground)", "var(--color-ground)", "var(--color-ground)"];
  // Mixed against the raised surface token, so each theme resolves its own panel rather than
  // baking the dark one in. Each gradient carries the payoff region it belongs to.
  const linearGradients = [
    "linear-gradient(160deg, color-mix(in srgb, var(--color-paid) 22%, var(--color-raised)), var(--color-raised))",
    "linear-gradient(160deg, color-mix(in srgb, var(--color-signal) 24%, var(--color-raised)), var(--color-raised))",
    "linear-gradient(160deg, color-mix(in srgb, var(--color-lost) 22%, var(--color-raised)), var(--color-raised))",
  ];

  const [backgroundGradient, setBackgroundGradient] = useState(
    linearGradients[0],
  );

  useEffect(() => {
    setBackgroundGradient(linearGradients[activeCard % linearGradients.length]);
  }, [activeCard]);

  return (
    <motion.div
      style={{ backgroundColor: backgroundColors[activeCard % backgroundColors.length] }}
      className="relative flex h-[32rem] justify-between gap-10 overflow-y-auto rounded-xl border border-rule p-6 md:p-10"
      ref={ref}
    >
      <div className="relative flex items-start">
        <div className="max-w-xl">
          {content.map((item, index) => (
            <div key={item.title + index} className="my-16">
              <motion.h2
                initial={false}
                animate={{
                  opacity: activeCard === index ? 1 : 0.35,
                }}
                className="text-2xl font-bold tracking-tight text-ink"
              >
                {item.title}
              </motion.h2>
              <motion.p
                initial={false}
                animate={{
                  opacity: activeCard === index ? 1 : 0.35,
                }}
                className="mt-5 max-w-md leading-relaxed text-muted"
              >
                {item.description}
              </motion.p>
            </div>
          ))}
          <div className="h-24" />
        </div>
      </div>
      <div
        style={{ background: backgroundGradient }}
        className={cn(
          "sticky top-10 hidden h-72 w-96 overflow-hidden rounded-xl border border-rule lg:block",
          contentClassName,
        )}
      >
        {content[activeCard].content ?? null}
      </div>
    </motion.div>
  );
};
