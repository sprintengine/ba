/** GLSL for the live glass (see scene.ts). Kept apart so the scene code stays readable. */

export const BACKDROP_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Studio paper: a soft pool of light, the iridescent ribbon, the closing light sweep and the slab's shadow and caustic. */
export const BACKDROP_FRAGMENT = /* glsl */ `
varying vec2 vUv;
uniform vec2 uRes; uniform float uTime; uniform vec4 uSlab; uniform float uR; uniform float uShow; uniform float uSweep; uniform float uRib;
uniform vec3 cTop, cBot, cA, cB, cC;
float sdRR(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
vec3 spec(float t) {
  t = fract(t);
  vec3 c = mix(cA, cB, smoothstep(0.0, 0.38, t));
  c = mix(c, cC, smoothstep(0.38, 0.72, t));
  return mix(c, cA, smoothstep(0.72, 1.0, t));
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 p = (vUv - 0.5) * uRes;
  vec3 col = mix(cBot, cTop, smoothstep(-0.55, 0.6, p.y / uRes.y + 0.08));
  vec2 q = (p - uSlab.xy) / (uRes.y * vec2(1.25, 0.8));
  col = mix(col, cTop * 1.015, exp(-dot(q - vec2(0.0, 0.55), q - vec2(0.0, 0.55)) * 1.4) * 0.55);
  col *= 1.0 - 0.06 * exp(-dot(q, q) * 2.2) * uShow;
  float x = p.x;
  float yc = uSlab.y + sin(x * 0.0024 + uTime * 0.22) * uRes.y * 0.07 + sin(x * 0.0051 - uTime * 0.17 + 1.3) * uRes.y * 0.025 - x * 0.16;
  float d = p.y - yc;
  float w = uRes.y * (0.085 + 0.025 * sin(x * 0.0031 + uTime * 0.19));
  float a = exp(-d * d / (w * w)) * uRib;
  float fade = smoothstep(uRes.x * 0.62, uRes.x * 0.1, abs(x - uSlab.x * 0.6));
  a *= mix(0.35, 1.0, fade);
  vec3 sc = spec(x / (uRes.x * 1.3) + d / (w * 9.0) + uTime * 0.015);
  col = mix(col, sc, a * 0.9);
  float core = exp(-d * d / (w * w * 0.05)) * uRib;
  col = mix(col, vec3(1.0), core * 0.5 * mix(0.4, 1.0, fade));
  float sx = (x / uRes.x) - uSweep;
  float sw = exp(-sx * sx * 90.0) * exp(-d * d / (w * w * 3.0)) * uRib;
  col = mix(col, vec3(1.0), sw * 0.85);
  col = mix(col, spec(x / uRes.x * 2.0), sw * 0.25);
  vec2 sp = p - (uSlab.xy + vec2(0.0, -uSlab.w * 0.07 - 14.0));
  float sd = sdRR(sp, uSlab.zw * 0.5 * vec2(0.95, 0.92), uR);
  float sh = 1.0 - smoothstep(-uSlab.w * 0.18, uSlab.w * 0.22, sd);
  col *= 1.0 - sh * 0.15 * uShow;
  vec2 cp = p - (uSlab.xy + vec2(0.0, -uSlab.w * 0.035 - 6.0));
  float cd = sdRR(cp, uSlab.zw * 0.5 * vec2(0.97, 0.96), uR);
  float contact = (1.0 - smoothstep(-uSlab.w * 0.04, uSlab.w * 0.07, cd)) * smoothstep(0.15, -0.6, cp.y / max(uSlab.w, 1.0));
  col *= 1.0 - contact * 0.17 * uShow;
  float ring = exp(-pow((sd + 8.0) / 12.0, 2.0)) * smoothstep(0.1, -0.7, sp.y / max(uSlab.w, 1.0));
  float ang = atan(sp.y, sp.x);
  col = mix(col, spec(ang * 0.25 + 0.6) * 1.08, ring * 0.5 * uShow * uRib);
  float pool = exp(-pow((sd + 4.0) / 46.0, 2.0)) * smoothstep(0.2, -0.9, sp.y / max(uSlab.w, 1.0));
  col = mix(col, spec(sp.x / max(uSlab.z, 1.0) * 0.8 + 0.3), pool * 0.16 * uShow * uRib);
  col += (hash(gl_FragCoord.xy + uTime) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/** Injected after the physical material's transmission: darker edges, a spectrum rim and a catch-light along the top. */
export const RIM_CHUNK = /* glsl */ `
{
  float ndv = saturate(dot(normal, normalize(vViewPosition)));
  float edge = pow(1.0 - ndv, uEdgePow);
  totalDiffuse *= mix(1.0, uEdgeDark, edge);
  totalDiffuse *= 1.0 - 0.55 * smoothstep(0.82, 1.0, edge) * (0.6 + 0.4 * smoothstep(0.3, -0.8, normal.y));
  float ang = atan(normal.y, normal.x) + uRimPhase;
  float t = 0.5 + 0.5 * sin(ang);
  vec3 rc = mix(cA, cB, smoothstep(0.0, 0.5, t));
  rc = mix(rc, cC, smoothstep(0.5, 1.0, t));
  float lit = pow(edge, 1.6) * (0.55 + 0.45 * smoothstep(-0.2, 0.9, normal.y));
  totalSpecular += rc * lit * uRim;
  totalSpecular += vec3(1.0) * pow(edge, 2.6) * smoothstep(0.15, 0.95, normal.y) * 1.1;
}`;
