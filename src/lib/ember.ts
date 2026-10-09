import { EmberBurst } from './emberBurst'
import { EmberFire, type EmberIntensity } from './emberFire'

export type { EmberIntensity }

/**
 * Puts fire on screen at the control that was pressed: a burst of sparks the
 * instant it is pressed, and an ember that catches once the action lands.
 * One call per meaningful action; everything else — size, colour, timing,
 * cleanup — is decided here, so every spark and ember in the app moves the
 * same way.
 *
 * Each is its own small canvas, one canvas pixel per cell, scaled up with
 * hard edges by the browser: the hearth's grain at almost no cost. A single
 * animation loop runs only while something is alight. Nothing is drawn for
 * anyone who prefers reduced motion, while the page is hidden, or once a
 * handful are already burning; the action itself is unaffected.
 */

/** A fire simulation that can be stepped to a moment and painted. */
interface Sim {
  readonly cols: number
  readonly rows: number
  readonly done: boolean
  /** Returns whether anything moved since the last call. */
  advance(ms: number): boolean
  paint(image: ImageData, onLight: boolean): void
}

/** Where a fire's canvas goes: measured from the page, then written to it. */
interface Placement {
  /** Reads the page. Every fire measures before any fire moves. */
  measure(): void
  /** The canvas's transform for the last measurement. */
  transform(): string
}

interface Lit {
  sim: Sim
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  image: ImageData
  onLight: boolean
  startAt: number
  placement: Placement
  /** Re-measured every frame, for fire that follows its control. */
  follows: boolean
}

const MAX_LIT = 8
/** Screen pixels per cell, as in the hearth. */
const CELL_CSS = 3
/** Anything that outlives this is cleared regardless. */
const MAX_LIFE_MS = 2000

const lit: Lit[] = []
let frame = 0

/**
 * One cell, in CSS pixels, rounded so it covers a whole number of device
 * pixels — otherwise the grain comes out uneven on fractional scaling.
 */
function cellSize(): number {
  const dpr = window.devicePixelRatio || 1
  return Math.max(2, Math.round(CELL_CSS * dpr)) / dpr
}

function snap(value: number): number {
  const dpr = window.devicePixelRatio || 1
  return Math.round(value * dpr) / dpr
}

/** Light surfaces and dark ones take the fire differently; the theme says which this is. */
function isOnLight(origin: Element): boolean {
  return getComputedStyle(origin).getPropertyValue('--ember-blend').trim() !== 'screen'
}

/** Whether anything should be drawn at all, for a control at `rect`. */
function mayLight(rect: DOMRect): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  if (document.hidden || lit.length >= MAX_LIT) return false
  return rect.bottom >= 0 && rect.top <= window.innerHeight
}

function tick(now: number): void {
  // Read the page for every fire first, then write: a read after another
  // fire's write would force the browser to lay the page out again, once
  // per fire, every frame.
  for (const flame of lit) if (flame.follows && now >= flame.startAt) flame.placement.measure()

  for (let i = lit.length - 1; i >= 0; i -= 1) {
    const flame = lit[i]
    if (now < flame.startAt) continue

    if (flame.canvas.hidden) flame.canvas.hidden = false
    // Each fire keeps its own clock, so it moves at the same pace at any
    // frame rate.
    const moved = flame.sim.advance(now - flame.startAt)

    if (flame.sim.done || now - flame.startAt > MAX_LIFE_MS) {
      flame.canvas.remove()
      lit.splice(i, 1)
      continue
    }
    if (flame.follows) {
      const transform = flame.placement.transform()
      if (flame.canvas.style.transform !== transform) flame.canvas.style.transform = transform
    }
    // A frame where nothing moved needn't be drawn again.
    if (moved) {
      flame.sim.paint(flame.image, flame.onLight)
      flame.ctx.putImageData(flame.image, 0, 0)
    }
  }
  frame = lit.length > 0 ? requestAnimationFrame(tick) : 0
}

/**
 * Gives a simulation its canvas, puts it where `placement` says, and keeps
 * it burning until it is done. `follows` re-measures it every frame.
 */
