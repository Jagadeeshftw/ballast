"use client";
import React, { useRef, useEffect, useId, useImperativeHandle } from "react";
import { Easing, motion, useAnimate } from "motion/react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export default function BentoGridIllustrations() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardSkeleton>
            <MacbookIllustration />
          </CardSkeleton>
          <CardContent>
            <CardTitle>Desktop builds in minutes</CardTitle>
            <CardDescription>
              Ship faster with instant previews and seamless deployment
              pipelines.
            </CardDescription>
          </CardContent>
        </Card>
        <Card className="md:col-span-1">
          <CardSkeleton className="min-h-24">
            <DynamicIsland
              idleText="Waiting"
              loadingText="Syncing..."
              processedText="All synced"
            />
          </CardSkeleton>
          <CardContent>
            <CardTitle>Everything in sync</CardTitle>
            <CardDescription>Real-time sync across devices.</CardDescription>
          </CardContent>
        </Card>
        <Card>
          <CardSkeleton>
            <IPhoneIllustration />
          </CardSkeleton>
          <CardContent>
            <CardTitle>Mobile compatible, everywhere</CardTitle>
            <CardDescription>
              Responsive by default. Works on every device.
            </CardDescription>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardSkeleton>
            <IPadIllustration />
          </CardSkeleton>
          <CardContent>
            <CardTitle>Tablet ready, always</CardTitle>
            <CardDescription>
              Optimized layouts for tablets and large screens out of the box.
            </CardDescription>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      whileHover="animate"
      initial="initial"
      className={cn(
        `group flex flex-col justify-between gap-6 rounded-2xl p-4 shadow-sm ring-1 shadow-black/5 ring-black/5 md:p-8 dark:bg-neutral-900 dark:shadow-white/5 dark:ring-white/10`,
        className,
      )}
    >
      {children}
    </motion.div>
  );
}

function CardContent({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-0">{children}</div>;
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-4 text-center text-sm font-medium text-neutral-900 dark:text-neutral-100">
      {children}
    </h3>
  );
}

function CardDescription({ children }: { children: React.ReactNode }) {
  return (
    <p className="mx-auto mt-1 max-w-sm text-center text-sm text-balance text-neutral-500 dark:text-neutral-400">
      {children}
    </p>
  );
}

function CardSkeleton({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      {children}
    </div>
  );
}

interface DynamicIslandHandle {
  start: () => void;
  reset: () => void;
}

const SPRING_OPTIONS = {
  type: "spring" as const,
  stiffness: 500,
  damping: 40,
};

function MacbookIllustration() {
  const dynamicIslandRef = useRef<DynamicIslandHandle>(null);

  const lidVariants = {
    initial: { rotateX: -60 },
    animate: { rotateX: 20 },
  };

  const screenContentVariants = {
    initial: { opacity: 0, filter: "blur(8px)" },
    animate: { opacity: 1, filter: "blur(0px)" },
  };

  const TRANSITION = {
    duration: 0.98,
    ease: [0.901, 0.016, 0, 1.032] as Easing,
  };

  const CONTENT_TRANSITION = {
    duration: 0.3,
    ease: "easeOut" as Easing,
    delay: 0.5,
  };

  return (
    <motion.div
      onHoverStart={() => dynamicIslandRef.current?.start()}
      onHoverEnd={() => dynamicIslandRef.current?.reset()}
    >
      <div className="mx-auto w-48 perspective-distant">
        <motion.div
          style={{ transformOrigin: "bottom" }}
          variants={lidVariants}
          transition={TRANSITION}
          className="mx-auto h-24 w-[90%] rounded-tl-lg rounded-tr-lg bg-neutral-200 p-1 shadow-sm ring-1 shadow-black/5 ring-black/5 dark:bg-neutral-700 dark:shadow-white/5 dark:ring-white/10"
        >
          <div className="relative h-full w-full overflow-hidden rounded-tl rounded-tr-lg rounded-br-sm rounded-bl-sm bg-white dark:bg-neutral-900">
            <motion.div
              variants={screenContentVariants}
              transition={CONTENT_TRANSITION}
              className="absolute inset-0"
            >
              <Image
                src="https://assets.aceternity.com/components/feature-section-with-bento-skeletons.webp"
                alt="Screen"
                fill
                className="object-cover"
              />
              <div className="absolute inset-x-0 top-0 z-10">
                <MacbookDynamicIsland ref={dynamicIslandRef} />
              </div>
            </motion.div>
          </div>
        </motion.div>
        <div className="relative h-2.5 w-full rounded-tl-md rounded-tr-md rounded-br-3xl rounded-bl-3xl bg-linear-to-b from-neutral-200 to-neutral-300 shadow-[0px_1px_0px_0px_rgba(0,0,0,0.05)_inset] dark:from-neutral-600 dark:to-neutral-800">
          <div className="absolute inset-x-0 top-0 mx-auto h-1 w-8 rounded-br-sm rounded-bl-sm bg-neutral-400 dark:bg-neutral-500" />
        </div>
      </div>
    </motion.div>
  );
}

