/**
 * The fire inside GEAN.
 *
 * Built from the same parts as the Streak tracker's hearth, so the two read
 * as one world: lexaterra's layered, self-displacing simplex noise rising
 * through the volume, the hearth's flame profile — white-hot at the base,
 * breaking into tongues at the top — its red-to-white colour ramp, and
 * single-pixel sparks. It is rendered at a coarse resolution and scaled up
 * with hard edges, which is where the pixel grain comes from.
 *
 * What differs is the geometry. The hearth burns up from the bottom of the
 * screen; this fire fills a volume to a level (`fill`), so its body always
 * reaches the surface and its tongues are cut off just above it. Whatever
 * lies above the surface is empty headspace: dark, a little smoke, and
 * sparks that fade before they reach the lid. The canvas clips all of it to
 * the letterforms, so nothing ever leaves them.
 *
 * The noise functions below are copied rather than shared, so the hearth's
 * own shader file stays exactly as it is.
 *
 * "Pixel Fireplace HD" by lexaterra — https://codepen.io/lexaterra/pen/jENzYPJ
 * MIT License, Copyright (c) 2026 lexaterra.
 * Simplex noise by Ian McEwan, Ashima Arts — https://github.com/ashima/webgl-noise
 * MIT License, Copyright (C) 2011 Ashima Arts.
 */

export const GEAN_FIRE_VERTEX = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

export const GEAN_FIRE_FRAGMENT = `
precision highp float;

uniform vec2 res;       // fire texture size, pixels
uniform float aspect;   // fire region width / height
uniform float time;     // seconds
uniform float fill;     // surface height, 0-1 of the letter height
uniform float heat;     // ~0.4 smouldering, 1 burning, >1 flaring
uniform float sparks;   // 0 none, 1 steady, >1 a burst

// --- Simplex noise (Ashima Arts, MIT) ---------------------------------------

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = inversesqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// --- The hearth's building blocks (lexaterra, MIT) --------------------------

float prng(in vec2 seed) {
  seed = fract(seed * vec2(5.3983, 5.4427));
  seed += dot(seed.yx, seed.xy + vec2(21.5351, 14.3137));
  return fract(seed.x * seed.y);
}

float noiseStack(vec3 pos, int octaves, float falloff) {
  float noise = snoise(vec3(pos));
  float off = 1.0;
  if (octaves > 1) {
    pos *= 2.0;
    off *= falloff;
    noise = (1.0 - off) * noise + off * snoise(vec3(pos));
  }
  if (octaves > 2) {
    pos *= 2.0;
    off *= falloff;
    noise = (1.0 - off) * noise + off * snoise(vec3(pos));
  }
  return (1.0 + noise) / 2.0;
}

vec2 noiseStackUV(vec3 pos, int octaves, float falloff) {
  return vec2(
    noiseStack(pos, octaves, falloff),
    noiseStack(pos + vec3(3984.293, 423.21, 5235.19), octaves, falloff)
  );
}

// --- GEAN -------------------------------------------------------------------

void main() {
  vec2 uv = gl_FragCoord.xy / res;
  vec2 p = vec2(uv.x * aspect, uv.y);        // letter heights; y up from the base
  float rt = 0.5 * time;

  // How high the body of fire stands. At full it presses against the lid.
  float level = clamp(fill, 0.0, 1.0);
  float body = level * (0.92 + 0.12 * level);
  float lit = smoothstep(0.0, 0.03, level);  // nothing burns before loading starts

  // The hearth's turbulence: noise displaced by more noise, drifting upward.
  vec3 position = vec3(p * 2.2, 0.0) + vec3(1223.0, 6434.0, 8425.0);
  vec3 timing = rt * vec3(0.0, -1.7, 1.1);
  vec3 displacePos = vec3(1.0, 0.5, 1.0) * 2.4 * position + rt * vec3(0.01, -0.7, 1.3);
  vec3 displace = vec3(noiseStackUV(displacePos, 2, 0.4), 0.0);
  float noise = noiseStack(vec3(2.0, 1.0, 1.0) * position + timing + 0.4 * displace, 3, 0.4);

  // The hearth's flame profile, stretched so its hot body fills to the level.
  float y = p.y / max(body * 3.2, 0.01);
  float flames = pow(min(y, 1.0), 0.3) * pow(noise, 0.3);
  float f = pow(1.0 - flames * flames * flames, 6.0);

  // The surface: level plus a ragged, licking edge. Above it, no flame.
  float tongues = (noise - 0.45) * 0.2 * smoothstep(0.02, 0.12, level);
  float surface = body + tongues;
  f *= 1.0 - smoothstep(surface - 0.05, surface + 0.02, p.y);
  f *= lit * heat;

  // The hearth's colour ramp: red, through orange and yellow, to white.
  float f3 = f * f * f;
  vec3 color = 1.5 * vec3(f, f3, f3 * f3);

  // Smoke hanging in the empty headspace.
  float head = smoothstep(surface, surface + 0.12, p.y) * lit;
  float smokeNoise = noiseStack(vec3(p * 1.4, 0.0) + timing * vec3(1.0, 0.6, 0.3), 2, 0.5);
  color += vec3(0.09, 0.075, 0.07) * head * smokeNoise * min(heat, 1.0);

  // Sparks: single pixels drifting up out of the fire, fading before the lid.
  vec2 cell = floor(gl_FragCoord.xy - vec2(sin(gl_FragCoord.y * 0.11 + time * 1.3) * 1.6, time * 16.0));
  float r = prng(cell * 0.0713 + 3.17);
  float band = smoothstep(surface - 0.03, surface + 0.02, p.y)
             * (1.0 - smoothstep(surface + 0.04, surface + 0.42, p.y));
  float spark = step(1.0 - 0.009 * sparks, r) * band * lit;
  color = max(color, spark * vec3(1.0, 0.34, 0.06) * (0.7 + 0.6 * fract(r * 53.0)) * min(heat, 1.4));

  gl_FragColor = vec4(color, 1.0);
}
`
