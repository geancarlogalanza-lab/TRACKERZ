/**
 * Ember burst — the sparks a control throws off the moment it is pressed.
 *
 * The flame in emberFire.ts is the reward: it catches once an action has
 * landed and burns for a moment. The burst is the press itself, answered at
 * once: the control's outline flashes white-hot and shatters outward into
 * sparks, as a log does when it is struck in the grate.
 *
 *   flash   sparks start on the control's own outline, white-hot, so the
 *           first frame draws its shape in light;
 *   spray   they fly out along the outline's normals and slow sharply, the
 *           fastest dragging a short tail;
 *   drift   heat lifts them as they slow, so the ring bends upward like
 *           embers off a fire, cooling from yellow through orange to red;
 *   twinkle a few four-pointed pixel stars open and close at its edge.
 *
 * Same grain, same colour ramp, same spark orange as the hearth and the GEAN
 * loader. Motion is solved in closed form from the time since the press, so
 * it looks the same at any frame rate. Pure simulation: no DOM.
 */

import type { EmberIntensity } from './emberFire'

interface Spec {
  /** Sparks per cell of outline, and the most and fewest a burst may throw. */
  density: number
  sparks: [number, number]
  /** How far a spark flies before drag stops it, in cells: [least, most]. */
  reach: [number, number]
  /** How long a spark glows, in ms: [shortest, longest]. */
  life: [number, number]
  /** Four-pointed stars at the burst's edge. */
  stars: number
}

/** The same three sizes as the flame, so an action's burst and fire agree. */
const SPECS: Record<EmberIntensity, Spec> = {
  flick: { density: 0.5, sparks: [9, 12], reach: [2.5, 7], life: [240, 480], stars: 1 },
  kindle: { density: 0.3, sparks: [14, 22], reach: [3.5, 11], life: [260, 600], stars: 2 },
  blaze: { density: 0.4, sparks: [22, 32], reach: [5, 15], life: [300, 760], stars: 3 },
}

/**
 * Drag: a spark covers ~63% of its reach in this long, then all but stops.
 * Each spark draws its own, so the ring breaks up rather than growing whole.
 */
const DRAG_MS: [number, number] = [55, 115]
/** Once slowed, heat carries a spark up at this many cells per second… */
const RISE = 17
/** …reached over about this long. */
const RISE_MS = 140
/** Free cells around the control: room to fly, and more above, to drift into. */
const MARGIN = 4
const LIFT_ROOM = 10
/** A star opens, holds and closes in this long. */
const STAR_MS = 340

interface Spark {
  /** Start, on the outline, and velocity, in cells and cells per ms. */
  x: number
  y: number
  vx: number
  vy: number
  drag: number
  life: number
  /** Peak heat; a few run a little cooler, so the ring isn't uniform. */
  heat: number
  seed: number
}

interface Star {
  x: number
  y: number
  born: number
}

/** The hearth's colour ramp, 1.5·(f, f³, f⁶): red, through orange and yellow, to white. */
function ramp(f: number): [number, number, number] {
  const f3 = f * f * f
  return [Math.min(1, 1.5 * f), Math.min(1, 1.5 * f3), Math.min(1, 1.5 * f3 * f3)]
}

const between = ([low, high]: [number, number]) => low + Math.random() * (high - low)

/**
 * A point a fraction `u` of the way round a rounded rectangle of `w`×`h`
 * cells with corner radius `r`, centred on the origin, and the outward
 * normal there.
 */
