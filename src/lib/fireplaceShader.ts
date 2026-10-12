/**
 * The Streak tracker's fireplace: a procedural fire rendered by a fragment
 * shader. Flames rise from the bottom centre, sparks drift up, smoke tints
 * the upper reaches. It is drawn at a small internal resolution and scaled
 * with nearest-neighbour sampling, which is where its pixel character comes
 * from and why it is cheap to run.
 *
 * "Pixel Fireplace HD" by lexaterra — https://codepen.io/lexaterra/pen/jENzYPJ
 * MIT License, Copyright (c) 2026 lexaterra.
 *
 * Simplex noise by Ian McEwan, Ashima Arts — https://github.com/ashima/webgl-noise
 * MIT License, Copyright (C) 2011 Ashima Arts.
 *
 * Changes from the original: unused Shadertoy uniforms removed; `scale` added
 * so the fire's size in the viewport is independent of the canvas resolution;
 * `floorLine` added so the fire can sit above a fixed control on phones;
 * `edge` and burningEdge() added, so the streak calendar's outline burns.
 */

export const VERTEX_SHADER = `
attribute vec3 position;
void main() {
  gl_Position = vec4(position, 1.0);
}
`

/** Noise and hashing, shared by the hearth and the burning edge. */
const NOISE = `
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

// --- Fire (lexaterra, MIT) --------------------------------------------------

float prng(in vec2 seed) {
  seed = fract(seed * vec2(5.3983, 5.4427));
  seed += dot(seed.yx, seed.xy + vec2(21.5351, 14.3137));
  return fract(seed.x * seed.y);
}

const float PI = 3.1415926535897932384626433832795;

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
  if (octaves > 3) {
    pos *= 2.0;
    off *= falloff;
    noise = (1.0 - off) * noise + off * snoise(vec3(pos));
  }
  return (1.0 + noise) / 2.0;
}

vec2 noiseStackUV(vec3 pos, int octaves, float falloff, float diff) {
  float displaceA = noiseStack(pos, octaves, falloff);
  float displaceB = noiseStack(pos + vec3(3984.293, 423.21, 5235.19), octaves, falloff);
  return vec2(displaceA, displaceB);
}
`

/**
 * A calendar's burning outline, shared by the hearth (the streak calendar)
 * and the edge-only fire (the task calendar). Needs NOISE and the time
 * uniform.
 */
