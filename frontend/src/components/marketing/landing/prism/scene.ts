/**
 * The live glass: a rounded slab of iridescent glass in a lit studio, over paper with a slow ribbon of spectrum
 * light. Loaded only on capable devices, after first paint, via `import("./scene")`, so three.js never touches the
 * initial bundle, and started with `loadPrismScene`, which compiles the shaders off the main thread. The shader colours below are the brand kit's prism light (decorative only, never text).
 */
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NoToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
} from "three";
import { BACKDROP_FRAGMENT, BACKDROP_VERTEX, RIM_CHUNK } from "./scene-shaders";

/** Bevel radius as a share of slab thickness, and refraction depth as a multiple of it. */
const BEVEL = 0.36;
const GLASS_DEPTH = 3.4;
export const FOV = 30;
const BACKDROP_Z = -520;
const D2R = Math.PI / 180;

/** The prism spectrum (cyan, lilac, peach). */
const SPECTRUM = ["#8fd8f2", "#bfaeff", "#ffbf9c"] as const;

export type StudioTheme = { top: string; bottom: string; attenuation: string; ribbon: number; dark: boolean };

export type SlabFrame = {
  /** Centre offset from the viewport centre (px, y down), outer size, corner radius and thickness, in px. */
  cx: number;
  cy: number;
  w: number;
  h: number;
  r: number;
  depth: number;
  /** Angles in degrees. */
  rx: number;
  ry: number;
  time: number;
  /** The light sweep's position across the paper (-2 = off). */
  sweep: number;
};

export type PrismScene = {
  resize: (vw: number, vh: number) => void;
  setTheme: (theme: StudioTheme) => void;
  render: (f: SlabFrame) => void;
  /** Camera distance in px, which is also the CSS perspective that lines the HTML face up with the slab. */
  perspective: () => number;
  dispose: () => void;
};

/** A colour given as sRGB hex, used as-is in the working space (how the original r149 scene treated it). */
const raw = (hex: string) => new Color().setStyle(hex, LinearSRGBColorSpace);

/** Grey cyclorama, bright softboxes, black flags and three tinted cards: the reflections that make it read as glass. */
function buildStudio(renderer: WebGLRenderer) {
  const env = new Scene();
  const roomGeo = new SphereGeometry(100, 48, 24);
  const pos = roomGeo.attributes.position!;
  const cols: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 100;
    const c = y > 0 ? 0.32 + (0.6 - 0.32) * y : 0.32 + (0.05 - 0.32) * Math.min(1, -y * 1.6);
    cols.push(c, c, c * 1.02);
  }
  roomGeo.setAttribute("color", new Float32BufferAttribute(cols, 3));
  env.add(new Mesh(roomGeo, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));
  const card = (w: number, h: number, at: [number, number, number], rgb: [number, number, number]) => {
    const m = new Mesh(
      new PlaneGeometry(w, h),
      new MeshBasicMaterial({ color: new Color(...rgb), side: DoubleSide }),
    );
    m.position.set(...at);
    m.lookAt(new Vector3(0, 0, 0));
    env.add(m);
  };
  card(120, 9, [0, 72, 0], [9, 9, 9]); // overhead strip
  card(80, 5, [0, 60, 40], [6, 6, 6]); // second overhead strip, front
  card(5, 90, [-64, 6, 16], [7, 7, 7.3]); // left strip
  card(4, 90, [64, 6, 6], [5, 5, 5.3]); // right strip
  card(40, 14, [-30, 26, 64], [2.2, 2.2, 2.2]); // front key
  card(22, 70, [-70, -6, -26], [0, 0, 0]); // flags
  card(22, 70, [70, -6, -36], [0, 0, 0]);
  card(26, 34, [-52, -22, 44], [0.5, 1.8, 2.6]); // cyan card
  card(28, 34, [56, 22, 42], [1.8, 1.1, 3.0]); // lilac card
  card(46, 16, [22, -50, 30], [3.0, 1.6, 0.9]); // peach card
  const pmrem = new PMREMGenerator(renderer);
  // The render target, not just its texture: disposing the target frees its framebuffers too.
  const studio = pmrem.fromScene(env, 0.02);
  pmrem.dispose();
  env.traverse((o) => {
    if (o instanceof Mesh) {
      (o.geometry as BufferGeometry).dispose();
      (o.material as MeshBasicMaterial).dispose();
    }
  });
  return studio;
}