function outline(u: number, w: number, h: number, r: number): [number, number, number, number] {
  const sw = w - 2 * r
  const sh = h - 2 * r
  const arc = (Math.PI / 2) * r
  const total = 2 * sw + 2 * sh + 4 * arc
  let d = u * total
  const hw = w / 2
  const hh = h / 2
  // Top edge, left to right, then clockwise.
  const runs: [number, (t: number) => [number, number, number, number]][] = [
    [sw, (t) => [-hw + r + t, -hh, 0, -1]],
    [arc, (t) => corner(hw - r, -hh + r, -Math.PI / 2 + t / Math.max(r, 1e-6))],
    [sh, (t) => [hw, -hh + r + t, 1, 0]],
    [arc, (t) => corner(hw - r, hh - r, t / Math.max(r, 1e-6))],
    [sw, (t) => [hw - r - t, hh, 0, 1]],
    [arc, (t) => corner(-hw + r, hh - r, Math.PI / 2 + t / Math.max(r, 1e-6))],
    [sh, (t) => [-hw, hh - r - t, -1, 0]],
    [arc, (t) => corner(-hw + r, -hh + r, Math.PI + t / Math.max(r, 1e-6))],
  ]
  for (const [length, at] of runs) {
    if (d <= length) return at(d)
    d -= length
  }
  return [-hw + r, -hh, 0, -1]

  function corner(cx: number, cy: number, angle: number): [number, number, number, number] {
    const nx = Math.cos(angle)
    const ny = Math.sin(angle)
    return [cx + r * nx, cy + r * ny, nx, ny]
  }
}

export class EmberBurst {
  readonly cols: number
  readonly rows: number
  /** Where the control's centre sits on the grid. */
  readonly centreX: number
  readonly centreY: number

  private readonly sparks: Spark[] = []
  private readonly stars: Star[] = []
  private readonly heat: Float32Array
  private readonly lasts: number
  private t = 0

  /**
   * `width`×`height` is the control's size in cells; `rounded` is its corner
   * radius as a share of the shorter side (0.5 for a pill or a circle).
   */
  constructor(intensity: EmberIntensity, width: number, height: number, rounded: number) {
    const spec = SPECS[intensity]
    const w = Math.max(2, width)
    const h = Math.max(2, height)
    const r = Math.min(w, h) * Math.min(0.5, Math.max(0, rounded))
    const reachMost = spec.reach[1]

    this.cols = Math.ceil(w + 2 * (reachMost + MARGIN))
    this.rows = Math.ceil(h + 2 * (reachMost + MARGIN) + LIFT_ROOM)
    this.centreX = this.cols / 2
    this.centreY = reachMost + MARGIN + LIFT_ROOM + h / 2
    this.heat = new Float32Array(this.cols * this.rows)

    // Evenly round the outline, each nudged a little, so the first frame
    // draws the control's shape and no two bursts are quite alike.
    const perimeter = 2 * (w + h) - (8 - 2 * Math.PI) * r
    const count = Math.round(
      Math.max(spec.sparks[0], Math.min(spec.sparks[1], perimeter * spec.density)),
    )
    const turn = Math.random()
    for (let i = 0; i < count; i += 1) {
      const u = (turn + (i + 0.3 + Math.random() * 0.4) / count) % 1
      const [px, py, nx, ny] = outline(u, w, h, r)
      // Spread a little off the normal; sparks off the top leave fastest.
      const spread = (Math.random() - 0.5) * 0.5
      const dx = nx * Math.cos(spread) - ny * Math.sin(spread)
      const dy = nx * Math.sin(spread) + ny * Math.cos(spread)
      const reach = between(spec.reach) * (dy < -0.5 ? 1.15 : dy > 0.5 ? 0.7 : 1)
      const drag = between(DRAG_MS)
      this.sparks.push({
        x: px,
        y: py,
        vx: (dx * reach) / drag,
        vy: (dy * reach) / drag,
        drag,
        // Sparks thrown downward burn out first, so the eye follows the rest up.
        life: between(spec.life) * (dy > 0.5 ? 0.7 : 1),
        heat: 0.86 + Math.random() * 0.14,
        seed: Math.random() * 1000,
      })
    }

    // Stars open just outside the ring, above the control where the eye
    // goes: one dead centre, more spread to either side.
    for (let i = 0; i < spec.stars; i += 1) {
      const side = spec.stars === 1 ? 0 : (i / (spec.stars - 1)) * 2 - 1
      this.stars.push({
        x: side * (w / 2 + reachMost * 0.55) + (Math.random() - 0.5) * 2,
        y: -h / 2 - reachMost * (0.75 + Math.random() * 0.35) + Math.abs(side) * 2,
        born: 20 + i * 55 + Math.random() * 30,
      })
    }

    this.lasts = Math.max(
      ...this.sparks.map((spark) => spark.life),
      ...this.stars.map((star) => star.born + STAR_MS),
    )
  }