const EDGE = `
uniform vec4 edge; // the calendar's outline in canvas pixels: left, bottom, right, top (right < left: none)

// --- A calendar's burning edge ----------------------------------------------
// The calendar panel sits over the canvas, so anything drawn inside its
// outline is hidden: only what burns outward shows, hugging its border.
// Worked in canvas pixels, so it has the hearth's grain. A line of coals
// runs all the way round; flames lick off it, low along the bottom,
// climbing the sides and tallest along the top, and crawl slowly round the
// edge; now and then a single-pixel ember lifts off and fades. Same noise,
// same colour ramp, same spark orange as the hearth.

// Returns the fire's colour for a dark ground (rgb) and its heat (a).
vec4 burningEdge(vec2 p) {
  if (edge.z <= edge.x) return vec4(0.0);
  vec2 outside = max(edge.xy - p, p - edge.zw);
  if (outside.x < 0.0 && outside.y < 0.0) return vec4(0.0); // under the panel
  float d = length(max(outside, 0.0));
  if (d > 20.0) return vec4(0.0);

  // Where round the outline this is, clockwise from the top-left corner,
  // so tongues can travel along the edge and round its corners.
  vec2 c = clamp(p, edge.xy, edge.zw);
  float w = edge.z - edge.x;
  float h = edge.w - edge.y;
  float s;
  if (c.y >= edge.w) s = c.x - edge.x;
  else if (c.x >= edge.z) s = w + edge.w - c.y;
  else if (c.y <= edge.y) s = w + h + edge.z - c.x;
  else s = 2.0 * w + h + c.y - edge.y;

  // Fire climbs: 0 along the bottom edge, 1 along the top.
  float up = clamp((p.y - edge.y) / max(h, 1.0), 0.0, 1.0);

  // A dim line of coals the whole way round...
  float coals = d < 1.2 ? 0.34 + 0.22 * snoise(vec3(0.3 * s, 0.0, 0.8 * time)) : 0.0;
  // ...and tongues licking off it: their length crawls round the edge, and
  // rising turbulence, stretched upward like a flame, breaks them apart
  // with dark between.
  float tongues = noiseStack(vec3(0.12 * s - 0.55 * time, 0.0, 0.3 * time), 2, 0.5);
  float churn = noiseStack(vec3(0.24 * p.x, 0.09 * p.y - 1.6 * time, 0.5 * time), 2, 0.45);
  float reach = mix(1.4, 9.0, up * up) * (0.35 + 1.3 * tongues);
  // Turbulence lengthens a lick or shrinks it to nothing, right down to the
  // edge, so the fire breaks into tongues instead of an even outline.
  float lick = reach * max(0.0, 1.6 * churn * churn - 0.1);
  float flame = lick > 0.0 ? clamp(1.0 - d / lick, 0.0, 1.0) * (0.55 + 0.5 * churn) : 0.0;
  float heat = max(coals, flame);
  float h3 = heat * heat * heat;
  vec3 fire = 1.5 * vec3(heat, h3, h3 * h3);

  // Embers drift up and away from the middle, a pixel at a time.
  float away = sign(p.x - 0.5 * (edge.x + edge.z));
  vec2 drift = p - vec2(away * 2.5 * time, 8.0 * time);
  vec2 cell = floor(drift / 5.0);
  float r = prng(cell + vec2(31.0, 7.0));
  if (r < 0.035 && d > 1.5) {
    vec2 spot = floor(vec2(fract(r * 91.7), fract(r * 57.3)) * 5.0);
    if (all(equal(floor(drift) - cell * 5.0, spot))) {
      fire = max(fire, (1.0 - d / 20.0) * 1.3 * vec3(1.0, 0.36, 0.07));
      heat = max(heat, (1.0 - d / 20.0) * 0.75);
    }
  }
  return vec4(fire, heat);
}
`

