/**
 * Particles flowing along a line, drawn with plain WebGL: each one follows its own spot on the line, a cursor scatters
 * and swirls the ones it passes through, and a spring brings them back. Positions are worked out here and sent up each
 * frame. All sizes are CSS pixels, relative to the canvas.
 */
import { PRISM } from "@/components/brand/logo";

/** Samples along the line, enough that neighbours touch at the largest size. */
const SAMPLES = 2048;
/** A step of the simulation. Slower screens run it less often; faster ones wait for it. */
const STEP_MS = 1000 / 60;
const PULL = 0.018;
const DRAG = 0.88;
const PUSH = 9;
const SWIRL = 0.55;
/** Frames this slow, on average, halve the particles. */
const SLOW_MS = 26;
const JUDGE_FRAMES = 90;

const VERTEX = `
attribute vec4 a;
uniform vec2 size;
uniform float dot;
varying float hue;
void main() {
  gl_Position = vec4(a.x / size.x * 2. - 1., 1. - a.y / size.y * 2., 0., 1.);
  gl_PointSize = dot * (1. + a.w * .6);
  hue = a.z;
}`;

const FRAGMENT = `
precision mediump float;
uniform vec3 inks[3];
varying float hue;
void main() {
  float r = length(gl_PointCoord - .5);
  if (r > .5) discard;
  vec3 c = hue < .5 ? mix(inks[0], inks[1], hue * 2.) : mix(inks[1], inks[2], (hue - .5) * 2.);
  float alpha = .86 * smoothstep(.5, .2, r);
  gl_FragColor = vec4(c * alpha, alpha);
}`;

const inkOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/** Walks the line in steps of equal length: where it is, and which way is outwards. */
function sampleLine(d: string) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  const length = path.getTotalLength();
  const at = new Float32Array(SAMPLES * 4);
  for (let i = 0; i < SAMPLES; i++) {
    const here = path.getPointAtLength((i / SAMPLES) * length);
    const next = path.getPointAtLength(((i + 1) / SAMPLES) * length);
    const nx = -(next.y - here.y);
    const ny = next.x - here.x;
    const l = Math.hypot(nx, ny) || 1;
    at.set([here.x, here.y, nx / l, ny / l], i * 4);
  }
  return at;
}

const bell = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

