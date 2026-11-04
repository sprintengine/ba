import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { must } from "@/test/must";
import { PrismStory } from "../prism-story";
import { LIVE_GLASS_TIMEOUT_MS } from "../use-prism-stage";
import type { PrismScene } from "../scene";

const env = vi.hoisted((): { mode: "poster" | "live"; reduce: boolean; webgl: boolean; probes: number } => ({
  mode: "poster",
  reduce: false,
  webgl: true,
  probes: 0,
}));
vi.mock("../fallback", () => ({
  decidePrismMode: () => env.mode,
  hasHardwareWebGL: () => {
    env.probes++;
    return env.webgl;
  },
}));

const sceneApi = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../scene", () => ({ loadPrismScene: sceneApi.load }));

/** A scene that records what the stage asks of it. */
function fakeScene(): { [K in keyof PrismScene]: Mock<PrismScene[K]> } {
  return {
    resize: vi.fn<PrismScene["resize"]>(),
    setTheme: vi.fn<PrismScene["setTheme"]>(),
    render: vi.fn<PrismScene["render"]>(),
    perspective: vi.fn<PrismScene["perspective"]>(() => 1200),
    dispose: vi.fn<PrismScene["dispose"]>(),
  };
}

// Animation frames run when the test says so.
let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
function runFrame(now = performance.now()) {
  const due = [...frames.values()];
  frames = new Map();
  act(() => due.forEach((cb) => cb(now)));
}