export const FRAGMENT_SHADER = `
precision highp float;

uniform vec2 resolution;  // virtual resolution the fire is laid out in
uniform float time;
uniform vec4 mouse;
uniform float scale;      // virtual pixels per canvas pixel
uniform float floorLine;  // virtual pixels the fire is raised by
${NOISE}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 offset = mouse.xy + cos(time);

  float xpart = fragCoord.x / resolution.x;
  float ypart = fragCoord.y / resolution.y;

  float clip = 210.0;
  float ypartClip = fragCoord.y / clip;
  float ypartClippedFalloff = clamp(2.0 - ypartClip, 0.0, 1.0);
  float ypartClipped = min(ypartClip, 1.0);
  float ypartClippedn = 1.0 - ypartClipped;

  float xfuel = 1.0 - abs(2.0 * xpart - 1.0);

  float timeSpeed = 0.5;
  float realTime = timeSpeed * time;

  vec2 coordScaled = 0.01 * fragCoord - 0.02 * vec2(offset.x, 0.0);
  vec3 position = vec3(coordScaled, 0.0) + vec3(1223.0, 6434.0, 8425.0);
  vec3 flow = vec3(4.1 * (0.5 - xpart) * pow(ypartClippedn, 4.0), -2.0 * xfuel * pow(ypartClippedn, 64.0), 0.0);
  vec3 timing = realTime * vec3(0.0, -1.7, 1.1) + flow;

  vec3 displacePos = vec3(1.0, 0.5, 1.0) * 2.4 * position + realTime * vec3(0.01, -0.7, 1.3);
  vec3 displace3 = vec3(noiseStackUV(displacePos, 2, 0.4, 0.1), 0.0);

  vec3 noiseCoord = (vec3(2.0, 1.0, 1.0) * position + timing + 0.4 * displace3) / 1.0;
  float noise = noiseStack(noiseCoord, 3, 0.4);

  float flames = pow(ypartClipped, 0.3 * xfuel) * pow(noise, 0.3 * xfuel);

  float f = ypartClippedFalloff * pow(1.0 - flames * flames * flames, 8.0);
  float fff = f * f * f;
  vec3 fire = 1.5 * vec3(f, fff, fff * fff);

  // smoke
  float smokeNoise = 0.5 + snoise(0.4 * position + timing * vec3(1.0, 1.0, 0.2)) / 2.0;
  vec3 smoke = vec3(0.3 * pow(xfuel, 3.0) * pow(ypart, 2.0) * (smokeNoise + 0.4 * (1.0 - noise)));

  // sparks
  float sparkGridSize = 30.0;
  vec2 sparkCoord = fragCoord - vec2(2.0 * offset.x, 190.0 * realTime);
  sparkCoord -= 30.0 * noiseStackUV(0.01 * vec3(sparkCoord, 30.0 * time), 1, 0.4, 0.1);
  sparkCoord += 100.0 * flow.xy;
  if (mod(sparkCoord.y / sparkGridSize, 2.0) < 1.0) sparkCoord.x += 0.5 * sparkGridSize;
  vec2 sparkGridIndex = vec2(floor(sparkCoord / sparkGridSize));
  float sparkRandom = prng(sparkGridIndex);
  float sparkLife = min(10.0 * (1.0 - min((sparkGridIndex.y + (190.0 * realTime / sparkGridSize)) / (24.0 - 20.0 * sparkRandom), 1.0)), 1.0);
  vec3 sparks = vec3(0.0);
  if (sparkLife > 0.0) {
    float sparkSize = xfuel * xfuel * sparkRandom * 0.08;
    float sparkRadians = 999.0 * sparkRandom * 2.0 * PI + 2.0 * time;
    vec2 sparkCircular = vec2(sin(sparkRadians), cos(sparkRadians));
    vec2 sparkOffset = (0.5 - sparkSize) * sparkGridSize * sparkCircular;
    vec2 sparkModulus = mod(sparkCoord + sparkOffset, sparkGridSize) - 0.5 * vec2(sparkGridSize);
    float sparkLength = length(sparkModulus);
    float sparksGray = max(0.0, 1.0 - sparkLength / (sparkSize * sparkGridSize));
    sparks = sparkLife * sparksGray * vec3(1.0, 0.3, 0.0);
  }

  fragColor = vec4(max(fire, sparks) + smoke, 1.0);
}
${EDGE}
void main() {
  vec3 edgeFire = burningEdge(gl_FragCoord.xy).rgb;
  vec2 coord = gl_FragCoord.xy * scale - vec2(0.0, floorLine);
  if (coord.y < 0.0) {
    gl_FragColor = vec4(edgeFire, 1.0);
    return;
  }
  vec4 color;
  mainImage(color, coord);
  gl_FragColor = vec4(max(color.rgb, edgeFire), 1.0);
}
`

/**
 * The burning edge on its own, for a page with no hearth behind it: the
 * canvas is transparent everywhere but round the calendar. On a dark page
 * the fire is light, as opaque as its brightest channel, so black adds
 * nothing. On a light page the white-hot end would vanish into the
 * background, so the ramp is held between red-orange and gold and heat
 * becomes opacity, as the click embers do (emberFire.ts).
 */
export const EDGE_FRAGMENT_SHADER = `
precision highp float;

uniform float time;
uniform float onLight;    // 1 on a light page, 0 on a dark one
${NOISE}
${EDGE}
void main() {
  vec4 fire = burningEdge(gl_FragCoord.xy);
  if (fire.a <= 0.01) {
    gl_FragColor = vec4(0.0);
    return;
  }
  if (onLight > 0.5) {
    float g = 0.58 + 0.3 * min(fire.a, 1.0);
    float g3 = g * g * g;
    vec3 colour = min(vec3(1.0), 1.5 * vec3(g, g3, g3 * g3));
    float alpha = smoothstep(0.12, 0.32, fire.a);
    gl_FragColor = vec4(colour * alpha, alpha);
  } else {
    vec3 colour = min(fire.rgb, vec3(1.0));
    gl_FragColor = vec4(colour, max(max(colour.r, colour.g), colour.b));
  }
}
`
