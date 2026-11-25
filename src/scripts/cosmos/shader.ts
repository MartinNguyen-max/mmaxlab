/**
 * Full-screen WebGL2 shader: "the singularity".
 *
 * Scene timeline (driven by `uLaunch`, 0 → 1 while scrolling the hero + launch section):
 *   0.00–0.30  a black hole with a flowing orange corona and a tilted accretion disk
 *   0.18–0.70  the camera falls into it; matter spirals into the horizon
 *   ~0.70      the hole goes supernova: a flash and a chromatic shockwave
 *   0.70–0.85  the shockwave sweeps outwards and reveals a new, multicoloured universe
 *   0.45–1.00  warp-speed star streaks that settle into a calm drift
 * After the launch, `uAfter` (viewports scrolled past it) floats planets past with parallax,
 * and `uDrift` (whole-page progress) raises a planet horizon at the very end of the page.
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
uniform float uLight;
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
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;
  float s = clamp(uLaunch, 0.0, 1.0);

  // Phases
  float zoom = smoothstep(0.24, 0.74, s);
  float warp = smoothstep(0.42, 0.7, s) * (1.0 - smoothstep(0.78, 1.0, s) * 0.92);
  float singFade = (1.0 - smoothstep(0.64, 0.76, s)) * uSingularity;
  float flash = exp(-pow((s - 0.705) / 0.028, 2.0)) * 0.6 * uSingularity;
  float infallAmt = smoothstep(0.16, 0.4, s) * (1.0 - smoothstep(0.6, 0.7, s)) * uSingularity;

  // Supernova shockwave: an expanding, slightly ragged ring. Inside it lies the new universe.
  float rl = length(uv);
  vec2 udir = uv / max(rl, 1e-4);
  float ringR = max(0.0, s - 0.695) * 7.0;
  float rr = rl + (noise(udir * 5.0 + t * 0.3) - 0.5) * 0.08 * min(ringR, 1.0);
  float reveal = mix(1.0, 1.0 - smoothstep(ringR - 0.3, ringR, rr), uSingularity);

  // Fast scrolling after the launch (or on other pages) kicks the ship back into warp.
  float cruising = max(smoothstep(0.8, 0.98, s), 1.0 - uSingularity);
  warp = max(warp, uBoost * 0.75 * cruising);

  vec2 mouse = uMouse * (1.0 - zoom);
  vec2 drift = vec2(0.0, uDrift * 0.9);

  // Hole geometry (also needed for lensing the background).
  // On portrait screens, size the hole by width so it frames the title instead of swallowing it.
  float aspect = uRes.x / uRes.y;
  float R = min(0.155, 0.26 * aspect) * exp(zoom * zoom * 6.2);
  vec2 c = uFocus * (1.0 - zoom) + mouse * vec2(0.035, 0.025);

  // Gravitational lensing: the background is sampled closer to the hole than it really is,
  // so stars and nebula smear into arcs around the horizon (an Einstein ring).
  vec2 pc = uv - c;
  float pl = max(length(pc), 1e-4);
  float lens = (R * R * 1.15) / max(pl, R * 0.6) * singFade;
  vec2 luv = uv - (pc / pl) * lens;

  // Background: nebula. Home side is ember orange; the far side is violet, teal and magenta.
  vec2 np = luv * 1.1 + drift * 0.6 + uMouse * 0.02;
  float nb = fbm(np * 1.4 + vec2(t * 0.008, 0.0));
  float nb2 = fbm(np * 2.8 - nb * 1.5 + vec2(0.0, t * 0.012));
  vec3 nebula = mix(vec3(0.06, 0.012, 0.03), vec3(0.5, 0.14, 0.03), nb2);
  nebula *= smoothstep(0.3, 0.95, nb) * 0.42;
  float ember = pow(max(0.0, 1.0 - length(uv - vec2(0.0, -0.9)) * 0.75), 3.0);
  nebula += vec3(0.35, 0.08, 0.01) * ember * 0.5;
  if (reveal > 0.001) {
    float hueShift = uAfter * 0.08;
    vec3 far = mix(vec3(0.2, 0.05, 0.42), vec3(0.02, 0.36, 0.44),
                   smoothstep(0.3, 0.7, nb2 + sin(hueShift * TAU) * 0.15));
    far = mix(far, vec3(0.6, 0.06, 0.32),
              smoothstep(0.55, 0.85, nb + cos(hueShift * TAU) * 0.1) * 0.75);
    far *= smoothstep(0.25, 0.95, nb) * 0.55;
    far += vec3(0.32, 0.09, 0.02) * ember * 0.35;
    nebula = mix(nebula, far, reveal);
  }

  // Stars with parallax
  vec3 stars = vec3(0.0);
  stars += starLayer(luv + drift * 0.15 + mouse * 0.01, 22.0, 1.0, t) * 0.9;
  stars += starLayer(luv + drift * 0.3 + mouse * 0.02, 38.0, 2.0, t) * 0.65;
  stars += starLayer(luv + drift * 0.55 + mouse * 0.035, 70.0, 3.0, t) * 0.45;
  stars *= 1.0 - warp * 0.7;
  vec3 streaks = vec3(0.0);
  if (warp > 0.002) {
    streaks = warpStreaks(uv + mouse * 0.02, t, warp, reveal) * (0.25 + warp * 1.6);
  }

  vec3 col = nebula + stars + streaks;
  if (reveal > 0.001) {
    col += galaxies(luv + vec2(0.0, uAfter * 0.12) + uMouse * 0.015, t) * reveal;
  }

  // ---------- the far side: planets drifting past ----------
  if (reveal > 0.001) {
    float edge = 0.5 * aspect;
    float sc = clamp(aspect / 1.4, 0.55, 1.0);
    vec2 par = uMouse * 0.012;
    float cover;
    vec3 pcol;

    // Horizon of a huge planet that rises at the end of the page, with a sunrise on its limb.
    float RD = 2.2;
    float rise = smoothstep(0.78, 1.0, uDrift);
    vec2 cD = vec2(0.0, mix(-3.4, -2.4, rise)) + par * 0.5;
    if (rise > 0.0) {
      pcol = planet(uv, cD, RD, normalize(vec3(0.0, 0.35, -1.0)), vec3(0.015, 0.02, 0.05),
                    vec3(0.08, 0.1, 0.2), vec3(0.4, 0.55, 1.0), 9.0, 4.0, t, cover);
      col = col * (1.0 - cover * reveal) + pcol * reveal;
      vec2 sun = vec2(0.0, cD.y + RD);
      vec2 sd = uv - sun;
      float sunGlow = exp(-length(sd * vec2(0.5, 1.0)) * 9.0) * 0.9
                    + exp(-abs(sd.y) * 90.0) * exp(-abs(sd.x) * 2.5) * 0.45;
      col += vec3(1.0, 0.6, 0.25) * sunGlow * reveal * smoothstep(-0.5, -0.2, sun.y);
    }

    // Violet gas giant with rings (left).
    float RB = 0.22 * sc;
    vec2 cB = vec2(-edge * 0.8, 0.05 + (uAfter - 2.5) * 0.42) + par;
    float front;
    vec4 rg = rings(uv, cB, RB, front);
    col = mix(col, rg.rgb, rg.a * (1.0 - front) * reveal);
    pcol = planet(uv, cB, RB, normalize(vec3(-0.7, 0.45, 0.4)), vec3(0.22, 0.07, 0.38),
                  vec3(0.85, 0.48, 0.78), vec3(0.7, 0.45, 1.0), 7.0, 1.0, t, cover);
    col = col * (1.0 - cover * reveal) + pcol * reveal;
    col = mix(col, rg.rgb, rg.a * front * reveal);

    // Teal ice giant (right) and its small rocky moon, which is closer and moves faster.
    float RA = 0.24 * sc;
    vec2 cA = vec2(edge * 0.82, 0.08 + (uAfter - 1.0) * 0.42) + par;
    vec3 LA = normalize(vec3(0.75, 0.45, 0.35));
    pcol = planet(uv, cA, RA, LA, vec3(0.04, 0.26, 0.34), vec3(0.4, 0.78, 0.82),
                  vec3(0.3, 0.8, 1.0), 3.0, 2.0, t, cover);
    col = col * (1.0 - cover * reveal) + pcol * reveal;

    float RC = 0.045 * sc;
    vec2 cC = vec2(edge * 0.56, -0.1 + (uAfter - 1.3) * 0.75) + par * 2.0;
    pcol = planet(uv, cC, RC, LA, vec3(0.2, 0.1, 0.07), vec3(0.75, 0.5, 0.36),
                  vec3(1.0, 0.55, 0.3), 1.5, 3.0, t, cover);
    col = col * (1.0 - cover * reveal) + pcol * reveal;
  }

  // Matter spiralling in while we fall towards the hole.
  if (infallAmt > 0.001) {
    col += infall(pc, R, t) * infallAmt * 1.1;
  }

  // Singularity
  float occlusion = 0.0;
  if (singFade > 0.001) {
    vec3 sing = singularity(pc, R, t, occlusion);
    occlusion *= singFade;
    col = col * (1.0 - occlusion) + sing * singFade + streaks * occlusion * 0.85;
  }

  // Light burst from the centre as we pass the horizon.
  float burst = exp(-rl * 1.7);
  col *= 1.0 - flash * 0.6; // streaks dissolve into the light
  col += flash * (vec3(1.0, 0.9, 0.78) * burst * 4.0 + vec3(1.0, 0.45, 0.12) * burst * 1.2);

  // The shockwave itself: a chromatic ring plus debris flung outwards.
  float shockAmt = uSingularity * smoothstep(0.0, 0.06, ringR) * (1.0 - smoothstep(0.7, 1.7, ringR));
  if (shockAmt > 0.001) {
    float w = 0.03 + ringR * 0.035;
    vec3 ring = vec3(
      exp(-pow((rr - ringR * 1.03) / w, 2.0)),
      exp(-pow((rr - ringR) / w, 2.0)),
      exp(-pow((rr - ringR * 0.97) / w, 2.0))
    );
    float ragged = 0.55 + 0.45 * noise(udir * 14.0 + ringR * 4.0);
    col += ring * vec3(1.0, 0.7, 1.0) * ragged * shockAmt * 1.6;
    // Afterglow inside the ring.
    col += mix(vec3(0.55, 0.2, 1.0), vec3(1.0, 0.3, 0.55), min(rl / max(ringR, 1e-3), 1.0))
         * (1.0 - smoothstep(0.0, ringR, rl)) * shockAmt * 0.2;
    // Debris: radial sparks just behind the front.
    float sa = (atan(uv.y, uv.x) / TAU + 0.5) * 150.0;
    float cell = floor(sa);
    float hh = hash12(vec2(cell, 3.0));
    float seg = (rl - ringR * (0.55 + 0.5 * hh)) / (0.03 + ringR * 0.1);
    float spark = smoothstep(-1.0, 0.0, seg) * (1.0 - smoothstep(0.0, 0.12, seg));
    float sw = pow(1.0 - smoothstep(0.0, 0.5, abs(fract(sa) - 0.5)), 6.0);
    col += spectrum(hh * 2.3) * spark * sw * step(0.5, hash12(vec2(cell, 9.0))) * shockAmt * 1.4;
  }

  // Tone map, vignette, grain
  col = 1.0 - exp(-col * 1.25);
  float vig = 1.0 - 0.6 * pow(length(uv * vec2(0.75, 1.0)), 2.2);
  col *= clamp(vig, 0.0, 1.0);

  // Light theme: paper, with the scene printed as ink (orange at home, its own hue on the far side).
  // The hole becomes a slightly deeper paper tone (an annular eclipse), so dark text keeps contrast.
  vec3 paper = vec3(0.965, 0.945, 0.918);
  float ink = clamp(dot(col, vec3(0.35, 0.5, 0.15)) * 1.5, 0.0, 1.0);
  vec3 hue = col / max(max(col.r, max(col.g, col.b)), 1e-3);
  vec3 inkCol = mix(vec3(0.95, 0.42, 0.06), hue * 0.78, reveal * 0.65);
  vec3 lightCol = mix(paper, inkCol, ink * 0.9);
  lightCol = mix(lightCol, vec3(0.9, 0.86, 0.81), occlusion);
  col = mix(col, lightCol, uLight);

  col += (hash12(gl_FragCoord.xy + fract(t * 7.3) * 113.0) - 0.5) * 0.025;
  outColor = vec4(col, 1.0);
}`;