/** Rounded rectangle in plan, fully rounded edge in section, analytic normals; rebuilt in place as it morphs. */
function buildSlabGeometry() {
  const NC = 18; // segments per corner
  const NP = 9; // segments per half profile
  const OL = 4 * (NC + 1);
  const RN = 2 * (NP + 1);
  const nV = OL * RN + 2;
  const P = new Float32Array(nV * 3);
  const N = new Float32Array(nV * 3);
  const idx: number[] = [];
  for (let r = 0; r < RN - 1; r++)
    for (let s = 0; s < OL; s++) {
      const s2 = (s + 1) % OL;
      const a = r * OL + s;
      const b = r * OL + s2;
      const c = (r + 1) * OL + s2;
      const d = (r + 1) * OL + s;
      idx.push(a, b, c, a, c, d);
    }
  const cF = OL * RN;
  const cB = cF + 1;
  for (let s = 0; s < OL; s++) {
    const s2 = (s + 1) % OL;
    idx.push(cF, (RN - 1) * OL + s, (RN - 1) * OL + s2);
    idx.push(cB, s2, s);
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(P, 3).setUsage(DynamicDrawUsage));
  geo.setAttribute("normal", new BufferAttribute(N, 3).setUsage(DynamicDrawUsage));
  geo.setIndex(idx);

  let last = "";
  /** Returns false when nothing changed. */
  function update(w: number, h: number, radius: number, T: number) {
    const key = [w, h, radius, T].map((v) => v.toFixed(1)).join();
    if (key === last) return false;
    last = key;
    const R = Math.min(radius, w / 2, h / 2);
    const b = Math.min(T * BEVEL, R - 0.5);
    const ri = R - b;
    const zc = T / 2 - b;
    let v = 0;
    for (let r = 0; r < RN; r++) {
      const half = r < NP + 1 ? 0 : 1;
      const j = half ? r - (NP + 1) : r;
      const phi = half ? (j / NP) * (Math.PI / 2) : -Math.PI / 2 + (j / NP) * (Math.PI / 2);
      const zcen = half ? zc : -zc;
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      for (let k = 0; k < 4; k++) {
        const sx = k === 0 || k === 3 ? 1 : -1;
        const sy = k < 2 ? 1 : -1;
        const cx = sx * (w / 2 - R);
        const cy = sy * (h / 2 - R);
        for (let i = 0; i <= NC; i++) {
          const th = (k * 90 + (i / NC) * 90) * D2R;
          const nx = Math.cos(th);
          const ny = Math.sin(th);
          P[v * 3] = cx + nx * (ri + b * cp);
          P[v * 3 + 1] = cy + ny * (ri + b * cp);
          P[v * 3 + 2] = zcen + b * sp;
          N[v * 3] = nx * cp;
          N[v * 3 + 1] = ny * cp;
          N[v * 3 + 2] = sp;
          v++;
        }
      }
    }
    P.set([0, 0, T / 2], cF * 3);
    N.set([0, 0, 1], cF * 3);
    P.set([0, 0, -T / 2], cB * 3);
    N.set([0, 0, -1], cB * 3);
    geo.attributes.position!.needsUpdate = true;
    geo.attributes.normal!.needsUpdate = true;
    geo.computeBoundingSphere();
    return true;
  }
  return { geo, update };
}

/**
 * Builds the scene and resolves once its shaders are compiled, so the first frame doesn't stall on them. The glass
 * (physical material with transmission and iridescence) is a large program: linking it on first render blocked the
 * main thread for over a second even on a fast GPU. `compileAsync` starts the compile and, where the browser has
 * KHR_parallel_shader_compile, polls for it to finish instead of waiting.
 */
export async function loadPrismScene(canvas: HTMLCanvasElement, theme: StudioTheme): Promise<PrismScene> {
  const { prism, compile } = createPrismScene(canvas, theme);
  try {
    await compile();
  } catch (e) {
    prism.dispose();
    throw e;
  }
  return prism;
}

