/**
 * Ember — the small fire that answers a meaningful action.
 *
 * It belongs to the same fire as the Streak tracker's hearth and the GEAN
 * loading screen: the same coarse pixel grain, the same red-to-white-hot
 * colour ramp, the same single-pixel sparks. What it adds is a lifecycle
 * suited to a single moment rather than a fire that burns forever:
 *
 *   ignite  a heat source lights under the control that was pressed and
 *           the flame leaps up at once, white-hot at its base;
 *   lick    heat climbs a row at a time, losing a little at random and
 *           drifting sideways, so it breaks into tongues as it rises;
 *   cool    the source goes out, the flame lets go of its base and rises
 *           away, reddening as it fades;
 *   embers  a few sparks climb a little higher and wink out last.
 *
 * The flame is a heat grid propagated upward with random decay and sideways
 * jitter, the technique behind the classic Doom fire. Heat is pinched in
 * towards the centre as it rises, which is what shapes a tongue rather than
 * a wall. Pure simulation: no DOM, so it can be stepped and inspected
 * frame by frame.
 */

export type EmberIntensity = 'flick' | 'kindle' | 'blaze'

interface Spec {
  /** Width of the heat source, in cells: [fewest, most]. */
  span: [number, number]
  /** Grid height, in cells: room for the flame and the sparks above it. */
  rows: number
  /** Steps run the instant it lights, so the flame leaps up rather than grows. */
  preroll: number
  /** Steps the source burns for, counting the preroll. */
  burn: number
  /** Most heat a cell can lose per row. Sets how high the flame climbs. */
  decay: number
  /** Extra loss away from the centre line — the taper of the tongue. */
  pinch: number
  /** Sparks thrown off. */
  sparks: number
  /** Source heat. Only the very core of the base reaches white. */
  heat: number
}

/**
 * Three sizes of the same fire. A finished task flicks, a continued streak
 * kindles, and the moments that close something — a milestone, the day's
 * last streak, the last pressing task — blaze. Each is roughly half as big
 * again as the one before; none is large.
 */
const SPECS: Record<EmberIntensity, Spec> = {
  flick: { span: [4, 6], rows: 20, preroll: 3, burn: 10, decay: 0.1, pinch: 0.2, sparks: 2, heat: 0.95 },
  kindle: { span: [6, 10], rows: 30, preroll: 4, burn: 16, decay: 0.07, pinch: 0.16, sparks: 4, heat: 0.98 },
  blaze: { span: [8, 13], rows: 40, preroll: 5, burn: 24, decay: 0.05, pinch: 0.12, sparks: 9, heat: 1 },
}

/** Free cells either side of the source, for the flame to wander into. */
const MARGIN = 5

/**
 * How many steps the fire should have taken `ms` after it lit. A step lifts
 * heat one row. The fire's own clock is eased: it starts at more than twice
 * its resting pace, so the flame leaps up the instant the action lands, and
 * settles to a slower pace, so it lingers a beat as it cools rather than
 * snapping off.
 */
export function emberSteps(ms: number): number {
  const frame = 1000 / 60
  const rest = 0.8
  const rush = 1.5
  const settle = 110
  return (rest * ms + rush * settle * (1 - Math.exp(-ms / settle))) / frame
}

interface Spark {
  x: number
  y: number
  vy: number
  age: number
  life: number
  phase: number
  glow: number
}

/** The hearth's colour ramp, 1.5·(f, f³, f⁶): red, through orange and yellow, to white. */
function ramp(f: number): [number, number, number] {
  const f3 = f * f * f
  return [Math.min(1, 1.5 * f), Math.min(1, 1.5 * f3), Math.min(1, 1.5 * f3 * f3)]
}

export class EmberFire {
  readonly cols: number
  readonly rows: number
  /** Width of the heat source, in cells. */
  readonly sourceCells: number

  private readonly spec: Spec
  private heat: Float32Array
  private next: Float32Array
  private readonly sparks: Spark[] = []
  private readonly sparkTimes: number[]
  private taken = 0
  /** Where the sway starts, so no two embers burn alike. */
  private readonly seed = Math.random() * Math.PI * 2
  private hottest = 1

  constructor(intensity: EmberIntensity, sourceCells: number) {
    this.spec = SPECS[intensity]
    const [fewest, most] = this.spec.span
    this.sourceCells = Math.max(fewest, Math.min(most, Math.round(sourceCells)))
    this.cols = this.sourceCells + MARGIN * 2
    this.rows = this.spec.rows
    this.heat = new Float32Array(this.cols * this.rows)
    this.next = new Float32Array(this.cols * this.rows)
    // Sparks leave while the source burns and just after, never all at once.
    const window = this.spec.burn + 6
    this.sparkTimes = Array.from({ length: this.spec.sparks }, () =>
      Math.floor(this.spec.preroll + Math.random() * window),
    ).sort((a, b) => a - b)
    for (let i = 0; i < this.spec.preroll; i += 1) this.step()
  }

