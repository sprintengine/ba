"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CursorState, DemoChapter, DemoPointer, DemoStep } from "./types";

const IDLE_POINTER: DemoPointer = { hover: null, pressed: null, focus: null };

/**
 * Centre of a `data-demo` target in stage coordinates (unscaled), or null if it isn't rendered. A hidden match (no
 * box) would measure at the viewport's corner and fling the cursor off the stage, so only displayed ones count.
 */
export function locateTarget(stage: HTMLElement | null, target: string): { x: number; y: number } | null {
  const el = [...(stage?.querySelectorAll<HTMLElement>(`[data-demo="${target}"]`) ?? [])].find(
    (e) => e.getClientRects().length > 0,
  );
  if (!stage || !el) return null;
  const sr = stage.getBoundingClientRect();
  // The stage's scale: its drawn width over its layout width (NaN in a test DOM that doesn't lay out).
  const k = sr.width / stage.offsetWidth || 1;
  const r = el.getBoundingClientRect();
  const ax = Number(el.dataset.demoX ?? 0.5);
  const ay = Number(el.dataset.demoY ?? 0.5);
  return { x: (r.left - sr.left + r.width * ax) / k, y: (r.top - sr.top + r.height * ay) / k };
}

/** Cursor travel time: quick for short hops, never a teleport, never a crawl. */
function travelMs(dx: number, dy: number) {
  return Math.round(Math.min(1050, Math.max(380, Math.hypot(dx, dy) * 0.85)));
}

/** Small human jitter for typing and pauses. */
function jitter(ms: number) {
  return ms * (0.75 + Math.random() * 0.5);
}

/**
 * Plays chapters in a loop while `active`. Returns the replica's state, the cursor and pointer, and controls.
 * Leaving and re-entering a chapter restarts it from its initial state (simple and always consistent).
 */
export function useDemoPlayer<S>({
  chapters,
  stageRef,
  active,
  start,
}: {
  chapters: readonly [DemoChapter<S>, ...DemoChapter<S>[]];
  /** The replica at its design size, scaled (by CSS) to fit. */
  stageRef: React.RefObject<HTMLElement | null>;
  active: boolean;
  /** Where the cursor rests before the first move (stage coordinates). */
  start: { x: number; y: number };
}) {
  const [chapterIndex, setChapterIndex] = useState(0);
  const [run, setRun] = useState(0);
  const chapter = chapters[chapterIndex] ?? chapters[0];
  const [state, setState] = useState<S>(chapter.initial);
  const [cursor, setCursor] = useState<CursorState>({ ...start, ms: 0, pressed: false, visible: true });
  const [pointer, setPointer] = useState<DemoPointer>(IDLE_POINTER);
  const [progress, setProgress] = useState(0);
  // Read by the running script without restarting it.
  const posRef = useRef(start);

  const goTo = useCallback((index: number) => {
    setChapterIndex(index);
    setRun((r) => r + 1);
  }, []);

  useEffect(() => {
    const current = chapters[chapterIndex];
    if (!current || !active) return;

    const life = { cancelled: false };
    const stopped = () => life.cancelled;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          timers.delete(t);
          resolve();
        }, ms);
        timers.add(t);
      });
    let s = current.initial;
    const update = (next: S) => {
      s = next;
      setState(next);
    };

    const locate = (target: string) => locateTarget(stageRef.current, target);

    const moveTo = async (target: string, ms?: number) => {
      // The target may be animating in (a sheet sliding open): give it a moment to appear.
      let at = locate(target);
      for (let i = 0; !at && i < 20 && !stopped(); i++) {
        await sleep(50);
        at = locate(target);
      }
      if (!at || stopped()) return;
      const from = posRef.current;
      const duration = ms ?? travelMs(at.x - from.x, at.y - from.y);
      posRef.current = at;
      setCursor({ x: at.x, y: at.y, ms: duration, pressed: false, visible: true });
      await sleep(duration);
      setPointer((p) => ({ ...p, hover: target }));
    };

    const runStep = async (step: DemoStep<S>) => {
      switch (step.kind) {
        case "move":
          await moveTo(step.target, step.ms);
          await sleep(jitter(260));
          return;
        case "click":
          await moveTo(step.target);
          await sleep(jitter(140));
          setCursor((c) => ({ ...c, pressed: true, ms: 0 }));
          setPointer((p) => ({ ...p, pressed: step.target }));
          await sleep(110);
          if (step.apply) update(step.apply(s));
          setCursor((c) => ({ ...c, pressed: false }));
          setPointer((p) => ({ ...p, pressed: null, focus: step.target }));
          await sleep(jitter(380));
          return;
        case "type": {
          await moveTo(step.target);
          setPointer((p) => ({ ...p, focus: step.target }));
          await sleep(jitter(220));
          const perChar = 1000 / (step.cps ?? 14);
          for (let i = 1; i <= step.text.length && !stopped(); i++) {
            update(step.apply(s, step.text.slice(0, i)));
            await sleep(jitter(perChar));
          }
          await sleep(jitter(320));
          return;
        }
        case "set":
          update(step.apply(s));
          return;
        case "wait":
          await sleep(step.ms);
          return;
      }
    };

    void (async () => {
      // Every (re)start begins from the chapter's opening state.
      await sleep(0);
      update(current.initial);
      setPointer(IDLE_POINTER);
      setProgress(0);
      await sleep(500);
      for (let i = 0; i < current.steps.length; i++) {
        if (stopped()) return;
        setProgress(i / current.steps.length);
        const step = current.steps[i];
        if (step) await runStep(step);
      }
      if (stopped()) return;
      setProgress(1);
      setPointer(IDLE_POINTER);
      await sleep(1400);
      if (!stopped()) setChapterIndex((c) => (c + 1) % chapters.length);
    })();

    return () => {
      life.cancelled = true;
      timers.forEach(clearTimeout);
    };
    // `run` restarts the chapter when a pill is clicked, even the current one.
  }, [chapterIndex, run, active, chapters, stageRef]);

  return { chapter, chapterIndex, state, cursor, pointer, progress, goTo };
}
