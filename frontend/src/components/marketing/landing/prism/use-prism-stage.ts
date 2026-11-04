"use client";

import { useEffect } from "react";
import {
  clamp,
  ctaProgress,
  ease,
  faceLayout,
  FACE_COUNT,
  heroAngles,
  isPhone,
  lerp,
  smoothstep,
  type Rect,
  type SlabLayout,
  type Viewport,
} from "./choreography";
import { decidePrismMode, hasHardwareWebGL } from "./fallback";
import type { PrismScene, StudioTheme } from "./scene";

export type StageRefs = {
  root: React.RefObject<HTMLDivElement | null>;
  stage: React.RefObject<HTMLElement | null>;
  hero: React.RefObject<HTMLDivElement | null>;
  canvas: React.RefObject<HTMLCanvasElement | null>;
  overlay: React.RefObject<HTMLDivElement | null>;
  face: React.RefObject<HTMLDivElement | null>;
  sheen: React.RefObject<HTMLDivElement | null>;
  cta: React.RefObject<HTMLElement | null>;
  ctaAnchor: React.RefObject<HTMLDivElement | null>;
};

type Els = { [K in keyof StageRefs]: NonNullable<StageRefs[K]["current"]> };

/** The pose of the slab and what shows on it, for one frame. */
type Pose = {
  L: SlabLayout;
  rx: number;
  ry: number;
  op: number[];
  sweep: number;
  stageOn: boolean;
};

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { x0: r.left, x1: r.right, y0: r.top, y1: r.bottom };
};

function readTheme(): StudioTheme {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    top: v("--prism-studio-top") || "#f3f4f7",
    bottom: v("--prism-studio-bottom") || "#e1e4ea",
    attenuation: v("--prism-attenuation") || "#d9e1ee",
    ribbon: Number.parseFloat(v("--prism-ribbon-strength")) || 1,
    dark: document.documentElement.classList.contains("dark"),
  };
}

/**
 * How long a capable device waits for the live glass before settling for the CSS glass. The hero face stays hidden
 * until one of them shows, so it appears once; a scene that turns up later is thrown away rather than swapped in.
 */
export const LIVE_GLASS_TIMEOUT_MS = 2500;

/** Run `fn` once the page has painted and gone quiet (after load, then idle). */
function afterFirstPaint(fn: () => void): () => void {
  // Safari has no requestIdleCallback.
  const idleApi = window as Partial<Pick<Window, "requestIdleCallback" | "cancelIdleCallback">>;
  let cancelled = false;
  let idle = 0;
  let timer = 0;
  const go = () => {
    if (!cancelled) fn();
  };
  const run = () => {
    if (idleApi.requestIdleCallback) idle = idleApi.requestIdleCallback(go, { timeout: 1500 });
    else timer = window.setTimeout(go, 200);
  };
  if (document.readyState === "complete") run();
  else window.addEventListener("load", run, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener("load", run);
    if (idle) idleApi.cancelIdleCallback?.(idle);
    window.clearTimeout(timer);
  };
}

function resolveEls(refs: StageRefs): Els | null {
  const out: Partial<Els> = {};
  for (const [k, r] of Object.entries(refs) as [keyof StageRefs, StageRefs[keyof StageRefs]][]) {
    if (!r.current) return null;
    (out as Record<string, Element>)[k] = r.current;
  }
  return out as Els;
}

/**
 * Drives the slab: it poses the glass (WebGL when allowed, else CSS glass) in the hero, riding up with
 * the hero as the page scrolls, or under the closing call to action as that arrives. The live glass moves on its
 * own, so it is drawn every animation frame; the poster holds still and is painted only when something moves it
 * (a scroll, a resize, the theme, a section coming into view). Pauses when the hero and the closing section are
 * both off screen or the tab is hidden. Transform and opacity only.
 */