function program(gl: WebGLRenderingContext) {
  const made = gl.createProgram();
  gl.attachShader(made, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(made, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(made);
  return gl.getProgramParameter(made, gl.LINK_STATUS) ? made : null;
}

export type Particles = {
  /** The canvas's size, and where the line sits in it: its left and top, and CSS pixels per unit of the drawing. */
  place: (
    canvas: { width: number; height: number; dpr: number },
    line: { x: number; y: number; scale: number },
  ) => void;
  /** Where the cursor is, or null. */
  point: (at: { x: number; y: number } | null) => void;
  /** Moves on to this moment and draws. */
  frame: (now: number) => void;
  /** Forgets the time, so a pause doesn't count as a slow frame. */
  rest: () => void;
};

/** Null where WebGL isn't available. */
export function createParticles(
  canvas: HTMLCanvasElement,
  {
    line,
    width,
    spread,
    count,
    reach,
  }: { line: string; width: number; spread: number; count: number; reach: number },
): Particles | null {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: true, powerPreference: "low-power" });
  if (!gl) return null;
  const made = program(gl);
  if (!made) return null;
  gl.useProgram(made);

  const walk = sampleLine(line);
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const vx = new Float32Array(count);
  const vy = new Float32Array(count);
  const spot = new Float32Array(count);
  const speed = new Float32Array(count);
  const offset = new Float32Array(count);
  const out = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    spot[i] = Math.random() * SAMPLES;
    speed[i] = 0.5 + Math.random() * 1.1;
    offset[i] = bell() * spread;
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  const attribute = gl.getAttribLocation(made, "a");
  gl.enableVertexAttribArray(attribute);
  gl.vertexAttribPointer(attribute, 4, gl.FLOAT, false, 0, 0);
  gl.bufferData(gl.ARRAY_BUFFER, out, gl.DYNAMIC_DRAW);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  gl.uniform3fv(gl.getUniformLocation(made, "inks"), PRISM.flatMap(inkOf));
  const size = gl.getUniformLocation(made, "size");
  const dot = gl.getUniformLocation(made, "dot");

  let scale = 1;
  let originX = 0;
  let originY = 0;
  let placed = false;
  let cursorX = 0;
  let cursorY = 0;
  let cursor: { x: number; y: number } | null = null;
  let live = count;
  let last = 0;
  let owed = 0;
  let slow = 0;
  let judged = 0;

  const home = (i: number) => {
    const s = (Math.floor(spot[i]!) % SAMPLES) * 4;
    const o = offset[i]!;
    return [
      originX + (walk[s]! + walk[s + 2]! * o) * scale,
      originY + (walk[s + 1]! + walk[s + 3]! * o) * scale,
    ] as const;
  };

  const step = () => {
    if (cursor) {
      cursorX += (cursor.x - cursorX) * 0.25;
      cursorY += (cursor.y - cursorY) * 0.25;
    }
    const reach2 = reach * reach;
    for (let i = 0; i < live; i++) {
      spot[i] = (spot[i]! + speed[i]!) % SAMPLES;
      const [hx, hy] = home(i);
      const px = x[i]!;
      const py = y[i]!;
      let ax = (hx - px) * PULL;
      let ay = (hy - py) * PULL;
      if (cursor) {
        const dx = px - cursorX;
        const dy = py - cursorY;
        const d2 = dx * dx + dy * dy;
        if (d2 < reach2) {
          const d = Math.sqrt(d2) + 1;
          const fall = 1 - d / reach;
          const f = fall * fall * PUSH;
          ax += (dx / d) * f - (dy / d) * f * SWIRL;
          ay += (dy / d) * f + (dx / d) * f * SWIRL;
        }
      }
      vx[i] = (vx[i]! + ax) * DRAG;
      vy[i] = (vy[i]! + ay) * DRAG;
      x[i] = px + vx[i]!;
      y[i] = py + vy[i]!;
    }
  };

  const draw = () => {
    for (let i = 0; i < live; i++) {
      const j = i * 4;
      out[j] = x[i]!;
      out[j + 1] = y[i]!;
      const s = (Math.floor(spot[i]!) % SAMPLES) * 4;
      out[j + 2] = walk[s]! / width;
      out[j + 3] = Math.min(1, Math.hypot(vx[i]!, vy[i]!) * 0.08);
    }
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, out.subarray(0, live * 4));
    gl.drawArrays(gl.POINTS, 0, live);
  };

  return {
    place(view, at) {
      const first = !placed;
      placed = true;
      canvas.width = Math.round(view.width * view.dpr);
      canvas.height = Math.round(view.height * view.dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(size, view.width, view.height);
      gl.uniform1f(dot, 1.7 * view.dpr);
      scale = at.scale;
      originX = at.x;
      originY = at.y;
      if (!first) return;
      // They arrive from around the line, and settle onto it.
      for (let i = 0; i < count; i++) {
        const [hx, hy] = home(i);
        x[i] = hx + bell() * width * scale * 0.4;
        y[i] = hy + bell() * width * scale * 0.4;
      }
    },
    point(at) {
      if (at && !cursor) {
        cursorX = at.x;
        cursorY = at.y;
      }
      cursor = at;
    },
    frame(now) {
      if (!placed) return;
      const passed = last ? now - last : STEP_MS;
      last = now;
      owed = Math.min(owed + passed, STEP_MS * 3);
      let stepped = false;
      while (owed >= STEP_MS) {
        step();
        owed -= STEP_MS;
        stepped = true;
      }
      if (stepped) draw();
      slow += passed;
      judged += 1;
      if (judged === JUDGE_FRAMES) {
        if (slow / judged > SLOW_MS) live = Math.ceil(live / 2);
        slow = 0;
        judged = 0;
      }
    },
    rest() {
      last = 0;
      owed = 0;
    },
  };
}
