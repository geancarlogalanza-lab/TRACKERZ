/**
 * Colour maths for subject identity.
 *
 * Two subjects must not end up wearing colours that look alike, and "alike"
 * is a question about human vision, not about numbers: #d14b4b and #cc5050
 * are far apart in RGB arithmetic and indistinguishable on screen. So
 * distance is measured in CIELAB with CIEDE2000, the standard model for
 * perceived difference, rather than by subtracting channels.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface Hsv {
  /** 0–360 */
  h: number
  /** 0–1 */
  s: number
  /** 0–1 */
  v: number
}

type Lab = [number, number, number]

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

export function isHex(value: string): boolean {
  return /^#?[0-9a-fA-F]{6}$/.test(value.trim())
}

export function normalizeHex(value: string): string {
  const trimmed = value.trim().toLowerCase()
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min

  let h = 0
  if (d !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6)
    else if (max === gn) h = 60 * ((bn - rn) / d + 2)
    else h = 60 * ((rn - gn) / d + 4)
  }
  if (h < 0) h += 360

  return { h, s: max === 0 ? 0 : d / max, v: max }
}

export function hexToHsv(hex: string): Hsv {
  return rgbToHsv(hexToRgb(hex))
}

export function hsvToHex(hsv: Hsv): string {
  return rgbToHex(hsvToRgb(hsv))
}

// ---------------------------------------------------------------------------
// Perceptual difference
// ---------------------------------------------------------------------------

/** sRGB (0–255) to CIELAB under a D65 white point. */
function rgbToLab({ r, g, b }: Rgb): Lab {
  const linear = (channel: number) => {
    const c = channel / 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const rl = linear(r)
  const gl = linear(g)
  const bl = linear(b)

  const x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047
  const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175
  const z = (rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041) / 1.08883

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : (903.3 * t + 16) / 116)
  const fx = f(x)
  const fy = f(y)
  const fz = f(z)

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

const rad = (deg: number) => (deg * Math.PI) / 180

/**
 * CIEDE2000. Roughly: 1 is the smallest difference a person can see side by
 * side, 2–3 is noticeable on a careful look, and the twenties are where two
 * small dots read as plainly different colours at a glance.
 */
export function deltaE(hexA: string, hexB: string): number {
  const [l1, a1, b1] = rgbToLab(hexToRgb(hexA))
  const [l2, a2, b2] = rgbToLab(hexToRgb(hexB))

  const c1 = Math.hypot(a1, b1)
  const c2 = Math.hypot(a2, b2)
  const cBar = (c1 + c2) / 2
  const cBar7 = Math.pow(cBar, 7)
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + Math.pow(25, 7))))

  const a1p = (1 + g) * a1
  const a2p = (1 + g) * a2
  const c1p = Math.hypot(a1p, b1)
  const c2p = Math.hypot(a2p, b2)

  const hue = (b: number, a: number) => {
    if (a === 0 && b === 0) return 0
    const angle = (Math.atan2(b, a) * 180) / Math.PI
    return angle < 0 ? angle + 360 : angle
  }
  const h1p = hue(b1, a1p)
  const h2p = hue(b2, a2p)

  const dLp = l2 - l1
  const dCp = c2p - c1p

  let dhp = 0
  if (c1p * c2p !== 0) {
    dhp = h2p - h1p
    if (dhp > 180) dhp -= 360
    else if (dhp < -180) dhp += 360
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(rad(dhp / 2))

  const lBarP = (l1 + l2) / 2
  const cBarP = (c1p + c2p) / 2

  let hBarP: number
  if (c1p * c2p === 0) {
    hBarP = h1p + h2p
  } else if (Math.abs(h1p - h2p) <= 180) {
    hBarP = (h1p + h2p) / 2
  } else {
    hBarP = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2
  }

  const t =
    1 -
    0.17 * Math.cos(rad(hBarP - 30)) +
    0.24 * Math.cos(rad(2 * hBarP)) +
    0.32 * Math.cos(rad(3 * hBarP + 6)) -
    0.2 * Math.cos(rad(4 * hBarP - 63))

  const cBarP7 = Math.pow(cBarP, 7)
  const rC = 2 * Math.sqrt(cBarP7 / (cBarP7 + Math.pow(25, 7)))
  const sL = 1 + (0.015 * Math.pow(lBarP - 50, 2)) / Math.sqrt(20 + Math.pow(lBarP - 50, 2))
  const sC = 1 + 0.045 * cBarP
  const sH = 1 + 0.015 * cBarP * t
  const rT = -Math.sin(rad(2 * (30 * Math.exp(-Math.pow((hBarP - 275) / 25, 2))))) * rC

  const kL = dLp / sL
  const kC = dCp / sC
  const kH = dHp / sH

  return Math.sqrt(kL * kL + kC * kC + kH * kH + rT * kC * kH)
}