let observer: { cb: IntersectionObserverCallback; observed: Element[]; disconnected: boolean };
function intersect(target: Element, isIntersecting: boolean) {
  act(() =>
    observer.cb(
      [{ target, isIntersecting } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  );
}

let idle: (() => void) | undefined;
/** Where the hero copy starts (jsdom doesn't lay out). */
let heroTop = 600;

beforeEach(() => {
  env.mode = "poster";
  env.reduce = false;
  env.webgl = true;
  env.probes = 0;
  heroTop = 600;
  window.innerWidth = 1024;
  window.innerHeight = 768;
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(() => heroTop);
  sceneApi.load.mockReset();
  frames = new Map();
  idle = undefined;
  document.documentElement.className = "";
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.set(nextFrame, cb);
    return nextFrame++;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IntersectionObserverCallback) {
        observer = { cb, observed: [], disconnected: false };
      }
      observe(el: Element) {
        observer.observed.push(el);
      }
      disconnect() {
        observer.disconnected = true;
      }
    },
  );
  vi.stubGlobal("requestIdleCallback", (fn: () => void) => ((idle = fn), 9));
  vi.stubGlobal("cancelIdleCallback", vi.fn());
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: (query.includes("reduced-motion") && env.reduce) || query.includes("pointer: fine"),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderStory() {
  const view = render(
    <PrismStory
      faces={
        <>
          <div data-face="0">Hero face</div>
          <div data-face="7">Closing face</div>
        </>
      }
    >
      <p>Sections</p>
    </PrismStory>,
  );
  const root = must(view.container.querySelector<HTMLElement>("[data-prism]"), "root");
  const q = (sel: string) => must(view.container.querySelector<HTMLElement>(sel), sel);
  return {
    ...view,
    root,
    canvas: q("canvas") as HTMLCanvasElement,
    stage: q("section"),
    cta: must(view.container.querySelectorAll("section")[1], "closing section"),
    face: (i: number) => q(`[data-face="${i}"]`),
  };
}

/** Lets the scene's dynamic import and its promise chain settle. */
const settle = () => act(() => new Promise((r) => setTimeout(r, 0)));

describe("usePrismStage: poster", () => {
  it("never loads WebGL and shows the hero face straight away as a pane of CSS glass", () => {
    const { root, face } = renderStory();
    expect(root.dataset.prism).toBe("poster");
    runFrame();
    expect(idle).toBeUndefined();
    expect(env.probes).toBe(0); // the cheap checks said no: no WebGL context is ever created
    expect(sceneApi.load).not.toHaveBeenCalled();
    expect(face(0).style.visibility).toBe("visible");
    expect(face(0).style.opacity).toBe("1");
    expect(face(0).style.transform).toMatch(/^translate3d\(/);
    expect(face(7).style.opacity).toBe("0");
  });

  it("shows the hero face as a glass card in dark mode", async () => {
    const { face } = renderStory();
    await act(async () => {
      document.documentElement.classList.add("dark");
      await Promise.resolve();
    });
    runFrame();
    expect(face(0).style.visibility).toBe("visible");
    expect(face(0).style.transform).toMatch(/^translate3d\(/);
  });

  it("holds still: paints when a scroll, a resize or the theme moves it, never in a loop", async () => {
    renderStory();
    expect(frames.size).toBe(1);
    runFrame();
    expect(frames.size).toBe(0);

    act(() => {
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("scroll"));
    });
    expect(frames.size).toBe(1); // one frame for any number of scroll events before it
    runFrame();
    expect(frames.size).toBe(0);

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(frames.size).toBe(1);
    runFrame();

    await act(async () => {
      document.documentElement.classList.add("dark");
      await Promise.resolve();
    });
    expect(frames.size).toBe(1);
    runFrame();
    expect(frames.size).toBe(0);
  });

  it("turns the closing face into the light once the hero has scrolled away", () => {
    const { stage, cta, face } = renderStory();
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({ top: -900, bottom: -10 } as DOMRect);
    vi.spyOn(cta, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: 800 } as DOMRect);
    window.innerHeight = 800;
    window.dispatchEvent(new Event("resize"));
    runFrame();
    expect(Number(face(7).style.opacity)).toBeGreaterThan(0.5);
    expect(face(7).style.visibility).toBe("visible");
  });
});

describe("usePrismStage: live", () => {
  it("loads the scene only once the page has painted and gone idle, then drives it", async () => {
    env.mode = "live";
    const scene = fakeScene();
    sceneApi.load.mockResolvedValue(scene);
    const { root, canvas } = renderStory();
    expect(root.dataset.prism).toBe("live");
    expect(env.probes).toBe(0); // no WebGL probe while hydrating
    expect(sceneApi.load).not.toHaveBeenCalled();

    act(() => must(idle, "idle callback")());
    expect(env.probes).toBe(1);
    await settle();
    expect(sceneApi.load).toHaveBeenCalledWith(canvas, expect.objectContaining({ dark: false }));
    expect(root.dataset.gl).toBe("on");
    expect(scene.resize).toHaveBeenCalled();

    runFrame(performance.now() + 500);
    expect(scene.render).toHaveBeenCalledWith(expect.objectContaining({ sweep: expect.any(Number) }));
    expect(frames.size).toBe(1); // the live glass keeps drawing
    act(() => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 10, clientY: 10 }));
    });
    runFrame(performance.now() + 3000);
    expect(scene.render).toHaveBeenCalledTimes(2);

    await act(async () => {
      document.documentElement.classList.add("dark");
      await Promise.resolve();
    });
    expect(scene.setTheme).toHaveBeenCalledWith(expect.objectContaining({ dark: true }));
  });

  it("holds the hero face back while the live glass loads, so it appears once, on the slab", async () => {
    env.mode = "live";
    sceneApi.load.mockResolvedValue(fakeScene());
    const { root, face } = renderStory();
    runFrame();
    expect(face(0).style.visibility).toBe("hidden");
    act(() => must(idle, "idle callback")());
    await settle();
    expect(root.dataset.gl).toBe("on");
    runFrame(performance.now() + 5000); // after the entrance
    expect(face(0).style.opacity).toBe("1");
  });

  it("shows the CSS glass instead, without loading the scene, when the probe finds no hardware WebGL", async () => {
    env.mode = "live";
    env.webgl = false;
    const { root, face } = renderStory();
    act(() => must(idle, "idle callback")());
    await settle();
    expect(root.dataset.prism).toBe("poster");
    expect(sceneApi.load).not.toHaveBeenCalled();
    runFrame();
    expect(face(0).style.visibility).toBe("visible");
  });

  it("settles for the CSS glass when the live glass is slow, and throws the late scene away", async () => {
    env.mode = "live";
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let resolve: (s: PrismScene) => void = () => {};
    sceneApi.load.mockReturnValue(new Promise<PrismScene>((r) => (resolve = r)));
    const { root, face } = renderStory();
    act(() => must(idle, "idle callback")());
    act(() => {
      vi.advanceTimersByTime(LIVE_GLASS_TIMEOUT_MS);
    });
    vi.useRealTimers();
    expect(root.dataset.prism).toBe("poster");
    runFrame();
    expect(face(0).style.visibility).toBe("visible");

    const late = fakeScene();
    await act(async () => resolve(late));
    await settle();
    expect(late.dispose).toHaveBeenCalledOnce();
    expect(root.dataset.gl).toBeUndefined();
  });

  it("holds still for reduced motion", async () => {
    env.mode = "live";
    env.reduce = true;
    const scene = fakeScene();
    sceneApi.load.mockResolvedValue(scene);
    renderStory();
    act(() => must(idle, "idle callback")());
    await settle();
    runFrame(1000);
    runFrame(5000);
    const [first, second] = scene.render.mock.calls.map((c) => c[0]);
    expect(first?.time).toBe(0);
    expect(second?.ry).toBe(first?.ry);
  });

  it("waits for the load event when the page is still loading, and uses a timer without requestIdleCallback", async () => {
    env.mode = "live";
    vi.stubGlobal("requestIdleCallback", undefined);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const readyState = vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    sceneApi.load.mockResolvedValue(fakeScene());
    renderStory();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(sceneApi.load).not.toHaveBeenCalled();
    readyState.mockReturnValue("complete");
    act(() => {
      window.dispatchEvent(new Event("load"));
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    vi.useRealTimers();
    await settle();
    expect(sceneApi.load).toHaveBeenCalledOnce();
  });

  it("falls back to the poster when the scene fails to load or the GPU drops the context", async () => {
    env.mode = "live";
    sceneApi.load.mockRejectedValueOnce(new Error("no context"));
    const first = renderStory();
    act(() => must(idle, "idle callback")());
    await settle();
    expect(first.root.dataset.prism).toBe("poster");
    first.unmount();

    const scene = fakeScene();
    sceneApi.load.mockResolvedValue(scene);
    const second = renderStory();
    act(() => must(idle, "idle callback")());
    await settle();
    const lost = new Event("webglcontextlost", { cancelable: true });
    act(() => {
      second.canvas.dispatchEvent(lost);
    });
    expect(lost.defaultPrevented).toBe(true);
    expect(scene.dispose).toHaveBeenCalled();
    expect(second.root.dataset.prism).toBe("poster");
    expect(second.root.dataset.gl).toBeUndefined();
  });

  it("drops the live slab's pose when the context is lost, so the poster's faces land on screen", async () => {
    env.mode = "live";
    sceneApi.load.mockResolvedValue(fakeScene());
    const { canvas, face } = renderStory();
    act(() => must(idle, "idle callback")());
    await settle();
    runFrame();
    const slab = must(face(0).parentElement, "slab face");
    const overlay = must(slab.parentElement, "overlay");
    const sheen = must(slab.firstElementChild as HTMLElement | null, "sheen");
    expect(slab.style.transform).toMatch(/rotateX/);
    expect(overlay.style.perspective).toBe("1200px");
    expect(sheen.style.getPropertyValue("--sx")).not.toBe("");

    act(() => {
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    });
    expect(slab.style.cssText).toBe("");
    expect(overlay.style.perspective).toBe("");
    expect(sheen.style.getPropertyValue("--sx")).toBe("");
  });

  it("disposes the scene once, though disposing it loses the context again", async () => {
    env.mode = "live";
    const scene = fakeScene();
    sceneApi.load.mockResolvedValue(scene);
    const { canvas, root } = renderStory();
    act(() => must(idle, "idle callback")());
    await settle();
    scene.dispose.mockImplementation(() => {
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    });
    act(() => {
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    });
    expect(scene.dispose).toHaveBeenCalledOnce();
    expect(root.dataset.prism).toBe("poster");
  });

  it("throws away a scene that finishes compiling after the page has moved on", async () => {
    env.mode = "live";
    let resolve: (s: PrismScene) => void = () => {};
    sceneApi.load.mockReturnValue(new Promise<PrismScene>((r) => (resolve = r)));
    const { unmount } = renderStory();
    act(() => must(idle, "idle callback")());
    await settle();
    unmount();
    const scene = fakeScene();
    await act(async () => resolve(scene));
    await settle();
    expect(scene.dispose).toHaveBeenCalledOnce();
  });
});

describe("usePrismStage: pausing and cleanup", () => {
  it("stops animating while the hero and closing section are off screen or the tab is hidden", () => {
    const { stage, cta, canvas } = renderStory();
    expect(frames.size).toBe(1);
    intersect(stage, false);
    expect(frames.size).toBe(0);
    expect(canvas.style.visibility).toBe("hidden");
    intersect(cta, true);
    expect(frames.size).toBe(1);
    expect(canvas.style.visibility).toBe("visible");

    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(frames.size).toBe(0);
    visibility.mockReturnValue("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(frames.size).toBe(1);
  });

  it("cleans up on unmount: frames, observers, the pending start and the scene", async () => {
    env.mode = "live";
    const scene = fakeScene();
    sceneApi.load.mockResolvedValue(scene);
    const live = renderStory();
    act(() => must(idle, "idle callback")());
    await settle();
    live.unmount();
    expect(frames.size).toBe(0);
    expect(observer.disconnected).toBe(true);
    expect(scene.dispose).toHaveBeenCalledOnce();

    const pending = renderStory();
    pending.unmount();
    expect(cancelIdleCallback).toHaveBeenCalledWith(9);
  });
});
