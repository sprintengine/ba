/**
 * Live WebGL glass only on capable devices. Everyone else gets the poster and CSS glass: reduced motion, Save-Data,
 * no hardware-accelerated WebGL, or a low-end device (a phone or tablet with 4 GB or less, or 4 cores or fewer; any device with 2 GB or
 * less). The poster paints first either way (it is the hero's LCP image), so the decision can wait for the client:
 * the cheap checks during hydration, the WebGL probe after first paint and only if they passed.
 */

/** What we know about the device when choosing between the live glass and the poster. */
export type DeviceEnv = {
  reducedMotion: boolean;
  saveData: boolean;
  coarsePointer: boolean;
  mobileUa: boolean;
  /** GB, as `navigator.deviceMemory` reports it (Chromium only); null when unknown. */
  deviceMemory: number | null;
  cores: number | null;
  /**
   * Hardware-accelerated WebGL. A software renderer (SwiftShader, llvmpipe: a blocklisted GPU, a VM, a headless
   * browser) counts as none: it takes seconds to compile the glass's shaders and hundreds of milliseconds a frame.
   */
  webgl: boolean;
};

export type PosterReason = "reduced-motion" | "save-data" | "no-webgl" | "low-end";

/** Why this device should see the poster, or null for the live glass. */
export function posterReason(env: DeviceEnv): PosterReason | null {
  if (env.reducedMotion) return "reduced-motion";
  if (env.saveData) return "save-data";
  if (!env.webgl) return "no-webgl";
  const mem = env.deviceMemory ?? 8;
  const cores = env.cores ?? 8;
  const mobile = env.coarsePointer || env.mobileUa;
  if ((mobile && (mem <= 4 || cores <= 4)) || mem <= 2) return "low-end";
  return null;
}

/** Software rasterisers, as WebGL names its renderer: Chromium's SwiftShader, Mesa's llvmpipe and softpipe, Windows' WARP. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/** Whether a WebGL context would be drawn by a GPU (the renderer's name says so, where the browser shares it). */
export function isHardwareContext(ctx: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  const info = ctx.getExtension("WEBGL_debug_renderer_info");
  const renderer: unknown = ctx.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : ctx.RENDERER);
  return !(typeof renderer === "string" && SOFTWARE_RENDERER.test(renderer));
}

/** Reads what the browser says about the device without touching the GPU (browser only). */
export function readDeviceEnv(): Omit<DeviceEnv, "webgl"> {
  const mq = (q: string) => typeof window.matchMedia === "function" && window.matchMedia(q).matches;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return {
    reducedMotion: mq("(prefers-reduced-motion: reduce)"),
    saveData: nav.connection?.saveData === true,
    coarsePointer: mq("(pointer: coarse)"),
    mobileUa: /Mobi|Android|iPhone|iPad/i.test(nav.userAgent),
    deviceMemory: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    cores: nav.hardwareConcurrency > 0 ? nav.hardwareConcurrency : null,
  };
}

/**
 * Whether the browser hands out hardware-accelerated WebGL. Creates (and releases) a throwaway context, which can
 * take tens of milliseconds, so it runs after first paint and only once the cheap checks have passed.
 */
export function hasHardwareWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    // Browsers may refuse a context with this flag when it would be software rendered; not all do (headless
    // Chromium hands out SwiftShader regardless), so the renderer's name is checked too.
    const attributes: WebGLContextAttributes = { failIfMajorPerformanceCaveat: true };
    const ctx = canvas.getContext("webgl2", attributes) ?? canvas.getContext("webgl", attributes);
    const hardware = ctx !== null && isHardwareContext(ctx);
    ctx?.getExtension("WEBGL_lose_context")?.loseContext();
    return hardware;
  } catch {
    return false;
  }
}

export type PrismMode = "poster" | "live";

/**
 * The first decision for this device, from the cheap checks: "live" means worth trying the glass, which still
 * needs `hasHardwareWebGL()`. Fails safe to the poster.
 */
export function decidePrismMode(): PrismMode {
  try {
    return posterReason({ ...readDeviceEnv(), webgl: true }) ? "poster" : "live";
  } catch {
    return "poster";
  }
}
