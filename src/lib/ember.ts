import { EmberFire, type EmberIntensity } from './emberFire'

export type { EmberIntensity }

/**
 * Puts an ember on screen at the control that was pressed. One call per
 * meaningful action; everything else — size, colour, timing, cleanup — is
 * decided here, so every ember in the app moves the same way.
 *
 * Each ember is its own small canvas, one canvas pixel per cell, scaled up
 * with hard edges by the browser: the hearth's grain at almost no cost. A
 * single animation loop runs only while an ember is alight. Nothing is
 * drawn for anyone who prefers reduced motion, while the page is hidden, or
 * once a handful are already burning; the action itself is unaffected.
 */

interface Lit {
  fire: EmberFire
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  image: ImageData
  onLight: boolean
  origin: Element
  rect: DOMRect
  cell: number
  /** Where the source row sits within the origin, top (0) to bottom (1). */
  anchor: number
  startAt: number
}

const MAX_LIT = 6
/** Screen pixels per cell, as in the hearth. */
const CELL_CSS = 3
/** Embers that outlive this are cleared regardless. */
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

function place(flame: Lit): void {
  const { origin, fire, cell } = flame
  // Follow the control while it's on screen; once it's gone (a completed
  // task, a button that became Undo), burn on where it was.
  if (origin.isConnected) {
    const rect = origin.getBoundingClientRect()
    if (rect.width > 0 || rect.height > 0) flame.rect = rect
  }
  const { rect } = flame
  const left = rect.left + rect.width / 2 - (fire.cols * cell) / 2
  const base = rect.top + rect.height * flame.anchor
  const top = base - (fire.rows - 1) * cell
  flame.canvas.style.transform = `translate3d(${snap(left)}px, ${snap(top)}px, 0)`
}

function tick(now: number): void {
  for (let i = lit.length - 1; i >= 0; i -= 1) {
    const flame = lit[i]
    if (now < flame.startAt) continue

    flame.canvas.hidden = false
    // The fire keeps its own clock, so it moves at the same pace at any
    // frame rate.
    flame.fire.advance(now - flame.startAt)

    if (flame.fire.done || now - flame.startAt > MAX_LIFE_MS) {
      flame.canvas.remove()
      lit.splice(i, 1)
      continue
    }
    place(flame)
    flame.fire.paint(flame.image, flame.onLight)
    flame.ctx.putImageData(flame.image, 0, 0)
  }
  frame = lit.length > 0 ? requestAnimationFrame(tick) : 0
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
  const rect = origin.getBoundingClientRect()
  // Light surfaces and dark ones take the fire differently; the theme says
  // which this is, so the ember needn't guess from colours.
  const onLight = getComputedStyle(origin).getPropertyValue('--ember-blend').trim() !== 'screen'

  return (intensity, { delay = 0, anchor = 0.6 } = {}) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (document.hidden || lit.length >= MAX_LIT) return
    if (rect.bottom < 0 || rect.top > window.innerHeight) return

    const cell = cellSize()
    const fire = new EmberFire(intensity, rect.width / cell)
    const canvas = document.createElement('canvas')
    canvas.className = `ember${onLight ? ' ember--light' : ''}`
    canvas.width = fire.cols
    canvas.height = fire.rows
    canvas.style.width = `${fire.cols * cell}px`
    canvas.style.height = `${fire.rows * cell}px`
    canvas.setAttribute('aria-hidden', 'true')
    canvas.hidden = delay > 0
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const now = performance.now()
    const flame: Lit = {
      fire,
      canvas,
      ctx,
      image: ctx.createImageData(fire.cols, fire.rows),
      onLight,
      origin,
      rect,
      cell,
      anchor,
      startAt: now + delay,
    }
    place(flame)
    document.body.appendChild(canvas)
    if (delay === 0) {
      fire.paint(flame.image, onLight) // the ignition shows this frame, not the next
      ctx.putImageData(flame.image, 0, 0)
    }
    lit.push(flame)
    if (!frame) frame = requestAnimationFrame(tick)
  }
}

/** Lights an ember at `origin` straight away. */
export function ember(origin: Element, intensity: EmberIntensity, options?: EmberOptions): void {
  aim(origin)(intensity, options)
}