function IPhoneIllustration() {
  const dynamicIslandRef = useRef<DynamicIslandHandle>(null);

  const screenContentVariants = {
    initial: { opacity: 0, filter: "blur(8px)" },
    animate: { opacity: 1, filter: "blur(0px)" },
  };

  const CONTENT_TRANSITION = {
    duration: 0.3,
    ease: "easeOut" as Easing,
    delay: 0.2,
  };

  return (
    <motion.div
      onHoverStart={() => dynamicIslandRef.current?.start()}
      onHoverEnd={() => dynamicIslandRef.current?.reset()}
    >
      <div className="relative mx-auto w-24">
        <div className="absolute top-10 -left-[2px] flex flex-col gap-1.5">
          <div className="h-2 w-[2px] rounded-l-sm bg-neutral-300 dark:bg-neutral-600" />
          <div className="h-4 w-[2px] rounded-l-sm bg-neutral-300 dark:bg-neutral-600" />
          <div className="h-4 w-[2px] rounded-l-sm bg-neutral-300 dark:bg-neutral-600" />
        </div>
        <div className="absolute top-14 -right-[2px]">
          <div className="h-6 w-[2px] rounded-r-sm bg-neutral-300 dark:bg-neutral-600" />
        </div>

        <div className="rounded-[1.25rem] bg-neutral-200 p-1 shadow-sm ring-1 shadow-black/5 ring-black/5 dark:bg-neutral-700 dark:shadow-white/5 dark:ring-white/10">
          <div className="relative h-40 w-full overflow-hidden rounded-[1rem] bg-white dark:bg-neutral-900">
            <motion.div
              variants={screenContentVariants}
              transition={CONTENT_TRANSITION}
              className="absolute inset-0"
            >
              <Image
                src="https://assets.aceternity.com/components/isometric-box.webp"
                alt="Screen"
                fill
                className="object-cover object-center"
              />
              <div className="absolute inset-x-0 top-0 z-10">
                <IPhoneDynamicIsland ref={dynamicIslandRef} />
              </div>
            </motion.div>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-1.5 mx-auto h-0.5 w-8 rounded-full bg-neutral-400 dark:bg-neutral-500" />
      </div>
    </motion.div>
  );
}

