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

  const backgroundColors = ["#16150F", "#16150F", "#16150F"]; // the page's own ground
  const linearGradients = [
    "linear-gradient(160deg, rgba(111,185,143,.22), rgba(31,29,22,.9))", // over-compensated
    "linear-gradient(160deg, rgba(224,161,48,.24), rgba(31,29,22,.9))", // the make-whole point
    "linear-gradient(160deg, rgba(209,103,79,.22), rgba(31,29,22,.9))", // under-compensated
  ];

  const [backgroundGradient, setBackgroundGradient] = useState(
    linearGradients[0],
  );

  useEffect(() => {
    setBackgroundGradient(linearGradients[activeCard % linearGradients.length]);
  }, [activeCard]);

  return (
    <motion.div
      animate={{
        backgroundColor: backgroundColors[activeCard % backgroundColors.length],
      }}
      className="relative flex h-[32rem] justify-center gap-10 overflow-y-auto rounded-xl border border-rule p-6 md:p-10"
      ref={ref}
    >
      <div className="div relative flex items-start px-4">
        <div className="max-w-2xl">
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
