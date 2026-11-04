import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshPhysicalMaterial,
  Scene,
  ShaderMaterial,
} from "three";
import { must } from "@/test/must";
import { FOV, loadPrismScene, type SlabFrame, type StudioTheme } from "../scene";

/** The WebGL parts of three.js, faked: jsdom has no WebGL. Everything else (scene, materials, geometry) is real. */
const gl = vi.hoisted(() => ({
  renderers: [] as {
    pixelRatio: number;
    size: [number, number] | null;
    rendered: { scene: unknown; camera: { position: { z: number }; aspect: number } }[];
    compiled: unknown[];
    disposed: boolean;
    compileError: Error | null;
    options: unknown;
    contextLost: boolean;
  }[],
  pmremDisposed: 0,
  studioDisposed: 0,
  failCompile: false,
}));

vi.mock("three", async (original) => {
  const three = await original<typeof import("three")>();
  class WebGLRenderer {
    state = {
      pixelRatio: 1,
      size: null as [number, number] | null,
      rendered: [] as never[],
      compiled: [] as unknown[],
      disposed: false,
      compileError: gl.failCompile ? new Error("lost context") : null,
      options: null as unknown,
      contextLost: false,
    };
    outputColorSpace = "";
    toneMapping = 0;
    constructor(options: unknown) {
      this.state.options = options;
      gl.renderers.push(this.state);
    }
    setPixelRatio(r: number) {
      this.state.pixelRatio = r;
    }
    setSize(w: number, h: number) {
      this.state.size = [w, h];
    }
    render(scene: never, camera: never) {
      this.state.rendered.push({ scene, camera } as never);
    }
    compileAsync(scene: unknown) {
      this.state.compiled.push(scene);
      return this.state.compileError ? Promise.reject(this.state.compileError) : Promise.resolve(scene);
    }
    dispose() {
      this.state.disposed = true;
    }
    forceContextLoss() {
      expect(this.state.disposed).toBe(true); // resources first, then the context
      this.state.contextLost = true;
    }
  }
  class PMREMGenerator {
    fromScene(env: Scene) {
      expect(env.children.length).toBeGreaterThan(5); // the studio: cyclorama, strips, flags, tinted cards
      // A render target: disposing it (not just its texture) frees the framebuffers PMREM rendered into.
      return {
        texture: new three.Texture(),
        dispose() {
          gl.studioDisposed++;
        },
      };
    }
    dispose() {
      gl.pmremDisposed++;
    }
  }
  return { ...three, WebGLRenderer, PMREMGenerator };
});

const theme: StudioTheme = {
  top: "#f3f4f7",
  bottom: "#e1e4ea",
  attenuation: "#d9e1ee",
  ribbon: 1,
  dark: false,
};
const frame: SlabFrame = {
  cx: 0,
  cy: -20,
  w: 600,
  h: 380,
  r: 40,
  depth: 64,
  rx: 9,
  ry: -17,
  time: 1.5,
  sweep: -2,
};

beforeEach(() => {
  gl.renderers = [];
  gl.pmremDisposed = 0;
  gl.studioDisposed = 0;
  gl.failCompile = false;
});
afterEach(() => vi.unstubAllGlobals());

const lastRender = () => {
  const r = must(must(gl.renderers[0], "renderer").rendered.at(-1), "a render");
  const scene = r.scene as Scene;
  const [backdrop, slab] = scene.children as [
    Mesh<BufferGeometry, ShaderMaterial>,
    Mesh<BufferGeometry, MeshPhysicalMaterial>,
  ];
  return { scene, camera: r.camera, backdrop, slab };
};

describe("loadPrismScene", () => {
  it("bakes the studio, then compiles the scene's shaders before handing it over", async () => {
    vi.stubGlobal("devicePixelRatio", 3);
    const prism = await loadPrismScene(document.createElement("canvas"), theme);
    const renderer = must(gl.renderers[0], "renderer");
    expect(renderer.compiled).toHaveLength(1);
    expect(renderer.rendered).toHaveLength(0);
    expect(renderer.pixelRatio).toBe(1.75); // capped
    // No request for the discrete GPU: a laptop keeps its integrated one (and its battery) for the glass.
    expect(renderer.options).toMatchObject({ powerPreference: "default" });
    expect(gl.pmremDisposed).toBe(1);
    expect(typeof prism.render).toBe("function");
  });

  it("throws the renderer away when the shaders fail to compile", async () => {
    gl.failCompile = true;
    await expect(loadPrismScene(document.createElement("canvas"), theme)).rejects.toThrow("lost context");
    expect(must(gl.renderers[0], "renderer").disposed).toBe(true);
    expect(gl.studioDisposed).toBe(1);
  });

  it("sizes the camera so the CSS perspective lines the HTML face up with the slab", async () => {
    const prism = await loadPrismScene(document.createElement("canvas"), theme);
    prism.resize(1440, 900);
    const distance = 900 / 2 / Math.tan((FOV / 2) * (Math.PI / 180));
    expect(prism.perspective()).toBeCloseTo(distance);
    expect(must(gl.renderers[0], "renderer").size).toEqual([1440, 900]);
    prism.render(frame);
    const { camera, backdrop } = lastRender();
    expect(camera.position.z).toBeCloseTo(distance);
    expect(camera.aspect).toBeCloseTo(1.6);
    expect(backdrop.scale.x).toBeGreaterThan(1440); // the paper fills the view behind the slab
  });

  it("poses the slab for each frame and only rebuilds its geometry when its shape changes", async () => {
    const prism = await loadPrismScene(document.createElement("canvas"), theme);
    prism.render(frame);
    const { slab, backdrop } = lastRender();
    expect(slab.position.y).toBe(20); // y up in the scene, down on the page
    expect(slab.rotation.x).toBeCloseTo((9 * Math.PI) / 180);
    expect(slab.material.thickness).toBeCloseTo(64 * 3.4);
    expect(backdrop.material.uniforms.uTime?.value).toBe(1.5);
    const version = (slab.geometry.attributes.position as BufferAttribute).version;

    prism.render({ ...frame, ry: 10, time: 2 });
    expect((slab.geometry.attributes.position as BufferAttribute).version).toBe(version);
    prism.render({ ...frame, w: 500 });
    expect((slab.geometry.attributes.position as BufferAttribute).version).toBeGreaterThan(version);
    slab.geometry.computeBoundingBox();
    expect(must(slab.geometry.boundingBox, "box").max.x).toBeCloseTo(250, 0);
  });

  it("restyles the studio for dark mode", async () => {
    const prism = await loadPrismScene(document.createElement("canvas"), theme);
    prism.render(frame);
    const { slab, backdrop } = lastRender();
    expect(slab.material.envMapIntensity).toBe(1);
    prism.setTheme({ ...theme, top: "#111214", ribbon: 0.6, dark: true });
    expect(slab.material.envMapIntensity).toBe(0.7);
    expect(backdrop.material.uniforms.uRib?.value).toBe(0.6);
  });

  it("frees the GPU resources on dispose", async () => {
    const prism = await loadPrismScene(document.createElement("canvas"), theme);
    const renderer = must(gl.renderers[0], "renderer");
    expect(renderer.contextLost).toBe(false);
    prism.dispose();
    expect(renderer.disposed).toBe(true);
    expect(renderer.contextLost).toBe(true); // the context is handed back, not left for the collector
    expect(gl.studioDisposed).toBe(1);
  });
});