  /** Brings the burst to `ms` after the press. Returns whether anything moved. */
  advance(ms: number): boolean {
    const moved = ms !== this.t
    this.t = ms
    return moved
  }

  get done(): boolean {
    return this.t >= this.lasts
  }

  /**
   * Where a spark is `t` ms after the press, in grid cells: thrown out and
   * slowed by drag, lifted ever more steadily by its own heat, and swaying a
   * little once it has slowed, as the hearth's sparks do.
   */
  private position(spark: Spark, t: number): [number, number] {
    const flown = spark.drag * (1 - Math.exp(-t / spark.drag))
    const rise = (RISE / 1000) * (t - RISE_MS * (1 - Math.exp(-t / RISE_MS)))
    const sway = 0.8 * Math.sin(spark.seed + t * 0.011) * (1 - Math.exp(-t / 160))
    return [
      this.centreX + spark.x + spark.vx * flown + sway,
      this.centreY + spark.y + spark.vy * flown - rise,
    ]
  }

  /**
   * Paints the current frame. As with the flame, a dark surface takes the
   * full ramp, white-hot included, through a screen blend; a light one holds
   * the ramp between red-orange and gold and fades by opacity instead.
   */
  paint(image: ImageData, onLight: boolean): void {
    const { cols, rows, t, heat: grid } = this
    grid.fill(0)

    // Where two meet, the hotter shows.
    const plot = (fx: number, fy: number, heat: number) => {
      const x = Math.round(fx)
      const y = Math.round(fy)
      if (x < 0 || x >= cols || y < 0 || y >= rows) return
      const i = y * cols + x
      if (heat > grid[i]) grid[i] = heat
    }

    for (const spark of this.sparks) {
      const age = t / spark.life
      if (age >= 1) continue
      // White-hot for the flash, then cooling, with a flicker once it slows.
      const cooling = 1 - Math.pow(age, 0.85)
      const flicker = age < 0.35 ? 1 : 0.78 + 0.22 * Math.abs(Math.sin(spark.seed + t * 0.045))
      const heat = (t < 45 ? 1 : spark.heat * cooling) * flicker
      const [x, y] = this.position(spark, t)
      // A short tail while it's fast: where it was a frame and two ago.
      const [x1, y1] = this.position(spark, Math.max(0, t - 16))
      const [x2, y2] = this.position(spark, Math.max(0, t - 32))
      if (Math.hypot(x - x2, y - y2) >= 2) plot(x2, y2, heat * 0.35)
      if (Math.hypot(x - x1, y - y1) >= 0.8) plot(x1, y1, heat * 0.6)
      plot(x, y, heat)
    }

    // A star is a plus of light that opens to a four-pointed cross and
    // closes again: white-hot heart, gold arms, orange tips.
    for (const star of this.stars) {
      const u = (t - star.born) / STAR_MS
      if (u < 0 || u >= 1) continue
      const size = u < 0.18 ? 0 : u < 0.36 ? 1 : u < 0.64 ? 2 : u < 0.82 ? 1 : 0
      const x = this.centreX + star.x
      const y = this.centreY + star.y - u * 1.5
      const fade = u < 0.82 ? 1 : 0.7
      plot(x, y, fade)
      for (let arm = 1; arm <= size; arm += 1) {
        const heat = (arm === size && size === 2 ? 0.62 : 0.84) * fade
        plot(x - arm, y, heat)
        plot(x + arm, y, heat)
        plot(x, y - arm, heat)
        plot(x, y + arm, heat)
      }
    }

    const { data } = image
    for (let i = 0; i < grid.length; i += 1) {
      const f = Math.min(1, grid[i])
      const o = i * 4
      if (f < 0.04) {
        data[o + 3] = 0
        continue
      }
      const [r, g, b] = onLight ? ramp(0.58 + 0.3 * f) : ramp(f)
      data[o] = r * 255
      data[o + 1] = g * 255
      data[o + 2] = b * 255
      data[o + 3] = onLight ? smoothstep(0.12, 0.32, f) * 255 : 255
    }
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}