function createPrismScene(
  canvas: HTMLCanvasElement,
  theme: StudioTheme,
): { prism: PrismScene; compile: () => Promise<unknown> } {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "default" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 10, 20000);
  const studio = buildStudio(renderer);
  scene.environment = studio.texture;

  /* Backdrop: studio paper with the iridescent ribbon, a soft shadow and a caustic under the slab. */
  const spectrum = SPECTRUM.map((hex) => new Color(hex));
  const bd = {
    uRes: { value: new Vector2(1, 1) },
    uTime: { value: 0 },
    uSlab: { value: new Vector4(0, 0, 600, 360) },
    uR: { value: 40 },
    uShow: { value: 1 },
    uSweep: { value: -2 },
    uRib: { value: 1 },
    cTop: { value: new Color() },
    cBot: { value: new Color() },
    cA: { value: spectrum[0]! },
    cB: { value: spectrum[1]! },
    cC: { value: spectrum[2]! },
  };
  const backdrop = new Mesh(
    new PlaneGeometry(1, 1),
    new ShaderMaterial({
      uniforms: bd,
      depthWrite: false,
      vertexShader: BACKDROP_VERTEX,
      fragmentShader: BACKDROP_FRAGMENT,
    }),
  );
  backdrop.position.z = BACKDROP_Z;
  backdrop.renderOrder = -1;
  scene.add(backdrop);

  const slabGeo = buildSlabGeometry();
  const glass = new MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.03,
    transmission: 1,
    thickness: 40,
    ior: 1.5,
    iridescence: 1,
    iridescenceIOR: 1.32,
    iridescenceThicknessRange: [180, 520],
    clearcoat: 0,
    specularIntensity: 1,
    envMapIntensity: 1,
    attenuationDistance: 520,
  });
  const rim = {
    uEdgeDark: { value: 0.2 },
    uEdgePow: { value: 1.6 },
    uRim: { value: 3.0 },
    uRimPhase: { value: 0 },
    cA: { value: spectrum[0]! },
    cB: { value: spectrum[1]! },
    cC: { value: spectrum[2]! },
  };
  glass.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, rim);
    sh.fragmentShader =
      "uniform float uEdgeDark, uEdgePow, uRim, uRimPhase; uniform vec3 cA, cB, cC;\n" +
      sh.fragmentShader.replace(
        "#include <transmission_fragment>",
        `#include <transmission_fragment>\n${RIM_CHUNK}`,
      );
  };
  const slab = new Mesh(slabGeo.geo, glass);
  scene.add(slab);

  let distance = 1000;
  function resize(vw: number, vh: number) {
    renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh;
    distance = vh / 2 / Math.tan((FOV / 2) * D2R);
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const s = (distance - BACKDROP_Z) / distance;
    backdrop.scale.set(vw * s, vh * s, 1);
    bd.uRes.value.set(vw, vh);
  }

  function setTheme(t: StudioTheme) {
    bd.cTop.value.set(t.top);
    bd.cBot.value.set(t.bottom);
    bd.uRib.value = t.ribbon;
    glass.attenuationColor = raw(t.attenuation);
    glass.envMapIntensity = t.dark ? 0.7 : 1;
    rim.uEdgeDark.value = t.dark ? 0.55 : 0.2;
    rim.uRim.value = t.dark ? 2.2 : 3.0;
  }
  setTheme(theme);

  function render(f: SlabFrame) {
    if (slabGeo.update(f.w, f.h, f.r, f.depth)) glass.thickness = f.depth * GLASS_DEPTH;
    slab.position.set(f.cx, -f.cy, 0);
    slab.rotation.set(f.rx * D2R, f.ry * D2R, 0);
    rim.uRimPhase.value = f.ry * D2R * 2.2 + f.time * 0.12;
    bd.uTime.value = f.time;
    bd.uSlab.value.set(f.cx, -f.cy, f.w, f.h);
    bd.uR.value = f.r;
    bd.uSweep.value = f.sweep;
    renderer.render(scene, camera);
  }

  function dispose() {
    slabGeo.geo.dispose();
    glass.dispose();
    backdrop.geometry.dispose();
    backdrop.material.dispose();
    studio.dispose();
    renderer.dispose();
    // Hand the context back now rather than whenever the canvas is collected: browsers cap live contexts.
    renderer.forceContextLoss();
  }

  return {
    prism: { resize, setTheme, render, perspective: () => distance, dispose },
    compile: () => renderer.compileAsync(scene, camera),
  };
}