// ---------------------------------------------------------------------------
// Contrast
// ---------------------------------------------------------------------------

function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(hexA: string, hexB: string): number {
  const a = luminance(hexA)
  const b = luminance(hexB)
  const [light, dark] = a > b ? [a, b] : [b, a]
  return (light + 0.05) / (dark + 0.05)
}

/**
 * Ink that stays readable on `background`. Used wherever a subject's colour
 * sits behind text, so a pale yellow gets dark text and a deep navy gets
 * light text without anyone choosing.
 */
export function readableInk(background: string): string {
  return contrastRatio(background, '#ffffff') >= contrastRatio(background, '#14161c')
    ? '#ffffff'
    : '#14161c'
}

// ---------------------------------------------------------------------------
// Subject colour policy
// ---------------------------------------------------------------------------

export interface TakenColor {
  name: string
  color: string
}

/**
 * How far apart two subject colours must be.
 *
 * Calibrated against the palette this app shipped with: its closest pair sat
 * at 13.6, so 12 keeps every colour already in use valid while firmly
 * rejecting the near-misses — two blues four points apart in hex land around
 * 1.5, well under the bar.
 */
export const MIN_DISTINCT = 12

/** The taken colour this one is closest to, when it is closer than allowed. */
export function nearestConflict(
  hex: string,
  taken: TakenColor[],
): { name: string; distance: number } | null {
  let closest: { name: string; distance: number } | null = null
  for (const item of taken) {
    const distance = deltaE(hex, item.color)
    if (distance < MIN_DISTINCT && (closest === null || distance < closest.distance)) {
      closest = { name: item.name, distance }
    }
  }
  return closest
}

/**
 * Colours that all but vanish against one of the app's two backgrounds — a
 * near-white or a near-black. Advisory only: a dot still gets a hairline
 * ring so it reads, and nobody is stopped from picking the colour they want.
 */
export function isFaintOnSurfaces(hex: string): boolean {
  return contrastRatio(hex, '#ffffff') < 1.25 || contrastRatio(hex, '#191d25') < 1.25
}

/**
 * A starting colour as far from the ones already in use as the hue circle
 * allows, so a new subject usually lands somewhere valid without anyone
 * having to hunt for a gap.
 */
export function suggestColor(taken: TakenColor[]): string {
  if (taken.length === 0) return '#3b62d9'

  let best = '#3b62d9'
  let bestDistance = -1
  for (let h = 0; h < 360; h += 4) {
    for (const [s, v] of [
      [0.78, 0.85],
      [0.92, 0.62],
      [0.55, 0.95],
    ]) {
      const candidate = hsvToHex({ h, s, v })
      // Never suggest something the form would immediately warn about.
      if (isFaintOnSurfaces(candidate)) continue
      let nearest = Infinity
      for (const item of taken) nearest = Math.min(nearest, deltaE(candidate, item.color))
      if (nearest > bestDistance) {
        bestDistance = nearest
        best = candidate
      }
    }
  }
  return best
}
