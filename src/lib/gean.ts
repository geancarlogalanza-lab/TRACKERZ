/**
 * GEAN — the letterforms of the loading screen.
 *
 * These are drawn, not typeset. The loader treats each letter as a vessel
 * with fire inside it, and that only reads if the strokes are thick enough
 * to hold a visible volume: here every stroke is 20–30% of the letter's
 * height, far heavier than any font's Black weight. Drawing them also means
 * the first frame needs no font download, and one set of contours serves
 * both the static first paint in index.html and the live canvas.
 *
 * Coordinates are in "units": the cap height is 100, y runs downward, and
 * the four letters span x 0–380. Pure data and string builders only — this
 * file is imported by vite.config.ts at build time as well as by the app.
 */

type Point = [number, number]

/** A contour vertex and the radius its corner is rounded to. */
type Vertex = [x: number, y: number, radius: number]

/** Letter bounds: the fire fills exactly this box, clipped to the letters. */
export const GEAN_BOUNDS = { x: 0, y: 0, width: 380, height: 100 }

/** Room around the letters for the wall's stroke. */
export const GEAN_PAD = 4
export const GEAN_VIEWBOX = {
  x: -GEAN_PAD,
  y: -GEAN_PAD,
  width: GEAN_BOUNDS.width + GEAN_PAD * 2,
  height: GEAN_BOUNDS.height + GEAN_PAD * 2,
}

/** The vessel wall, in units. */
export const GEAN_WALL = 1.2

/**
 * Each letter is one outer contour (and the A a hole for its counter).
 * Outer corners round generously and inner ones only slightly, so the
 * shapes read as moulded containers rather than stencils.
 */
const LETTERS: Vertex[][] = [
  // G — a rounded bowl, open on the right, with an inward bar.
  [
    [0, 0, 30], [90, 0, 14], [90, 28, 6], [30, 28, 6], [30, 72, 6], [62, 72, 4],
    [62, 66, 3], [48, 66, 4], [48, 46, 4], [90, 46, 6], [90, 100, 30], [0, 100, 30],
  ],
  // E
  [
    [104, 0, 10], [176, 0, 8], [176, 24, 8], [134, 24, 4], [134, 38, 4], [166, 38, 8],
    [166, 62, 8], [134, 62, 4], [134, 76, 4], [176, 76, 8], [176, 100, 8], [104, 100, 10],
  ],
  // A — flat-topped, like a lidded vessel.
  [
    [186, 100, 6], [212, 0, 12], [260, 0, 12], [286, 100, 6], [256, 100, 5],
    [250.8, 80, 4], [221.2, 80, 4], [216, 100, 5],
  ],
  [[234.2, 30, 3], [237.8, 30, 3], [245.1, 58, 4], [226.9, 58, 4]],
  // N
  [
    [296, 0, 10], [326, 0, 6], [352, 46.4, 3], [352, 0, 8], [380, 0, 10], [380, 100, 10],
    [348, 100, 6], [324, 57.1, 3], [324, 100, 8], [296, 100, 10],
  ],
]

/** Rounds each corner with a cubic that matches a circular arc at 90°. */
function roundedContour(vertices: Vertex[]): string {
  const k = 0.5523
  const n = vertices.length
  const at = (i: number): Point => [vertices[(i + n) % n][0], vertices[(i + n) % n][1]]
  const fmt = (value: number) => Number(value.toFixed(2))
  let d = ''

  for (let i = 0; i < n; i += 1) {
    const [x, y, wanted] = vertices[i]
    const prev = at(i - 1)
    const next = at(i + 1)
    const lenPrev = Math.hypot(prev[0] - x, prev[1] - y)
    const lenNext = Math.hypot(next[0] - x, next[1] - y)
    const r = Math.min(wanted, lenPrev / 2, lenNext / 2)

    const a: Point = [x + ((prev[0] - x) / lenPrev) * r, y + ((prev[1] - y) / lenPrev) * r]
    const b: Point = [x + ((next[0] - x) / lenNext) * r, y + ((next[1] - y) / lenNext) * r]
    const c1: Point = [a[0] + (x - a[0]) * k, a[1] + (y - a[1]) * k]
    const c2: Point = [b[0] + (x - b[0]) * k, b[1] + (y - b[1]) * k]

    d += `${i === 0 ? 'M' : 'L'}${fmt(a[0])} ${fmt(a[1])}`
    d += `C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(b[0])} ${fmt(b[1])}`
  }
  return `${d}Z`
}

/** All four letters as one path. Fill and clip it with the even-odd rule. */
export const GEAN_PATH = LETTERS.map(roundedContour).join('')

/** Colours of the empty vessel, shared by the first paint and the canvas. */
export const GEAN_GLASS = { top: '#100f13', bottom: '#17110e', wall: '#34363f' }
export const GEAN_BACKDROP = '#070709'

/**
 * The static first paint: empty vessels, on screen before any JavaScript
 * has run. The canvas loader replaces it once it has drawn its own first
 * frame, at exactly the same position, so the hand-over is invisible.
 */
export function geanShellHtml(): string {
  const vb = GEAN_VIEWBOX
  return [
    '<div id="gean-shell" class="gean-stage" aria-hidden="true">',
    '<div class="gean-center">',
    `<svg class="gean-art" viewBox="${vb.x} ${vb.y} ${vb.width} ${vb.height}" xmlns="http://www.w3.org/2000/svg">`,
    '<defs><linearGradient id="gean-glass" x1="0" y1="0" x2="0" y2="1">',
    `<stop offset="0" stop-color="${GEAN_GLASS.top}"/><stop offset="1" stop-color="${GEAN_GLASS.bottom}"/>`,
    '</linearGradient></defs>',
    `<path d="${GEAN_PATH}" fill="url(#gean-glass)" fill-rule="evenodd" stroke="${GEAN_GLASS.wall}" stroke-width="${GEAN_WALL}" stroke-linejoin="round"/>`,
    '</svg>',
    '</div>',
    '</div>',
  ].join('')
}

/**
 * Layout for the stage, inlined into index.html so the first paint and the
 * canvas loader sit at identical coordinates before any stylesheet loads.
 */
export const GEAN_STAGE_CSS = `
.gean-stage{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;background:${GEAN_BACKDROP};}
.gean-center{position:relative;display:grid;place-items:center;}
.gean-art{display:block;width:min(90vw,1040px,165vh);width:min(90vw,1040px,165svh);aspect-ratio:${GEAN_VIEWBOX.width}/${GEAN_VIEWBOX.height};height:auto;}
.gean-fallback{position:absolute;top:calc(100% + 32px);left:50%;transform:translateX(-50%);width:min(88vw,360px);text-align:center;font:14px/1.5 system-ui,sans-serif;color:#a3a8b3;}
.gean-fallback p{margin:0 0 12px;}
.gean-fallback button{min-height:40px;padding:0 18px;border:0;border-radius:10px;background:#e2672d;color:#170a04;font:600 14px system-ui,sans-serif;cursor:pointer;}
`