function IPadIllustration() {
  const dynamicIslandRef = useRef<DynamicIslandHandle>(null);

  const screenContentVariants = {
    initial: { opacity: 0, filter: "blur(8px)" },
    animate: { opacity: 1, filter: "blur(0px)" },
  };

  const CONTENT_TRANSITION = {
    duration: 0.3,
    ease: "easeOut" as Easing,
    delay: 0.2,
  };

  return (
    <motion.div
      onHoverStart={() => dynamicIslandRef.current?.start()}
      onHoverEnd={() => dynamicIslandRef.current?.reset()}
    >
      <div className="relative mx-auto w-44">
        <div className="absolute top-6 -right-[2px] flex flex-col gap-1.5">
          <div className="h-4 w-[2px] rounded-r-sm bg-neutral-300 dark:bg-neutral-600" />
          <div className="h-4 w-[2px] rounded-r-sm bg-neutral-300 dark:bg-neutral-600" />
        </div>
        <div className="absolute -top-[2px] right-8">
          <div className="h-[2px] w-5 rounded-t-sm bg-neutral-300 dark:bg-neutral-600" />
        </div>

        <div className="rounded-[1rem] bg-neutral-200 p-1 shadow-sm ring-1 shadow-black/5 ring-black/5 dark:bg-neutral-700 dark:shadow-white/5 dark:ring-white/10">
          <div className="relative h-28 w-full overflow-hidden rounded-[0.75rem] bg-white dark:bg-neutral-900">
            <motion.div
              variants={screenContentVariants}
              transition={CONTENT_TRANSITION}
              className="absolute inset-0"
            >
              <Image
                src="https://assets.aceternity.com/components/uptime-status-illustration.webp"
                alt="Screen"
                fill
                className="object-cover"
              />
              <div className="absolute inset-x-0 top-0 z-10">
                <IPadDynamicIsland ref={dynamicIslandRef} />
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function MacbookDynamicIsland({
  ref,
}: {
  ref: React.Ref<DynamicIslandHandle>;
}) {
  const [scope, animate] = useAnimate();
  const hasAnimatedRef = useRef(false);

  const reset = () => {
    hasAnimatedRef.current = false;
    animate(
      scope.current,
      { width: 28, height: 10, borderRadius: 5 },
      SPRING_OPTIONS,
    );
    animate("#mac-idle", { opacity: 1 }, { duration: 0.15 });
    animate("#mac-loading", { opacity: 0 }, { duration: 0.1 });
    animate("#mac-done", { opacity: 0 }, { duration: 0.1 });
  };

  const start = async () => {
    if (hasAnimatedRef.current) return;
    hasAnimatedRef.current = true;

    await animate("#mac-idle", { opacity: 0 }, { duration: 0.1 });
    animate(
      scope.current,
      { width: 16, height: 10, borderRadius: 5 },
      SPRING_OPTIONS,
    );
    await animate("#mac-loading", { opacity: 1 }, { duration: 0.15 });
    await new Promise((r) => setTimeout(r, 1000));
    await animate("#mac-loading", { opacity: 0 }, { duration: 0.1 });
    animate(
      scope.current,
      { width: 48, height: 10, borderRadius: 5 },
      SPRING_OPTIONS,
    );
    await animate("#mac-done", { opacity: 1 }, { duration: 0.15, delay: 0.1 });
  };

  useImperativeHandle(ref, () => ({ start, reset }));

  return (
    <div className="flex w-full items-start justify-center pt-1.5">
      <div
        ref={scope}
        className="relative overflow-hidden bg-black"
        style={{ width: 28, height: 10, borderRadius: 5 }}
      >
        <div
          id="mac-idle"
          className="absolute inset-0 flex items-center justify-center"
          style={{ opacity: 1 }}
        >
          <div className="flex items-center gap-0.5">
            <div className="h-1 w-1 rounded-full bg-neutral-700" />
            <div className="h-0.5 w-0.5 rounded-full bg-neutral-600" />
          </div>
        </div>
        <div
          id="mac-loading"
          className="absolute inset-0 flex items-center justify-center"
          style={{ opacity: 0 }}
        >
          <MiniLoadingDots />
        </div>
        <div
          id="mac-done"
          className="absolute inset-0 flex items-center justify-center"
          style={{ opacity: 0 }}
        >
          <span className="text-[3px] leading-none font-medium text-white">
            Airpods Connected
          </span>
          <div className="ml-0.5 flex h-1 w-2 items-center rounded-xs border border-green-500">
            <div className="h-full w-[85%] bg-green-500" />
          </div>
        </div>
      </div>
    </div>
  );
}

function IPhoneDynamicIsland({ ref }: { ref: React.Ref<DynamicIslandHandle> }) {
  const [scope, animate] = useAnimate();
  const hasAnimatedRef = useRef(false);

  const reset = () => {
    hasAnimatedRef.current = false;
    animate(
      scope.current,
      { width: 28, height: 10, borderRadius: 5 },
      SPRING_OPTIONS,
    );
    animate("#iphone-idle", { opacity: 1 }, { duration: 0.15 });
    animate("#iphone-loading", { opacity: 0 }, { duration: 0.1 });
    animate("#iphone-done", { opacity: 0 }, { duration: 0.1 });
  };

  const start = async () => {
    if (hasAnimatedRef.current) return;
    hasAnimatedRef.current = true;

    await animate("#iphone-idle", { opacity: 0 }, { duration: 0.1 });
    animate(
      scope.current,
      { width: 16, height: 10, borderRadius: 5 },
      SPRING_OPTIONS,
    );
    await animate("#iphone-loading", { opacity: 1 }, { duration: 0.15 });
    await new Promise((r) => setTimeout(r, 1000));
    await animate("#iphone-loading", { opacity: 0 }, { duration: 0.1 });
    animate(
      scope.current,
      { width: 40, height: 10, borderRadius: 5 },
      SPRING_OPTIONS,
    );
    await animate(
      "#iphone-done",
      { opacity: 1 },
      { duration: 0.15, delay: 0.1 },
    );
  };

  useImperativeHandle(ref, () => ({ start, reset }));

  return (
    <div className="flex w-full items-start justify-center pt-1.5">
      <div
        ref={scope}
        className="relative overflow-hidden bg-black"
        style={{ width: 28, height: 10, borderRadius: 5 }}
      >
        <div
          id="iphone-idle"
          className="absolute inset-0 flex items-center justify-center"
          style={{ opacity: 1 }}
        >
          <div className="flex items-center gap-0.5">
            <div className="h-1 w-1 rounded-full bg-neutral-700" />
            <div className="h-0.5 w-0.5 rounded-full bg-neutral-600" />
          </div>
        </div>
        <div
          id="iphone-loading"
          className="absolute inset-0 flex items-center justify-center"
          style={{ opacity: 0 }}
        >
          <MiniLoadingDots />
        </div>
        <div
          id="iphone-done"
          className="absolute inset-0 flex items-center justify-center"
          style={{ opacity: 0 }}
        >
          <span className="text-[3px] leading-none font-medium text-white">
            Connected
          </span>
        </div>
      </div>
    </div>
  );
}

function IPadDynamicIsland({ ref }: { ref: React.Ref<DynamicIslandHandle> }) {
  const [scope, animate] = useAnimate();
  const hasAnimatedRef = useRef(false);

  const reset = () => {
    hasAnimatedRef.current = false;
    animate(
      scope.current,
      { width: 32, height: 10, borderRadius: 5 },
      SPRING_OPTIONS,
    );
    animate("#ipad-idle", { opacity: 1 }, { duration: 0.15 });
    animate("#ipad-loading", { opacity: 0 }, { duration: 0.1 });
    animate("#ipad-done", { opacity: 0 }, { duration: 0.1 });
  };

  const start = async () => {
    if (hasAnimatedRef.current) return;
    hasAnimatedRef.current = true;

    await animate("#ipad-idle", { opacity: 0 }, { duration: 0.1 });
    animate(
      scope.current,
      { width: 18, height: 10, borderRadius: 5 },
      SPRING_OPTIONS,
    );
    await animate("#ipad-loading", { opacity: 1 }, { duration: 0.15 });
    await new Promise((r) => setTimeout(r, 1000));
    await animate("#ipad-loading", { opacity: 0 }, { duration: 0.1 });
    animate(
      scope.current,
      { width: 44, height: 10, borderRadius: 5 },
      SPRING_OPTIONS,
    );
    await animate("#ipad-done", { opacity: 1 }, { duration: 0.15, delay: 0.1 });
  };

  useImperativeHandle(ref, () => ({ start, reset }));

  return (
    <div className="flex w-full items-start justify-center pt-1.5">
      <div
        ref={scope}
        className="relative overflow-hidden bg-black"
        style={{ width: 32, height: 10, borderRadius: 5 }}
      >
        <div
          id="ipad-idle"
          className="absolute inset-0 flex items-center justify-center"
          style={{ opacity: 1 }}
        >
          <div className="flex items-center gap-0.5">
            <div className="h-1 w-1 rounded-full bg-neutral-700" />
            <div className="h-0.5 w-0.5 rounded-full bg-neutral-600" />
          </div>
        </div>
        <div
          id="ipad-loading"
          className="absolute inset-0 flex items-center justify-center"
          style={{ opacity: 0 }}
        >
          <MiniLoadingDots />
        </div>
        <div
          id="ipad-done"
          className="absolute inset-0 flex items-center justify-center"
          style={{ opacity: 0 }}
        >
          <span className="text-[3px] leading-none font-medium text-white">
            Connected
          </span>
        </div>
      </div>
    </div>
  );
}

function MiniLoadingDots() {
  return (
    <div className="flex items-center gap-px">
      <MiniLoadingDot delay={0} />
      <MiniLoadingDot delay={0.1} />
      <MiniLoadingDot delay={0.2} />
    </div>
  );
}

function MiniLoadingDot({ delay }: { delay: number }) {
  return (
    <motion.div
      className="h-0.5 w-0.5 rounded-full bg-white"
      animate={{ opacity: [0.3, 1, 0.3] }}
      transition={{
        duration: 0.6,
        repeat: Infinity,
        delay,
        ease: "easeInOut",
      }}
    />
  );
}

function DynamicIsland({
  idleText = "Idle",
  loadingText = "Processing...",
  processedText = "Complete",
}: {
  idleText?: string;
  loadingText?: string;
  processedText?: string;
}) {
  const [scope, animate] = useAnimate();
  const uniqueId = useId();
  const cancelledRef = useRef(false);

  const idleId = `di-idle-${uniqueId}`;
  const loadingId = `di-loading-${uniqueId}`;
  const processedId = `di-processed-${uniqueId}`;

  useEffect(() => {
    cancelledRef.current = false;

    const runLoop = async () => {
      while (!cancelledRef.current) {
        animate(
          scope.current,
          { width: 100, height: 32, borderRadius: 16 },
          SPRING_OPTIONS,
        );
        animate(`#${CSS.escape(idleId)}`, { opacity: 1 }, { duration: 0.15 });
        animate(`#${CSS.escape(loadingId)}`, { opacity: 0 }, { duration: 0.1 });
        animate(
          `#${CSS.escape(processedId)}`,
          { opacity: 0 },
          { duration: 0.1 },
        );

        await new Promise((r) => setTimeout(r, 1200));
        if (cancelledRef.current) break;

        await animate(
          `#${CSS.escape(idleId)}`,
          { opacity: 0 },
          { duration: 0.1 },
        );
        if (cancelledRef.current) break;

        animate(
          scope.current,
          { width: 140, height: 32, borderRadius: 16 },
          SPRING_OPTIONS,
        );
        await animate(
          `#${CSS.escape(loadingId)}`,
          { opacity: 1 },
          { duration: 0.15 },
        );
        if (cancelledRef.current) break;

        await new Promise((r) => setTimeout(r, 1500));
        if (cancelledRef.current) break;

        await animate(
          `#${CSS.escape(loadingId)}`,
          { opacity: 0 },
          { duration: 0.1 },
        );
        if (cancelledRef.current) break;

        animate(
          scope.current,
          { width: 160, height: 40, borderRadius: 20 },
          SPRING_OPTIONS,
        );
        await animate(
          `#${CSS.escape(processedId)}`,
          { opacity: 1 },
          { duration: 0.15, delay: 0.1 },
        );
        if (cancelledRef.current) break;

        await new Promise((r) => setTimeout(r, 1500));
        if (cancelledRef.current) break;

        await animate(
          `#${CSS.escape(processedId)}`,
          { opacity: 0 },
          { duration: 0.1 },
        );
      }
    };

    runLoop();
    return () => {
      cancelledRef.current = true;
    };
  }, [animate, scope, idleId, loadingId, processedId]);

  return (
    <div className="flex items-center justify-center py-4">
      <div
        ref={scope}
        className="relative overflow-hidden bg-black shadow-lg"
        style={{ width: 100, height: 32, borderRadius: 16 }}
      >
        <div
          id={idleId}
          className="absolute inset-0 flex items-center justify-center"
          style={{ opacity: 1 }}
        >
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-neutral-700" />
            <span className="text-xs font-medium text-neutral-400">
              {idleText}
            </span>
          </div>
        </div>

        <div
          id={loadingId}
          className="absolute inset-0 flex items-center justify-center"
          style={{ opacity: 0 }}
        >
          <div className="flex items-center gap-2">
            <LoadingDots />
            <span className="text-xs font-medium text-white">
              {loadingText}
            </span>
          </div>
        </div>

        <div
          id={processedId}
          className="absolute inset-0 flex items-center justify-center"
          style={{ opacity: 0 }}
        >
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500">
              <CheckIcon />
            </div>
            <span className="text-sm font-medium text-white">
              {processedText}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingDots() {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <LoadingDot key={i} delay={i * 0.15} />
      ))}
    </div>
  );
}

function LoadingDot({ delay }: { delay: number }) {
  return (
    <motion.div
      className="h-1.5 w-1.5 rounded-full bg-white"
      animate={{ opacity: [0.3, 1, 0.3] }}
      transition={{
        duration: 0.8,
        repeat: Infinity,
        delay,
        ease: "easeInOut",
      }}
    />
  );
}

function CheckIcon() {
  return (
    <svg
      className="h-3 w-3 text-white"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={3}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
