"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useMounted } from "@/lib/hooks/use-mounted";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import { DemoPointerProvider } from "./demo-context";
import { DemoCursor } from "./demo-cursor";
import s from "./demo.module.css";
import { BrowserChrome, PhoneChrome } from "./frames";
import { finalState, type DemoChapter } from "./types";
import { locateTarget, useDemoPlayer } from "./use-demo-player";

/**
 * Reduced motion, but only once hydrated: the server can't know the preference, so the first client render must
 * match the server's (the playing version) and only then switch to the posters.
 */
function useHydratedReducedMotion() {
  const reduce = useReducedMotion();
  const mounted = useMounted();
  return mounted && reduce;
}

/** True while at least a third of the element is on screen and the tab is visible. */
function useOnScreen(ref: React.RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), {
      threshold: 0.33,
    });
    io.observe(el);
    const onVisibility = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ref]);
  return visible && tabVisible;
}

/** True once the element has come within a screen or so of the viewport (and stays true). */
function useNear(ref: React.RefObject<HTMLElement | null>) {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setNear(true);
        io.disconnect();
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return near;
}

/**
 * With reduced motion the cursor never moves, so the phone camera (demo.module.css) aims at the chapter's result
 * instead: the last target its steps touch that the poster still shows.
 */
function usePosterFocus<S>(
  stage: React.RefObject<HTMLElement | null>,
  chapter: DemoChapter<S>,
  poster: S | null,
): { x: number; y: number } | null {
  const [focus, setFocus] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (poster === null) return;
    const targets = chapter.steps.flatMap((step) => ("target" in step ? [step.target] : [])).reverse();
    // After the poster's screens have rendered (they load as their own chunk).
    const id = window.setTimeout(() => {
      const at = targets.map((t) => locateTarget(stage.current, t)).find((p) => p !== null) ?? null;
      setFocus(at);
    }, 300);
    return () => window.clearTimeout(id);
  }, [stage, chapter, poster]);
  return poster === null ? null : focus;
}

/** What the frame adds around the app viewport. */
const FRAME_EXTRA = { browser: { w: 0, h: 44 }, phone: { w: 24, h: 24 } } as const;

/**
 * A self-playing replica of the app: a scaled browser window or phone, a cursor that clicks through the
 * chapters, and chapter pills to jump around. The replica is inert and hidden from assistive tech; the
 * chapter captions describe it instead. Reduced motion: no cursor or autoplay, each chapter shows its result.
 */
export function DemoStage<S>({
  chapters,
  width,
  height,
  frame = "browser",
  start,
  label,
  render,
  className,
}: {
  chapters: readonly [DemoChapter<S>, ...DemoChapter<S>[]];
  /** Design size of the app viewport (excluding browser chrome). */
  width: number;
  height: number;
  frame?: "browser" | "phone";
  start: { x: number; y: number };
  label: string;
  render: (state: S) => React.ReactNode;
  className?: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const reduce = useHydratedReducedMotion();
  // The replica is decorative and inert. It renders once the stage nears the viewport: after hydration, so nothing in
  // it (the assistant's character reads the motion preference) can disagree with the server's HTML, and only then
  // loads its chunk (the screens and their dependencies), not straight after the page.
  const near = useNear(outer);
  const [paused, setPaused] = useState(false);
  const fullWidth = width + FRAME_EXTRA[frame].w;
  const fullHeight = height + FRAME_EXTRA[frame].h;
  const compact = frame === "phone";
  const onScreen = useOnScreen(outer);
  const { chapter, chapterIndex, state, cursor, pointer, progress, goTo } = useDemoPlayer({
    chapters,
    stageRef: stage,
    active: onScreen && !paused && !reduce,
    start,
  });
  const posters = useMemo(() => chapters.map((c) => finalState(c)), [chapters]);
  const shown = reduce ? (posters[chapterIndex] ?? state) : state;
  const url = chapter.url(shown);
  const camera = usePosterFocus(stage, chapter, reduce && near ? shown : null) ?? cursor;

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <figure aria-label={label} className="w-full">
        <div
          ref={outer}
          className={cn("relative mx-auto w-full", s.fit, frame === "browser" && s.camera)}
          style={
            {
              maxWidth: fullWidth,
              "--ar": `${String(fullWidth)} / ${String(fullHeight)}`,
              "--dw": `${String(fullWidth)}px`,
              "--dh": `${String(fullHeight)}px`,
              // On phones a desktop window is zoomed in and follows the cursor (demo.module.css).
              "--cam-x": `${String(camera.x)}px`,
              "--cam-y": `${String(camera.y)}px`,
              "--cam-ms": `${String(reduce ? 0 : cursor.ms)}ms`,
            } as React.CSSProperties
          }
        >
          <div
            ref={stage}
            className={cn("absolute top-0 left-0 text-left", s.fitStage)}
            style={{ width: fullWidth, height: fullHeight }}
          >
            <div aria-hidden inert className="contents">
              {frame === "browser" ? (
                <BrowserChrome url={url} width={width} height={height}>
                  <DemoPointerProvider value={pointer}>{near && render(shown)}</DemoPointerProvider>
                </BrowserChrome>
              ) : (
                <PhoneChrome width={width} height={height}>
                  <DemoPointerProvider value={pointer}>{near && render(shown)}</DemoPointerProvider>
                </PhoneChrome>
              )}
            </div>
            {!reduce && <DemoCursor cursor={cursor} variant={frame === "phone" ? "touch" : "arrow"} />}
          </div>
        </div>
        {/* Not live: the demo plays on its own, and announcing every chapter would talk over the page. */}
        <figcaption className="sr-only">{chapter.caption}</figcaption>
      </figure>

      {/* Under the phone, a narrower column: tighter pills, so the chapters fit one row on a desktop. */}
      <div className={cn("mt-6 flex flex-wrap items-center justify-center", compact ? "gap-1" : "gap-2")}>
        {chapters.map((c, i) => {
          const current = i === chapterIndex;
          return (
            <button
              key={c.id}
              type="button"
              aria-current={current ? "step" : undefined}
              onClick={() => {
                // A paused player wouldn't run the chapter at all: picking one plays it.
                setPaused(false);
                goTo(i);
              }}
              className={cn(
                "focus-ring relative overflow-hidden rounded-full py-1.5 font-medium transition-colors pointer-coarse:min-h-11 pointer-coarse:px-4",
                compact ? "px-2.5 text-[0.8125rem]" : "px-3.5 text-sm",
                current
                  ? "bg-surface text-foreground shadow-xs ring-1 ring-border"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {current && !reduce && (
                <span
                  aria-hidden
                  className="absolute inset-x-3 bottom-1 h-0.5 origin-left rounded-full bg-brand transition-transform duration-700 ease-out"
                  style={{ transform: `scaleX(${String(progress)})` }}
                />
              )}
              {c.label}
            </button>
          );
        })}
        {!reduce && (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Play the demo" : "Pause the demo"}
            className="focus-ring ml-1 flex size-8 items-center justify-center rounded-full text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent hover:text-foreground pointer-coarse:size-11"
          >
            {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}