  /**
   * Brings the fire up to `ms` after it lit, on its eased clock. Takes at
   * most `limit` steps, so a long stall (a hidden tab) is not replayed.
   */
  advance(ms: number, limit = 8): void {
    const due = this.spec.preroll + emberSteps(ms)
    for (let i = 0; i < limit && this.taken < due; i += 1) this.step()
  }

  /** True once the flame has burnt out and the last spark has faded. */
  get done(): boolean {
    return this.taken > this.spec.burn && this.hottest < 0.02 && this.sparks.length === 0
  }

  /** Advances the fire by one step. */
  step(): void {
    const { cols, rows, heat, next, spec } = this
    const centre = (cols - 1) / 2
    const half = Math.max(1, this.sourceCells / 2)
    const at = (x: number, y: number) => (x < 0 || x >= cols ? 0 : heat[y * cols + x])

    // Every cell takes its heat from just below it — mostly from one cell
    // picked at random to either side, partly from the three together — and
    // loses a little. The random pick frays the edges; the shared part keeps
    // each tongue whole instead of scattered. A slow wave across the width
    // lets some columns keep their heat longer than others, which is what
    // splits the body into a few tongues that sway as they climb.
    const sway = this.taken * 0.21 + this.seed
    for (let y = 0; y < rows - 1; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const picked = at(x + Math.floor(Math.random() * 3) - 1, y + 1)
        const shared = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) / 4
        const offCentre = Math.abs(x - centre) / half
        const wave = 0.5 + 0.5 * Math.sin((x / half) * 3.4 + sway)
        const loss =
          Math.random() * spec.decay * (0.45 + 1.1 * wave) + spec.pinch * offCentre * offCentre
        next[y * cols + x] = Math.max(0, picked * 0.8 + shared * 0.2 - loss)
      }
    }

    // The source row: burning, then out. It flickers, and it is hottest at
    // its centre, so only the core of the base runs white.
    const base = (rows - 1) * cols
    const burning = this.taken < spec.burn
    for (let x = 0; x < cols; x += 1) {
      const offCentre = Math.abs(x - centre) / half
      next[base + x] =
        burning && offCentre <= 1
          ? spec.heat * (1 - 0.3 * offCentre * offCentre) * (0.86 + Math.random() * 0.22)
          : 0
    }
    this.heat = next
    this.next = heat

    // Sparks leave from the top of the flame and climb, slowing, wavering.
    while (this.sparkTimes.length > 0 && this.sparkTimes[0] <= this.taken) {
      this.sparkTimes.shift()
      this.sparks.push({
        x: centre + (Math.random() - 0.5) * this.sourceCells,
        y: rows - 1 - Math.min(this.taken, spec.burn) * 0.9 - Math.random() * 3,
        vy: 0.45 + Math.random() * 0.25,
        age: 0,
        life: 26 + Math.random() * 22,
        phase: Math.random() * Math.PI * 2,
        glow: 0.75 + Math.random() * 0.35,
      })
    }
    for (let i = this.sparks.length - 1; i >= 0; i -= 1) {
      const spark = this.sparks[i]
      spark.age += 1
      spark.y -= spark.vy
      spark.vy *= 0.975
      if (spark.age >= spark.life || spark.y < 0) this.sparks.splice(i, 1)
    }

    let hottest = 0
    for (const value of this.heat) if (value > hottest) hottest = value
    this.hottest = hottest
    this.taken += 1
  }

  /**
   * Paints the current frame. On a dark surface the fire is drawn opaque
   * for a screen blend, so black adds nothing and white-hot glows. On a
   * light one the white-hot end would vanish into the page, so the ramp is
   * held between red-orange and gold and heat becomes opacity instead.
   */
  paint(image: ImageData, onLight: boolean): void {
    const { data } = image
    const { cols, heat } = this

    for (let i = 0; i < heat.length; i += 1) {
      const f = Math.min(1, heat[i])
      const o = i * 4
      if (f < 0.02) {
        data[o + 3] = 0
        continue
      }
      const [r, g, b] = onLight ? ramp(0.58 + 0.3 * f) : ramp(f)
      data[o] = r * 255
      data[o + 1] = g * 255
      data[o + 2] = b * 255
      data[o + 3] = onLight ? smoothstep(0.12, 0.32, f) * 255 : 255
    }

    for (const spark of this.sparks) {
      const x = Math.round(spark.x + Math.sin(spark.phase + spark.age * 0.32) * 0.7)
      const y = Math.round(spark.y)
      if (x < 0 || x >= cols || y < 0 || y >= this.rows) continue
      const fade = 1 - Math.pow(spark.age / spark.life, 1.6)
      const glow = spark.glow * fade
      const o = (y * cols + x) * 4
      // The hearth's spark colour, a deep orange, brightest when new.
      data[o] = Math.min(255, 255 * glow)
      data[o + 1] = Math.min(255, 255 * 0.36 * glow)
      data[o + 2] = Math.min(255, 255 * 0.07 * glow)
      data[o + 3] = onLight ? 255 * Math.min(1, fade * 1.2) : 255
    }
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}