export function usePrismStage(refs: StageRefs) {
  useEffect(() => {
    const els = resolveEls(refs);
    if (!els) return;
    const html = document.documentElement;
    const live = decidePrismMode() === "live";
    els.root.dataset.prism = live ? "live" : "poster";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const faces = [...els.overlay.querySelectorAll<HTMLElement>("[data-face]")].map((el) => ({
      el,
      i: Number(el.dataset.face),
    }));

    let scene: PrismScene | null = null;
    let vp: Viewport = { vw: 1, vh: 1, heroTop: 0 };
    let stageH = 1;
    // A capable device waits for the live glass (or for giving up on it) before showing the hero face at all.
    let waiting = live;
    let mx = 0;
    let my = 0;
    let smx = 0;
    let smy = 0;
    const t0 = performance.now();
    let tIntro = 0;
    let lastNow = t0;
    let raf = 0;
    let stageVisible = true;
    let ctaVisible = false;

    function measure() {
      vp = { vw: window.innerWidth, vh: window.innerHeight, heroTop: els!.hero.offsetTop };
      stageH = els!.stage.offsetHeight;
      if (scene) {
        scene.resize(vp.vw, vp.vh);
        els!.overlay.style.perspective = `${scene.perspective()}px`;
      }
    }

    const closingLayout = () => faceLayout(7, vp, rectOf(els.ctaAnchor));

    /**
     * The hero: the slab laid out in the hero section (which may be shorter than the viewport while a phone's URL
     * bar is hidden) and carried up with it as the page scrolls.
     */
    function heroPose(time: number, sr: DOMRect): Pose {
      const L = faceLayout(0, { ...vp, vh: stageH });
      L.cy += sr.top + stageH / 2 - vp.vh / 2;
      const { rx, ry } = heroAngles(isPhone(vp.vw));
      const op = new Array<number>(FACE_COUNT).fill(0);
      op[0] = 1;
      const idle = reduce ? 0 : Math.sin(time * 0.5) * 3;
      return { L, rx, ry: ry + idle, op, sweep: -2, stageOn: true };
    }

    /** Closing section: the slab turns into the light under the headline. */
    function ctaPose(time: number, cr: DOMRect): Pose {
      const prog = ctaProgress(cr.top, vp.vh);
      const turn = 1 - ease(clamp(prog * 1.25));
      const op = new Array<number>(FACE_COUNT).fill(0);
      op[7] = smoothstep(0.25, 0.6, prog);
      return {
        L: closingLayout(),
        ry: -34 * turn + (reduce ? 0 : Math.sin(time * 0.5) * 2),
        rx: 6 * turn + 3,
        op,
        sweep: lerp(-0.7, 0.75, clamp((prog - 0.2) / 0.6)),
        stageOn: false,
      };
    }

    /**
     * No WebGL (or not yet): the hero face, then the closing face, as panes of CSS glass. While the live glass may
     * still arrive, the hero face waits hidden.
     */
    function paintPoster(p: Pose) {
      faces.forEach(({ el, i }) => {
        const o = i === 0 && waiting ? 0 : (p.op[i] ?? 0);
        el.style.opacity = String(o);
        el.style.visibility = o > 0.002 ? "visible" : "hidden";
        // Only the pose's own face shows (the hero's or the closing one), so its layout is the pose's.
        if (o > 0.002) el.style.transform = `translate3d(${p.L.cx}px, ${p.L.cy}px, 0) scale(${p.L.k})`;
      });
    }

    /** Live: the faces ride the front of the 3D slab, lined up through the same perspective as the camera. */
    function paintLive(p: Pose, time: number) {
      const { L } = p;
      const T = (isPhone(vp.vw) ? 44 : 64) * L.k;
      const face = els!.face;
      face.style.width = `${L.w}px`;
      face.style.height = `${L.h}px`;
      face.style.borderRadius = `${L.r}px`;
      face.style.transform = `translate3d(${vp.vw / 2 + L.cx - L.w / 2}px, ${vp.vh / 2 + L.cy - L.h / 2}px, 0) rotateX(${-p.rx}deg) rotateY(${p.ry}deg) translateZ(${T / 2 + 0.6}px) scale(${L.k})`;
      faces.forEach(({ el, i }) => {
        const o = p.op[i] ?? 0;
        el.style.opacity = String(o);
        el.style.visibility = o > 0.002 ? "visible" : "hidden";
        el.style.transform = `scale(${0.97 + 0.03 * o})`;
      });
      els!.sheen.style.setProperty("--sx", `${(p.ry + 20) * 9 - 60}%`);
      scene?.render({
        cx: L.cx,
        cy: L.cy,
        w: L.w * L.k,
        h: L.h * L.k,
        r: L.r * L.k,
        depth: T,
        rx: p.rx,
        ry: p.ry,
        time,
        sweep: p.sweep,
      });
    }

    function frame(now: number) {
      // The live glass moves on its own, so it keeps drawing; the poster waits for whatever moves it next.
      raf = scene ? requestAnimationFrame(frame) : 0;
      const time = reduce || !scene ? 0 : (now - t0) / 1000;
      const sr = els!.stage.getBoundingClientRect();
      const dt = Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;
      smx = lerp(smx, mx, 1 - Math.exp(-dt * 3.5));
      smy = lerp(smy, my, 1 - Math.exp(-dt * 3.5));

      const cr = els!.cta.getBoundingClientRect();
      const stageOn = sr.bottom > 0;
      const ctaOn = cr.top < vp.vh && cr.bottom > 0;
      const p = ctaOn && !stageOn ? ctaPose(time, cr) : heroPose(time, sr);

      // Entrance: the slab turns into the light once, when the live glass first appears.
      const intro = reduce || !tIntro ? 1 : clamp((now - tIntro - 150) / 2000);
      if (intro < 1 && p.stageOn) {
        const ie = 1 - Math.pow(1 - intro, 3);
        p.ry += -30 * (1 - ie);
        p.rx += 14 * (1 - ie);
        p.L.cy += 46 * (1 - ie);
        p.op[0] = (p.op[0] ?? 0) * smoothstep(0.3, 0.85, intro);
        p.sweep = lerp(-0.7, 1.3, ease(clamp(intro / 0.95)));
      }
      if (finePointer) {
        p.ry += smx * 9;
        p.rx += smy * 6;
      }
      if (!reduce) p.L.cy += Math.sin(time * 0.8) * 3;

      if (scene) paintLive(p, time);
      else paintPoster(p);
    }

    function setVisible(on: boolean) {
      const v = on ? "visible" : "hidden";
      els!.overlay.style.visibility = v;
      els!.canvas.style.visibility = v;
    }
    const showing = () => (stageVisible || ctaVisible) && document.visibilityState === "visible";
    /** Ask for a frame (one at a time), if the slab is on screen. */
    function requestPaint() {
      if (raf || !showing()) return;
      lastNow = performance.now();
      raf = requestAnimationFrame(frame);
    }
    function sync() {
      setVisible(stageVisible || ctaVisible);
      if (showing()) requestPaint();
      else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }
    const onResize = () => {
      measure();
      requestPaint();
    };

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === els.stage) stageVisible = e.isIntersecting;
        if (e.target === els.cta) ctaVisible = e.isIntersecting;
      }
      sync();
    });
    io.observe(els.stage);
    io.observe(els.cta);

    const onPointer = (e: PointerEvent) => {
      mx = (e.clientX / vp.vw) * 2 - 1;
      my = (e.clientY / vp.vh) * 2 - 1;
    };
    const theme = new MutationObserver(() => {
      scene?.setTheme(readTheme());
      requestPaint();
    });
    theme.observe(html, { attributes: true, attributeFilter: ["class"] });

    const enterPoster = () => {
      // Let go first: disposing loses the context, which may come straight back here as webglcontextlost.
      const lost = scene;
      scene = null;
      lost?.dispose();
      waiting = false;
      els.root.dataset.prism = "poster";
      delete els.root.dataset.gl;
      // The poster positions the faces itself, from a zero-size slab at the centre: undo the live slab's pose.
      els.face.style.cssText = "";
      els.overlay.style.perspective = "";
      els.sheen.style.removeProperty("--sx");
      requestPaint();
    };
    const onContextLost = (e: Event) => {
      e.preventDefault();
      enterPoster();
    };
    els.canvas.addEventListener("webglcontextlost", onContextLost);

    // Set on cleanup: the scene may finish compiling after the page has moved on, and then it's thrown away.
    let stopped = false;
    let cancelStart = () => {};
    if (live) {
      /** Stops trying for the live glass: a scene still on its way is thrown away when it arrives. */
      const stop = () => {
        stopped = true;
        cancelIdle();
        window.clearTimeout(giveUp);
      };
      const settleForCss = () => {
        stop();
        enterPoster();
      };
      const cancelIdle = afterFirstPaint(() => {
        if (!hasHardwareWebGL()) {
          settleForCss();
          return;
        }
        import("./scene")
          .then(({ loadPrismScene }) => loadPrismScene(els.canvas, readTheme()))
          .then((loaded) => {
            if (stopped || !els.canvas.isConnected) return loaded.dispose();
            window.clearTimeout(giveUp);
            waiting = false;
            scene = loaded;
            measure();
            tIntro = performance.now();
            els.root.dataset.gl = "on";
            requestPaint();
          })
          .catch(settleForCss);
      });
      const giveUp = window.setTimeout(settleForCss, LIVE_GLASS_TIMEOUT_MS);
      cancelStart = stop;
    }

    measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", requestPaint, { passive: true });
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("visibilitychange", sync);
    sync();

    return () => {
      cancelStart();
      cancelAnimationFrame(raf);
      io.disconnect();
      theme.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", requestPaint);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", sync);
      els.canvas.removeEventListener("webglcontextlost", onContextLost);
      scene?.dispose();
      scene = null;
      delete els.root.dataset.gl;
    };
  }, [refs]);
}
