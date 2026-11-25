/**
 * Full-screen WebGL2 shader: "the singularity".
 *
 * Scene timeline (driven by `uLaunch`, 0 → 1 while scrolling the hero + launch section).
 * Everything follows the scroll position, so scrolling slowly plays it in slow motion:
 *   0.00–0.30  stars stream past from the first pixel; matter spirals into the restless black hole
 *   0.05–0.30  a meteor streaks in from the top right, speeding up
 *   0.30       impact: camera shake, a warm flare, the hole cracks into glowing pieces
 *   0.32–0.80  the pieces fly towards the camera while colour gas, a shockwave and debris reveal the far side
 *   0.80–1.00  a green planet rises from below: the landing zone (the game section fades in on it)
 * The camera rolls and flies forward towards a wandering vanishing point; after the launch, `uAfter`
 * (viewports scrolled past it) keeps that flight going and brings planets past on either side.
 * `uDrift` (whole-page progress) raises a planet horizon at the very end of the page.
 */

export const VERTEX_SHADER = /* glsl */ `#version 300 es
void main() {
  // One oversized triangle covering the viewport; no buffers needed.
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform float uLaunch;
uniform float uDrift;
uniform vec2 uMouse;
uniform float uSingularity;
uniform vec2 uFocus; // where the hole sits at rest (uv units), measured from the page title
uniform float uBoost; // 0..1 from scroll velocity
uniform float uAfter; // viewport heights scrolled past the launch sequence

out vec4 outColor;

const float TAU = 6.28318530718;

// ---------- noise ----------
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, s, -s, c);
}

// Soft rainbow, desaturated a little so it sits with the brand orange.
vec3 spectrum(float x) {
  return mix(vec3(0.7), 0.5 + 0.5 * cos(TAU * (x + vec3(0.0, 0.33, 0.67))), 0.8);
}

// ---------- stars ----------
vec3 starLayer(vec2 uv, float scale, float seed, float t) {
  vec2 g = uv * scale + seed * 17.0;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash12(id + seed);
  vec2 o = hash22(id + seed * 3.0) - 0.5;
  float d = length(f - o * 0.7);
  float b = pow(max(h - 0.78, 0.0) / 0.22, 2.6);
  float twinkle = 0.6 + 0.4 * sin(t * (0.6 + h * 2.5) + h * 40.0);
  float core = smoothstep(0.07, 0.0, d);
  float halo = exp(-d * 16.0) * 0.18;
  vec3 tint = mix(vec3(1.0, 0.78, 0.55), vec3(0.85, 0.9, 1.0), hash12(id + 7.0));
  return tint * b * twinkle * (core + halo);
}

// Radial streaks in polar "tunnel" space; length grows with warp.
vec3 warpStreaks(vec2 uv, float t, float warp, float colorful) {
  float r = length(uv);
  float a = atan(uv.y, uv.x) / TAU + 0.5;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float div = 110.0 + fi * 70.0;
    float sa = a * div;
    float cellA = floor(sa);
    float fa = fract(sa) - 0.5;
    float h = hash12(vec2(cellA, fi * 13.0 + 1.0));
    float speed = (0.25 + warp * 6.0) * (0.7 + h * 0.6);
    float depth = log(r + 1e-3) * 2.2 - t * speed + h * 10.0;
    float cellD = floor(depth);
    float fd = fract(depth);
    float on = step(0.72, hash12(vec2(cellA, cellD + fi * 7.0)));
    float len = 0.015 + warp * 0.75;
    float streak = smoothstep(0.0, 0.015, fd) * exp(-fd / len) ;
    float width = smoothstep(0.5, 0.0, abs(fa)) ;
    width = pow(width, 10.0 - warp * 4.0);
    float fade = smoothstep(0.02, 0.35, r);
    vec3 tint = mix(vec3(1.0, 0.92, 0.82), vec3(1.0, 0.5, 0.15), fd);
    tint = mix(tint, spectrum(h * 3.7 + fi * 0.3) * 1.2, colorful * 0.7);
    col += tint * on * streak * width * fade * (0.6 + 0.8 * h);
  }
  return col;
}

// Matter spiralling into the hole while we approach it.
vec3 infall(vec2 p, float R, float t) {
  float r = length(p) / R;
  if (r < 1.0 || r > 9.0) return vec3(0.0);
  const float N = 48.0;
  float a = atan(p.y, p.x) / TAU;
  float u = a * N + log(r) * 7.0 + t * 0.35;
  float cell = mod(floor(u), N); // the atan seam shifts u by exactly N, so this stays continuous
  float fu = fract(u) - 0.5;
  float h = hash12(vec2(cell, 5.0));
  float depth = log(r) * 4.0 + t * (1.4 + h * 1.6) + h * 20.0;
  float on = step(0.62, hash12(vec2(cell, floor(depth))));
  float fd = fract(depth);
  float streak = smoothstep(0.0, 0.04, fd) * (1.0 - smoothstep(0.04, 0.7, fd));
  float width = pow(1.0 - smoothstep(0.0, 0.5, abs(fu)), 8.0);
  float fade = smoothstep(1.0, 1.35, r) * (1.0 - smoothstep(3.0, 9.0, r));
  vec3 tint = mix(vec3(1.0, 0.92, 0.8), vec3(1.0, 0.45, 0.1), fd);
  return tint * on * streak * width * fade;
}

// Distant spiral galaxies, one per (rare) grid cell.
vec3 galaxies(vec2 p, float t) {
  vec2 g = p * 3.2;
  vec2 id = floor(g);
  float h = hash12(id + 41.0);
  if (h < 0.7) return vec3(0.0);
  vec2 q = fract(g) - 0.5 - (hash22(id + 5.0) - 0.5) * 0.5;
  float size = mix(0.06, 0.15, hash12(id + 11.0));
  q = rot(hash12(id + 9.0) * TAU) * q;
  q.y /= mix(0.3, 0.9, hash12(id + 3.0));
  float r = length(q) / size;
  if (r > 1.6) return vec3(0.0);
  float th = atan(q.y, q.x);
  float arms = pow(0.5 + 0.5 * cos(2.0 * th - log(r + 0.04) * 5.0 + t * 0.05 + h * 20.0), 3.0);
  float disk = exp(-r * 3.0);
  float core = exp(-r * 14.0);
  vec3 tint = spectrum(hash12(id + 17.0));
  return (tint * disk * (0.2 + arms * 1.2) + vec3(1.0, 0.93, 0.85) * core * 1.4) * 0.5;
}

// A lit sphere with banded, slowly rotating clouds and an atmosphere.
// Composite as col * (1 - cover) + result.
vec3 planet(vec2 uv, vec2 c, float r, vec3 L, vec3 base1, vec3 base2, vec3 atm, float bands,
            float seed, float t, out float cover) {
  cover = 0.0;
  vec2 q = (uv - c) / r;
  float d = length(q);
  if (d > 1.8) return vec3(0.0);
  vec2 qn = q / max(d, 1e-4);
  float litRim = max(dot(qn, L.xy), 0.0);
  vec3 col = atm * exp(-max(d - 1.0, 0.0) * r * 42.0) * step(1.0, d) * (0.06 + litRim * 0.9);
  if (d < 1.0) {
    float z = sqrt(1.0 - d * d);
    vec3 n = vec3(q, z);
    float ndl = dot(n, L);
    float lon = atan(q.x, z);
    vec2 st = vec2(lon * 1.3 + t * 0.012 + seed, q.y * bands);
    float w = fbm(st * vec2(1.0, 0.4) + seed * 3.0);
    float tex = fbm(vec2(st.x * 1.6, st.y + w * 2.2));
    vec3 surf = mix(base1, base2, smoothstep(0.25, 0.8, tex));
    vec3 disc = surf * (max(ndl, 0.0) * 0.95 + 0.012);
    disc += atm * pow(1.0 - z, 3.0) * (0.04 + smoothstep(-0.1, 0.5, ndl) * 1.1);
    float aa = 1.5 / (uRes.y * r);
    cover = 1.0 - smoothstep(1.0 - aa, 1.0, d);
    col = mix(col, disc, cover);
  }
  return col;
}

// Planetary rings in a tilted plane; front tells which half passes in front of the planet.
vec4 rings(vec2 uv, vec2 c, float r, out float front) {
  vec2 q = rot(-0.38) * ((uv - c) / r);
  front = step(q.y, 0.0);
  vec2 e = vec2(q.x, q.y / 0.2);
  float rr = length(e);
  float band = smoothstep(1.3, 1.42, rr) * (1.0 - smoothstep(2.15, 2.35, rr));
  float gap = smoothstep(0.015, 0.05, abs(rr - 1.83));
  float stripes = 0.45 + 0.55 * noise(vec2(rr * 26.0, 1.0));
  vec3 tint = mix(vec3(0.85, 0.62, 0.95), vec3(1.0, 0.82, 0.62), noise(vec2(rr * 7.0, 3.0)));
  float light = 0.35 + 0.65 * (1.0 - smoothstep(-0.4, 0.6, q.x / 2.3));
  return vec4(tint * light, band * gap * stripes * 0.75);
}

// ---------- the shattering ----------
// The black hole breaks into ~30 jagged pieces. The cells come from 3 rings of sectors, but the ring
// boundaries wobble and the cuts curve, with each boundary shared by its neighbours so the pieces
// still fit together like a cracked rock. Each piece flies outwards, spins and grows as it comes
// towards the camera. For every pixel we undo each nearby piece's motion and test whether the
// point lands inside that piece's original cell.

// Radius of ring boundary k (0..3) in direction dir: wobbly, but the same for both neighbours.
float ringEdge(int k, vec2 dir, float R0) {
  float fk = float(k);
  if (k == 0) return -1.0;
  float wob = (noise(dir * 1.8 + fk * 7.3) - 0.5) * (k == 3 ? 0.08 : 0.22);
  return R0 * (fk / 3.0 + wob);
}

// Angle of the cut between sectors j-1 and j of ring k, curving with the radius.
float cutAngle(float fk, float fj, float fn, float span, float jit, float r, float R0) {
  // The curve uses the wrapped index, so the last cut of a ring meets the first one exactly.
  return (fj + jit) * span + sin(r / R0 * 5.0 + mod(fj, fn) * 1.7 + fk) * span * 0.2;
}

vec3 shards(vec2 p, vec2 c0, float R0, float e, out float cover) {
  cover = 0.0;
  vec3 col = vec3(0.0);
  float heat = 1.0 - smoothstep(0.0, 0.5, e);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    int n = 4 + k * 5;
    float fn = float(n);
    float span = TAU / fn;
    float jit = hash12(vec2(fk, 7.0));
    for (int j = 0; j < 14; j++) {
      if (j >= n) break;
      float fj = float(j);
      vec2 id = vec2(fk, fj);
      float h = hash12(id * 1.7 + 3.1);
      float h2 = hash12(id * 2.3 + 9.4);
      float amid = (fj + jit + 0.5) * span;
      float rmid = k == 0 ? R0 * 0.18 : R0 * (fk + 0.5) / 3.0;
      vec2 cdir = vec2(cos(amid), sin(amid));
      float fly = e * (0.5 + h * 1.6) * (0.7 + fk * 0.35);
      float grow = 1.0 + e * e * (1.0 + h2 * 3.0);
      float spin = e * (h - 0.5) * 7.0;
      vec2 home = c0 + cdir * rmid;
      vec2 now = c0 + cdir * (rmid + fly) + vec2(0.0, -e * e * 0.15 * h2);
      float size = max(R0 / 3.0, rmid * span) * grow * 1.6;
      vec2 d = p - now;
      if (dot(d, d) > size * size) continue;

      // Back to where this point was before the explosion.
      vec2 q = rot(-spin) * d / grow + home;
      vec2 dq = q - c0;
      float r = length(dq);
      vec2 qdir = dq / max(r, 1e-5);
      float rin = ringEdge(k, qdir, R0);
      float rout = ringEdge(k + 1, qdir, R0);
      if (r < rin || r > rout) continue;
      float ang = atan(dq.y, dq.x);
      float cutA = cutAngle(fk, fj, fn, span, jit, r, R0);
      float cutB = cutAngle(fk, fj + 1.0, fn, span, jit, r, R0);
      float rel = mod(ang - cutA, TAU);
      float width = cutB - cutA;
      if (rel > width) continue;

      // Distance to the nearest crack, in screen units.
      float edge = min(rout - r, min(rel, width - rel) * r);
      if (k > 0) edge = min(edge, r - rin);
      edge *= grow;

      // Dark, faceted rock lit from the top left; molten light only in the thin cracks.
      vec2 local = (q - home) / (R0 * 0.35);
      float facet = noise(q * 26.0 + id * 3.0);
      float light = clamp(0.5 + dot(local, vec2(-0.6, 0.7)) * 0.6 + (facet - 0.5) * 0.7, 0.05, 1.2);
      float grain = noise(q * 90.0);
      vec3 c = vec3(0.05, 0.042, 0.05) * (0.35 + light) * (0.8 + grain * 0.4);
      c += vec3(0.07, 0.06, 0.09) * pow(light, 3.0);
      float crack = exp(-edge / (R0 * 0.010)) * (0.15 + heat * 1.9);
      float ember = exp(-edge / (R0 * 0.045)) * heat * 0.35;
      c += mix(vec3(1.0, 0.3, 0.04), vec3(1.0, 0.78, 0.45), heat) * (crack + ember);
      // Cooled pieces catch a little colour from the explosion behind them.
      c += spectrum(h * 3.0 + 0.6) * 0.08 * (1.0 - heat) * light;
      col = c;
      cover = 1.0 - smoothstep(0.8, 1.0, e);
    }
  }
  return col;
}

// ---------- the singularity ----------
vec3 singularity(vec2 p, float R, float t, out float occlusion) {
  float d = length(p);
  float x = (d - R) / R; // 0 at the event horizon

  // Flowing corona. Noise is sampled along the direction vector (not the angle),
  // so there is no seam; sliding the sample point inwards over time makes flames stream outwards.
  vec2 dir = p / max(d, 1e-4);
  float flow = x * 2.4 - t * 0.5;
  float n1 = fbm(dir * 1.9 + dir * flow * 0.9 + 3.1);
  float n2 = fbm(dir * 4.2 + dir * flow * 1.9 + n1 * 1.4 + 7.3);
  float flame = n1 * n2;

  float rim = exp(-abs(x) * mix(55.0, 22.0, n2));
  float corona = exp(-max(x, 0.0) * mix(9.0, 2.2, flame * 1.6)) * smoothstep(-0.015, 0.02, x);
  float rays = pow(fbm(dir * 7.5 + vec2(t * 0.02, -t * 0.015)), 3.0) * exp(-max(x, 0.0) * 1.6) * smoothstep(0.0, 0.1, x);

  vec3 hot = vec3(1.0, 0.94, 0.82);
  vec3 orange = vec3(1.0, 0.44, 0.07);
  vec3 deep = vec3(0.55, 0.07, 0.02);

  vec3 col = hot * rim * 1.7;
  col += mix(deep, orange, smoothstep(0.2, 0.7, n2)) * corona * 1.25;
  col += orange * rays * 0.9;

  // Tilted accretion disk with Doppler-ish brightening on one side.
  float tilt = 0.17;
  vec2 q = vec2(p.x * 0.985 + p.y * 0.17, p.y - p.x * 0.06);
  vec2 qd = vec2(q.x, q.y / tilt);
  float dd = length(qd) / R;
  // Branch cut of atan placed along the back of the disk (+y), which the hole always hides.
  float da = atan(qd.x, -qd.y);
  float band = smoothstep(1.12, 1.4, dd) * smoothstep(3.2, 1.6, dd);
  // Gas: stretched along the orbit (low angular, high radial frequency), sheared over time.
  float swirl = fbm(vec2(da * 2.0 - t * 0.35, dd * 3.0));
  float gas = fbm(vec2(da * 3.0 - t * 0.7 + swirl * 1.2, dd * 16.0 - swirl * 2.0));
  float doppler = 1.0 + 0.7 * (-qd.x / max(length(qd), 1e-3));
  float disk = band * (0.2 + gas * gas * 1.9) * doppler;
  vec3 diskCol = mix(orange, hot, smoothstep(2.1, 1.25, dd) * gas) * disk * 1.1;

  // Back half of the disk is hidden by the hole, the front half passes over it.
  float front = step(0.0, -q.y);
  occlusion = smoothstep(R * 0.985, R * 0.93, d);
  col += diskCol * mix(1.0 - occlusion, 1.0, front);

  // Lensed photon ring hugging the horizon.
  col += hot * exp(-abs(x + 0.03) * 140.0) * 0.9;
  return col;
}

void main() {
  vec2 uv0 = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;
  float s = clamp(uLaunch, 0.0, 1.0);
  float sing = uSingularity;
  float aspect = uRes.x / uRes.y;

  // ---------- timeline (all scroll-driven; scrolling slowly plays it in slow motion) ----------
  const float IMPACT = 0.3;
  float travel = smoothstep(0.0, 0.3, s);
  float unstable = smoothstep(0.06, 0.3, s);
  float hit = smoothstep(IMPACT - 0.004, IMPACT + 0.004, s) * sing;
  float shatter = smoothstep(IMPACT + 0.02, 0.8, s);
  float blast = smoothstep(IMPACT + 0.01, 0.62, s);
  float settle = smoothstep(0.82, 1.0, s);
  float singFade = (1.0 - hit) * sing;
  float infallAmt = smoothstep(0.02, 0.2, s) * (1.0 - hit) * sing;

  // ---------- camera: impact shake, roll, and flying forward towards a wandering vanishing point ----
  float shakeAmt = exp(-pow((s - IMPACT - 0.012) / 0.022, 2.0)) * sing;
  vec2 shake = vec2(sin(t * 71.0), cos(t * 59.0)) * 0.014 * shakeAmt;
  float afterIn = smoothstep(0.0, 0.6, uAfter);
  float roll = sin(s * 5.0) * 0.11 * blast * sing + sin(uAfter * 1.1 + 0.6) * 0.07 * afterIn;
  vec2 uv = rot(roll) * (uv0 + shake);
  float depth = s * 1.4 * sing + uAfter * 0.55;
  float steer = max(smoothstep(0.3, 0.7, s) * sing, 1.0 - sing);
  vec2 vp = vec2(sin(depth * 1.3) * 0.18, sin(depth * 0.9 + 1.0) * 0.08) * steer;

  // Hole geometry: it slides from the title to the middle of the screen as you start scrolling.
  vec2 mouse = uMouse * (1.0 - travel);
  float R = min(0.155, 0.26 * aspect) * (1.0 + 0.45 * unstable);
  vec2 c = uFocus * (1.0 - smoothstep(0.0, 0.3, s)) + mouse * vec2(0.035, 0.025);

  // Gravitational lensing around the hole.
  vec2 pc = uv - c;
  float pl = max(length(pc), 1e-4);
  float lens = (R * R * 1.15) / max(pl, R * 0.6) * singFade;
  vec2 luv = uv - (pc / pl) * lens;

  // Shockwave from the explosion; inside it lies the far side.
  float rl = length(pc);
  vec2 udir = pc / max(rl, 1e-4);
  float ringR = smoothstep(IMPACT + 0.01, 0.86, s) * 2.6;
  float rr = rl + (noise(udir * 4.0 + t * 0.2) - 0.5) * 0.12 * min(ringR, 1.0);
  float reveal = mix(1.0, 1.0 - smoothstep(ringR - 0.45, ringR, rr), sing);

  // Stars stream past from the first pixel; strongest through the explosion; a gentle cruise after.
  float warp = (0.18 + 0.32 * travel + 0.25 * blast) * (1.0 - settle * 0.82) * smoothstep(0.0, 0.03, s) * sing;
  warp = max(warp, uBoost * 0.75 * max(settle, 1.0 - sing));

  // Everything ahead expands as we fly forward into it (each layer at its own depth).
  vec2 fwd = luv - vp;

  // Background: nebula. Home side is ember orange; the far side is violet, teal and magenta.
  vec2 np = fwd * exp(-depth * 0.35) * 1.1 + vec2(0.0, uDrift * 0.3) + uMouse * 0.02;
  float nb = fbm(np * 1.4 + vec2(t * 0.008, 0.0));
  float nb2 = fbm(np * 2.8 - nb * 1.5 + vec2(0.0, t * 0.012));
  vec3 nebula = mix(vec3(0.06, 0.012, 0.03), vec3(0.5, 0.14, 0.03), nb2);
  nebula *= smoothstep(0.3, 0.95, nb) * (0.42 + 0.25 * unstable * sing);
  float ember = pow(max(0.0, 1.0 - length(uv - vec2(0.0, -0.9)) * 0.75), 3.0);
  nebula += vec3(0.35, 0.08, 0.01) * ember * 0.5;
  if (reveal > 0.001) {
    float hueShift = uAfter * 0.08 + s * 0.3;
    vec3 far = mix(vec3(0.2, 0.05, 0.42), vec3(0.02, 0.36, 0.44),
                   smoothstep(0.3, 0.7, nb2 + sin(hueShift * TAU) * 0.15));
    far = mix(far, vec3(0.6, 0.06, 0.32),
              smoothstep(0.55, 0.85, nb + cos(hueShift * TAU) * 0.1) * 0.75);
    far *= smoothstep(0.25, 0.95, nb) * 0.6;
    far += vec3(0.32, 0.09, 0.02) * ember * 0.35;
    nebula = mix(nebula, far, reveal);
  }

  vec3 stars = vec3(0.0);
  stars += starLayer(fwd * exp(-depth * 0.25) + mouse * 0.01, 22.0, 1.0, t) * 0.9;
  stars += starLayer(fwd * exp(-depth * 0.45) + mouse * 0.02, 38.0, 2.0, t) * 0.65;
  stars += starLayer(fwd * exp(-depth * 0.7) + mouse * 0.035, 70.0, 3.0, t) * 0.45;
  stars *= 1.0 - warp * 0.6;
  vec3 streaks = vec3(0.0);
  if (warp > 0.002) {
    streaks = warpStreaks(uv - vp + mouse * 0.02, t, warp, max(reveal, blast * sing)) * (0.25 + warp * 1.4);
  }

  vec3 col = nebula + stars + streaks;
  if (reveal > 0.001) {
    col += galaxies(fwd * exp(-depth * 0.3) + uMouse * 0.015, t) * reveal;
  }

  // ---------- the far side: planets we fly past ----------
  if (reveal > 0.001) {
    float edge = 0.5 * aspect;
    float sc = clamp(aspect / 1.4, 0.55, 1.0);
    vec2 par = uMouse * 0.012;
    float cover;
    vec3 pcol;

    // The landing zone: a green, Earth-like planet rising from below at the end of the launch.
    float landing = settle * (1.0 - smoothstep(1.0, 1.6, uAfter)) * sing;
    if (landing > 0.001) {
      float RG = 1.05 * max(1.0, sc);
      vec2 cG = vec2(0.0, mix(-2.5, -1.4, settle) + uAfter * 0.6) + par * 0.5;
      pcol = planet(uv, cG, RG, normalize(vec3(-0.3, 0.8, 0.5)), vec3(0.1, 0.42, 0.18),
                    vec3(0.45, 0.78, 0.32), vec3(0.45, 0.75, 1.0), 4.0, 5.0, t, cover);
      col = col * (1.0 - cover * landing) + pcol * landing;
    }

    // Horizon of a huge planet that rises at the very end of the page, with a sunrise on its limb.
    float RD = 2.2;
    float rise = smoothstep(0.78, 1.0, uDrift);
    vec2 cD = vec2(0.0, mix(-3.4, -2.4, rise)) + par * 0.5;
    if (rise > 0.0) {
      pcol = planet(uv0, cD, RD, normalize(vec3(0.0, 0.35, -1.0)), vec3(0.015, 0.02, 0.05),
                    vec3(0.08, 0.1, 0.2), vec3(0.4, 0.55, 1.0), 9.0, 4.0, t, cover);
      col = col * (1.0 - cover * reveal) + pcol * reveal;
      vec2 sun = vec2(0.0, cD.y + RD);
      vec2 sd = uv0 - sun;
      float sunGlow = exp(-length(sd * vec2(0.5, 1.0)) * 9.0) * 0.9
                    + exp(-abs(sd.y) * 90.0) * exp(-abs(sd.x) * 2.5) * 0.45;
      col += vec3(1.0, 0.6, 0.25) * sunGlow * reveal * smoothstep(-0.5, -0.2, sun.y);
    }

    // Fly-bys: each planet starts small near the vanishing point, grows as we approach and slides
    // out past the edge of the screen. z runs 0 → 1 over ~2.4 screens of scrolling around its anchor.
    // Violet gas giant with rings, passing on the left near the outro.
    float zB = clamp((uAfter - 2.6 + 1.2) / 2.4, 0.0, 1.0);
    if (zB > 0.0 && zB < 1.0) {
      float g = 0.3 + zB * zB * 2.2;
      float RB = 0.2 * sc * g;
      vec2 cB = vp + vec2(-(0.12 + zB * zB * edge * 1.3), 0.06 + zB * 0.25) + par;
      float fadeB = smoothstep(0.0, 0.12, zB);
      float front;
      vec4 rg = rings(uv, cB, RB, front);
      col = mix(col, rg.rgb, rg.a * (1.0 - front) * fadeB);
      pcol = planet(uv, cB, RB, normalize(vec3(-0.7, 0.45, 0.4)), vec3(0.22, 0.07, 0.38),
                    vec3(0.85, 0.48, 0.78), vec3(0.7, 0.45, 1.0), 7.0, 1.0, t, cover);
      col = col * (1.0 - cover * fadeB) + pcol * fadeB;
      col = mix(col, rg.rgb, rg.a * front * fadeB);
    }

    // Teal ice giant passing on the right, behind the project overview, with its small moon.
    vec3 LA = normalize(vec3(0.75, 0.45, 0.35));
    float zA = clamp((uAfter - 1.7 + 1.2) / 2.4, 0.0, 1.0);
    if (zA > 0.0 && zA < 1.0) {
      float g = 0.3 + zA * zA * 2.2;
      float RA = 0.22 * sc * g;
      vec2 cA = vp + vec2(0.14 + zA * zA * edge * 1.3, -0.04 + zA * 0.2) + par;
      float fadeA = smoothstep(0.0, 0.12, zA);
      pcol = planet(uv, cA, RA, LA, vec3(0.04, 0.26, 0.34), vec3(0.4, 0.78, 0.82),
                    vec3(0.3, 0.8, 1.0), 3.0, 2.0, t, cover);
      col = col * (1.0 - cover * fadeA) + pcol * fadeA;
    }
    float zC = clamp((uAfter - 2.0 + 0.8) / 1.6, 0.0, 1.0);
    if (zC > 0.0 && zC < 1.0) {
      float g = 0.3 + zC * zC * 3.0;
      float RC = 0.04 * sc * g;
      vec2 cC = vp + vec2(0.08 + zC * zC * edge * 1.1, -0.1 - zC * 0.25) + par * 2.0;
      float fadeC = smoothstep(0.0, 0.12, zC);
      pcol = planet(uv, cC, RC, LA, vec3(0.2, 0.1, 0.07), vec3(0.75, 0.5, 0.36),
                    vec3(1.0, 0.55, 0.3), 1.5, 3.0, t, cover);
      col = col * (1.0 - cover * fadeC) + pcol * fadeC;
    }
  }

  // ---------- the explosion: flowing colour gas, shockwave and debris ----------
  float gasAmt = blast * (1.0 - settle * 0.7) * sing;
  if (gasAmt > 0.001) {
    float r = rl;
    vec2 qd = udir;
    // Plumes stream outwards: the sample point slides inwards as you scroll (and slowly over time).
    float flow = r * 1.6 - s * 5.0 - t * 0.04;
    float g1 = fbm(qd * 2.2 + vec2(flow, -flow * 0.6));
    float g2 = fbm(qd * 4.5 + vec2(-flow * 1.3, flow) + g1 * 1.6);
    float plume = smoothstep(0.35, 0.85, g1 * 0.6 + g2 * 0.6);
    float inside = 1.0 - smoothstep(ringR * 0.55, ringR * 1.05, r);
    // Hue varies smoothly with direction (atan would jump at ±180° and leave a seam).
    vec3 gasCol = spectrum(g2 * 0.9 + dot(qd, vec2(0.14, 0.09)) + s * 0.8 + 0.55);
    col += gasCol * plume * inside * gasAmt * 0.75;

    float w = 0.06 + ringR * 0.05;
    float front = exp(-pow((rr - ringR) / w, 2.0));
    float ragged = 0.6 + 0.4 * noise(udir * 10.0 + ringR * 3.0);
    col += spectrum(dot(udir, vec2(0.22, 0.12)) + s) * front * ragged * gasAmt * (1.0 - smoothstep(1.2, 2.4, ringR)) * 0.8;

    for (int i = 0; i < 2; i++) {
      float fi = float(i);
      float sa = (atan(pc.y, pc.x) / TAU + 0.5) * (90.0 + fi * 70.0);
      float cell = floor(sa);
      float hh = hash12(vec2(cell, 3.0 + fi));
      float pr = fract(hh * 7.0 + s * (1.2 + hh) + t * 0.015) * ringR * 1.1;
      float seg = (r - pr) / (0.02 + ringR * 0.06);
      float spark = smoothstep(-1.0, 0.0, seg) * (1.0 - smoothstep(0.0, 0.15, seg));
      float sw = pow(1.0 - smoothstep(0.0, 0.5, abs(fract(sa) - 0.5)), 6.0);
      col += spectrum(hh * 2.3 + fi * 0.4) * spark * sw * step(0.45, hash12(vec2(cell, 9.0 + fi))) * gasAmt * 1.2;
    }
  }

  // Matter spiralling into the hole from the first scroll.
  if (infallAmt > 0.001) {
    col += infall(pc, R, t) * infallAmt * 1.2;
  }

  // The intact black hole, growing restless until the meteor hits it.
  if (singFade > 0.001) {
    float occ;
    vec3 sh = singularity(pc, R, t + s * 6.0, occ);
    sh *= 1.0 + unstable * 0.6;
    occ *= singFade;
    col = col * (1.0 - occ) + sh * singFade + streaks * occ * 0.85;
  }

  // After the impact: the hole in pieces, flying towards the camera.
  if (hit > 0.001 && shatter < 1.0) {
    float cover;
    vec3 shard = shards(uv, c, R, shatter, cover);
    col = mix(col, shard, cover * hit);
  }

  // The meteor: comes in from the top right, speeding up, with a burning tail.
  float meteorAmt = smoothstep(0.04, 0.09, s) * (1.0 - hit) * sing;
  if (meteorAmt > 0.001) {
    float mt = smoothstep(0.05, IMPACT, s);
    mt *= 0.35 + 0.65 * mt; // speeds up as it closes in
    vec2 from = c + normalize(vec2(1.0, 0.72)) * (0.75 + 0.3 * aspect);
    vec2 mdir = normalize(c - from);
    vec2 mpos = mix(from, c - mdir * R * 0.9, mt);
    vec2 dm = uv - mpos;
    float along = dot(dm, -mdir);
    float perp = abs(dot(dm, vec2(-mdir.y, mdir.x)));
    float tailLen = 0.22 + mt * 0.55;
    float behind = max(along, 0.0); // ahead of the head there is no tail (and no division by ~0)
    float tail = step(0.0, along) * exp(-behind / tailLen) * exp(-perp / (0.006 + behind * 0.07));
    float flick = 0.7 + 0.3 * noise(vec2(behind * 30.0 - t * 25.0, perp * 80.0));
    float head = exp(-length(dm) * 38.0);
    vec3 mcol = vec3(1.0, 0.9, 0.7) * head * 3.5;
    mcol += mix(vec3(1.0, 0.6, 0.2), vec3(0.85, 0.2, 0.05), clamp(behind / tailLen, 0.0, 1.0)) * tail * flick * 1.7;
    mcol += vec3(1.0, 0.5, 0.15) * exp(-length(dm) * 9.0) * 0.3 * (0.3 + mt);
    col += mcol * meteorAmt;
  }

  // Impact flare: warm and short, a glow rather than a white flash.
  float flare = exp(-pow((s - IMPACT - 0.01) / 0.03, 2.0)) * sing;
  col += mix(vec3(1.0, 0.5, 0.15), vec3(1.0, 0.8, 0.55), exp(-rl * 8.0)) * exp(-rl * 3.5) * flare * 0.9;

  // Tone map, vignette, grain
  col = 1.0 - exp(-col * 1.25);
  float vig = 1.0 - 0.6 * pow(length(uv0 * vec2(0.75, 1.0)), 2.2);
  col *= clamp(vig, 0.0, 1.0);
  col += (hash12(gl_FragCoord.xy + fract(t * 7.3) * 113.0) - 0.5) * 0.025;
  outColor = vec4(col, 1.0);
}`;
