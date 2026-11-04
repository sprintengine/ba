import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decidePrismMode,
  hasHardwareWebGL,
  isHardwareContext,
  posterReason,
  readDeviceEnv,
  type DeviceEnv,
} from "../fallback";

const desktop: DeviceEnv = {
  reducedMotion: false,
  saveData: false,
  coarsePointer: false,
  mobileUa: false,
  deviceMemory: 8,
  cores: 8,
  webgl: true,
};

describe("posterReason", () => {
  it("gives a capable desktop the live glass", () => {
    expect(posterReason(desktop)).toBeNull();
  });

  it("respects reduced motion before anything else", () => {
    expect(posterReason({ ...desktop, reducedMotion: true, webgl: false })).toBe("reduced-motion");
  });

  it("shows the poster on Save-Data and without WebGL", () => {
    expect(posterReason({ ...desktop, saveData: true })).toBe("save-data");
    expect(posterReason({ ...desktop, webgl: false })).toBe("no-webgl");
  });

  it("treats a phone or tablet with 4 GB or 4 cores as low-end", () => {
    expect(posterReason({ ...desktop, coarsePointer: true, deviceMemory: 4 })).toBe("low-end");
    expect(posterReason({ ...desktop, mobileUa: true, cores: 4 })).toBe("low-end");
    expect(posterReason({ ...desktop, coarsePointer: true, deviceMemory: 8, cores: 6 })).toBeNull();
  });

  it("allows a 4-core desktop but not any device with 2 GB", () => {
    expect(posterReason({ ...desktop, cores: 4, deviceMemory: 4 })).toBeNull();
    expect(posterReason({ ...desktop, deviceMemory: 2 })).toBe("low-end");
  });

  it("assumes a capable device when memory and cores are unknown (Safari)", () => {
    expect(posterReason({ ...desktop, coarsePointer: true, deviceMemory: null, cores: null })).toBeNull();
  });
});

describe("decidePrismMode: the cheap checks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("never creates a WebGL context: that waits for first paint (hasHardwareWebGL)", () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    expect(decidePrismMode()).toBe("live");
    expect(getContext).not.toHaveBeenCalled();
  });

  it("sends reduced motion straight to the poster", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduced-motion") }));
    expect(readDeviceEnv().reducedMotion).toBe(true);
    expect(decidePrismMode()).toBe("poster");
  });

  it("fails safe to the poster when reading the device throws", () => {
    vi.stubGlobal("matchMedia", () => {
      throw new Error("blocked");
    });
    expect(decidePrismMode()).toBe("poster");
  });
});

describe("hasHardwareWebGL", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads jsdom as a device without WebGL", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(hasHardwareWebGL()).toBe(false);
  });

  it("asks only for hardware-accelerated WebGL, so a software renderer gets the poster", () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(hasHardwareWebGL()).toBe(false);
    expect(getContext).toHaveBeenCalledWith("webgl2", { failIfMajorPerformanceCaveat: true });
    expect(getContext).toHaveBeenCalledWith("webgl", { failIfMajorPerformanceCaveat: true });
  });

  it("releases the probe's hardware context straight away", () => {
    const loseContext = vi.fn();
    const ctx = fakeContext("ANGLE (Apple, ANGLE Metal Renderer: Apple M4)", { loseContext });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    expect(hasHardwareWebGL()).toBe(true);
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it("treats a context drawn in software as no WebGL", () => {
    const ctx = fakeContext(
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)), SwiftShader driver)",
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    expect(hasHardwareWebGL()).toBe(false);
  });

  it("fails safe when creating the canvas throws", () => {
    vi.spyOn(document, "createElement").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(hasHardwareWebGL()).toBe(false);
  });
});

/** A WebGL context that names its renderer (unmasked, as Chromium does), with an optional WEBGL_lose_context. */
function fakeContext(renderer: string, lose?: { loseContext: () => void }) {
  const UNMASKED = 0x9246;
  const ctx = {
    RENDERER: 0x1f01,
    getExtension: (name: string) =>
      name === "WEBGL_debug_renderer_info" ? { UNMASKED_RENDERER_WEBGL: UNMASKED } : (lose ?? null),
    getParameter: (p: number) => (p === UNMASKED ? renderer : "WebKit WebGL"),
  };
  return ctx as unknown as WebGL2RenderingContext;
}

describe("isHardwareContext", () => {
  it("knows the common software rasterisers", () => {
    expect(isHardwareContext(fakeContext("llvmpipe (LLVM 15.0.7, 256 bits)"))).toBe(false);
    expect(isHardwareContext(fakeContext("Microsoft Basic Render Driver"))).toBe(false);
    expect(isHardwareContext(fakeContext("Google SwiftShader"))).toBe(false);
  });

  it("trusts a GPU, and a browser that keeps the renderer's name to itself", () => {
    expect(isHardwareContext(fakeContext("ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)"))).toBe(true);
    const masked = { RENDERER: 0x1f01, getExtension: () => null, getParameter: () => "WebKit WebGL" };
    expect(isHardwareContext(masked as unknown as WebGLRenderingContext)).toBe(true);
  });
});
