/**
 * The logo's interlocked rings as threads of light. Each ring is a band of fine lines that twist round each other as
 * they go, like the engraving on a banknote, and the twist flows slowly round the loop. All of it is worked out on the
 * graphics card, so a frame costs one draw call. The maths is in the logo's own units, so the rings match it exactly.
 */
const THREADS = 64;
const SEGMENTS = 540;

const VERTEX = `
attribute vec3 aPoint;
uniform float uTime;
uniform float uStrength;
varying vec4 vColour;

const float TAU = 6.2831853;
const vec2 LEFT = vec2(293.5, 310.0);
const vec2 RIGHT = vec2(583.5, 310.0);
const vec2 RADIUS = vec2(208.5, 225.0);
const float BAND = 58.0;

vec3 prism(float u) {
  vec3 blue = vec3(0.184, 0.694, 0.910);
  vec3 violet = vec3(0.478, 0.416, 0.941);
  vec3 orange = vec3(1.0, 0.541, 0.333);
  return u < 0.5 ? mix(blue, violet, u * 2.0) : mix(violet, orange, u * 2.0 - 1.0);
}

void main() {
  float angle = aPoint.x * TAU;
  float phase = aPoint.y * TAU;
  bool first = aPoint.z < 0.5;
  float way = first ? 1.0 : -1.0;

  float twist = angle * 5.0 + phase + uTime * 0.24 * way;
  float swell = 0.8 + 0.2 * sin(angle * 2.0 - uTime * 0.11 * way + aPoint.z * 2.0);
  float offset = BAND * swell * sin(twist) + BAND * 0.1 * sin(angle * 11.0 - phase * 2.0 + uTime * 0.17);

  vec2 centre = first ? LEFT : RIGHT;
  vec2 point = centre + (RADIUS + offset) * vec2(cos(angle), sin(angle));

  // Lines on the near side of the twist are brighter, so the band reads as round.
  float near = 0.5 + 0.5 * cos(twist);
  float alpha = 0.08 + 0.6 * near * near;
  // A slow glint running along each line.
  alpha += 0.55 * pow(0.5 + 0.5 * sin(angle * 2.0 - uTime * 0.42 * way + phase * 3.0), 22.0);

  // The weave: this ring stops short of the other where it passes under, as in the logo.
  vec2 other = first ? RIGHT : LEFT;
  float fromOther = (length((point - other) / RADIUS) - 1.0) * RADIUS.x;
  float under = smoothstep(10.0, 50.0, first ? 310.0 - point.y : point.y - 310.0);
  alpha *= 1.0 - under * (1.0 - smoothstep(BAND * 1.02, BAND * 1.24, abs(fromOther)));

  alpha = clamp(alpha * uStrength, 0.0, 1.0);
  vColour = vec4(prism((point.x - 30.0) / 817.0) * alpha, alpha);
  gl_Position = vec4(point.x / 438.5 - 1.0, 1.0 - point.y / 310.0, 0.0, 1.0);
}`;

const FRAGMENT = `
precision mediump float;
varying vec4 vColour;
void main() { gl_FragColor = vColour; }`;

function shader(gl: WebGLRenderingContext, type: number, source: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, source);
  gl.compileShader(s);
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
}

/** The start of every line piece round both rings: where round the ring, which thread, which ring. */
function geometry() {
  const points = new Float32Array(2 * THREADS * SEGMENTS * 2 * 3);
  let at = 0;
  for (let ring = 0; ring < 2; ring++)
    for (let thread = 0; thread < THREADS; thread++)
      for (let segment = 0; segment < SEGMENTS; segment++)
        for (const end of [segment, segment + 1]) {
          points[at++] = end / SEGMENTS;
          points[at++] = thread / THREADS;
          points[at++] = ring;
        }
  return points;
}

export type Rings = {
  /** Draws one frame at a time in seconds; `strength` multiplies how bright the lines are. */
  draw: (time: number, strength: number) => void;
  resize: (width: number, height: number) => void;
};

/** Sets the rings up on a canvas. Null where WebGL isn't available, and the caller shows the plain mark. */
export function createRings(canvas: HTMLCanvasElement): Rings | null {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true });
  if (!gl) return null;
  const vertex = shader(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = shader(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const points = geometry();
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
  const point = gl.getAttribLocation(program, "aPoint");
  gl.enableVertexAttribArray(point);
  gl.vertexAttribPointer(point, 3, gl.FLOAT, false, 0, 0);
  const time = gl.getUniformLocation(program, "uTime");
  const strength = gl.getUniformLocation(program, "uStrength");

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  return {
    resize: (width, height) => {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    },
    draw: (t, s) => {
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(time, t);
      gl.uniform1f(strength, s);
      gl.drawArrays(gl.LINES, 0, points.length / 3);
    },
  };
}