function light(
  sim: Sim,
  onLight: boolean,
  cell: number,
  delay: number,
  placement: Placement,
  follows: boolean,
): void {
  const canvas = document.createElement('canvas')
  canvas.className = `ember${onLight ? ' ember--light' : ''}`
  canvas.width = sim.cols
  canvas.height = sim.rows
  canvas.style.width = `${sim.cols * cell}px`
  canvas.style.height = `${sim.rows * cell}px`
  canvas.setAttribute('aria-hidden', 'true')
  canvas.hidden = delay > 0
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const flame: Lit = {
    sim,
    canvas,
    ctx,
    image: ctx.createImageData(sim.cols, sim.rows),
    onLight,
    startAt: performance.now() + delay,
    placement,
    follows,
  }
  canvas.style.transform = placement.transform()
  document.body.appendChild(canvas)
  // The first frame is drawn now, so it shows the instant the fire does —
  // straight away, or once a delay is up — rather than a frame late.
  sim.paint(flame.image, onLight)
  ctx.putImageData(flame.image, 0, 0)
  lit.push(flame)
  if (!frame) frame = requestAnimationFrame(tick)
}

export interface EmberOptions {
  /** Milliseconds to wait before lighting, to answer something else first. */
  delay?: number
  /** Where the fire's base sits within the origin, top (0) to bottom (1). */
  anchor?: number
}

/** An ember aimed at a control, ready to be lit once the action succeeds. */
export type Ignite = (intensity: EmberIntensity, options?: EmberOptions) => void

/**
 * Takes aim at `origin` now, while it is certainly on screen, and returns a
 * function that lights the ember there. Lets an action that waits on the
 * server light its ember only once it has actually succeeded, even if the
 * control that started it has been replaced by then.
 */
export function aim(origin: Element): Ignite {
  let rect = origin.getBoundingClientRect()
  const onLight = isOnLight(origin)

  return (intensity, { delay = 0, anchor = 0.6 } = {}) => {
    if (!mayLight(rect)) return
    const cell = cellSize()
    const fire = new EmberFire(intensity, rect.width / cell)

    // Follow the control while it's on screen; once it's gone (a completed
    // task, a button that became Undo), burn on where it was.
    const placement: Placement = {
      measure() {
        if (!origin.isConnected) return
        const now = origin.getBoundingClientRect()
        if (now.width > 0 || now.height > 0) rect = now
      },
      transform() {
        const left = rect.left + rect.width / 2 - (fire.cols * cell) / 2
        const top = rect.top + rect.height * anchor - (fire.rows - 1) * cell
        return `translate3d(${snap(left)}px, ${snap(top)}px, 0)`
      },
    }
    light(fire, onLight, cell, delay, placement, true)
  }
}

/** Lights an ember at `origin` straight away. */
export function ember(origin: Element, intensity: EmberIntensity, options?: EmberOptions): void {
  aim(origin)(intensity, options)
}

/** A burst aimed at a control, ready to be thrown once the action lands. */
export type Throw = (intensity: EmberIntensity) => void

/**
 * Takes aim at `origin` now and returns a function that throws a burst of
 * sparks off it: its outline flashes and shatters outward, the sparks drift
 * up as they cool, and a few pixel stars twinkle at the edge. The burst
 * stays where the control was, even if the control has moved or gone by
 * then — a dialog that closed, a card that was saved away. Purely
 * decoration: it never takes a click and never touches the action.
 */
export function aimBurst(origin: Element): Throw {
  const rect = origin.getBoundingClientRect()
  const onLight = isOnLight(origin)
  // The outline's corners, as a share of the shorter side: a pill or a
  // circle bursts as a ring, a squarer button as a rounded box.
  const corner = getComputedStyle(origin).borderTopLeftRadius
  const short = Math.max(1, Math.min(rect.width, rect.height))
  const rounded = corner.endsWith('%') ? parseFloat(corner) / 100 : (parseFloat(corner) || 0) / short

  return (intensity) => {
    if (!mayLight(rect) || rect.width === 0 || rect.height === 0) return
    const cell = cellSize()
    const sparks = new EmberBurst(intensity, rect.width / cell, rect.height / cell, rounded)
    const left = snap(rect.left + rect.width / 2 - sparks.centreX * cell)
    const top = snap(rect.top + rect.height / 2 - sparks.centreY * cell)
    // Sparks fly free: they stay where they were thrown, so nothing is re-measured.
    const placement: Placement = {
      measure() {},
      transform: () => `translate3d(${left}px, ${top}px, 0)`,
    }
    light(sparks, onLight, cell, 0, placement, false)
  }
}

/** Throws a burst of sparks off `origin` straight away: the press itself, answered. */
export function burst(origin: Element, intensity: EmberIntensity): void {
  aimBurst(origin)(intensity)
}
