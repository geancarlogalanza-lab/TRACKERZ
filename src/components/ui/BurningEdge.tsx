import { useEffect, useRef, type ReactNode } from 'react'
import { EDGE_FRAGMENT_SHADER, VERTEX_SHADER } from '../../lib/fireplaceShader'

/** Screen pixels per fire pixel before rounding to whole device pixels: the hearth's grain on a phone. */
const GRAIN_CSS = 3.5
/** How far past the outline flames and embers reach, in fire pixels (the band burningEdge draws). */
const REACH = 20
const FRAME_INTERVAL = 1000 / 30

/**
 * Sets the outline of what it wraps alight — the hearth's flames licking off
 * a calendar's border.
 *
 * The fire is a small canvas round the calendar, inside the page and behind
 * it, so it scrolls with the calendar as one piece. On a phone the page
 * scrolls off the main thread, and a fire drawn anywhere else — a canvas
 * fixed to the screen, say — would trail behind the border it should be
 * hugging. The calendar is opaque, so only what burns outward shows.
 *
 * It draws thirty times a second, asking the browser for no frame in
 * between, and stops while the calendar is off screen or the tab is hidden.
 * Someone who prefers reduced motion gets one still frame. Without WebGL the
 * calendar simply doesn't burn.
 */
export function BurningEdge({ children }: { children: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    })
    if (!gl) return

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)
      if (!shader) return null
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Burning edge shader failed to compile:', gl.getShaderInfoLog(shader))
        gl.deleteShader(shader)
        return null
      }
      return shader
    }
    const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER)
    const fragment = compile(gl.FRAGMENT_SHADER, EDGE_FRAGMENT_SHADER)
    const program = gl.createProgram()
    if (!vertex || !fragment || !program) return
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Burning edge program failed to link:', gl.getProgramInfoLog(program))
      return
    }
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0)
    const uTime = gl.getUniformLocation(program, 'time')
    const uEdge = gl.getUniformLocation(program, 'edge')
    const uOnLight = gl.getUniformLocation(program, 'onLight')

    const started = performance.now()
    let lastDrawn = 0
    const draw = (seconds: number) => {
      gl.uniform1f(uTime, seconds)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const drawNow = () => draw(reduced.matches ? 6.5 : (performance.now() - started) / 1000)

    // The canvas covers the calendar and the fire's reach round it, in whole
    // fire pixels, and the outline sits at a fixed place inside it — so it
    // depends only on the calendar's size, never on where it is or on the
    // screen's height (which a phone's address bar keeps changing).
    const fit = () => {
      const dpr = window.devicePixelRatio || 1
      const grain = Math.max(2, Math.round(GRAIN_CSS * dpr)) / dpr
      const margin = REACH * grain
      const width = wrap.offsetWidth
      const height = wrap.offsetHeight
      const cols = Math.max(1, Math.ceil((width + 2 * margin) / grain))
      const rows = Math.max(1, Math.ceil((height + 2 * margin) / grain))
      if (canvas.width !== cols || canvas.height !== rows) {
        canvas.width = cols
        canvas.height = rows
        gl.viewport(0, 0, cols, rows)
      }
      canvas.style.left = `${-margin}px`
      canvas.style.top = `${-margin}px`
      canvas.style.width = `${cols * grain}px`
      canvas.style.height = `${rows * grain}px`
      // In fire pixels with y up: left, bottom, right, top.
      gl.uniform4f(uEdge, REACH, rows - REACH - height / grain, REACH + width / grain, rows - REACH)
      drawNow()
    }

    // A light page takes the fire differently from a dark one; the theme
    // says which this is, as it does for the click embers.
    const readTheme = () => {
      const light = getComputedStyle(wrap).getPropertyValue('--ember-blend').trim() !== 'screen'
      gl.uniform1f(uOnLight, light ? 1 : 0)
      drawNow()
    }

    let frame = 0
    let timer = 0
    let inView = false
    const stop = () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      frame = 0
      timer = 0
    }
    const loop = (now: number) => {
      frame = 0
      // The timer wakes a touch early, so a frame landing a hair short of
      // the interval still counts as due.
      if (now - lastDrawn >= FRAME_INTERVAL - 4) {
        lastDrawn = now
        draw((now - started) / 1000)
      }
      timer = window.setTimeout(() => {
        timer = 0
        frame = requestAnimationFrame(loop)
      }, Math.max(0, FRAME_INTERVAL - (performance.now() - lastDrawn) - 10))
    }
    const run = () => {
      stop()
      if (!inView || document.hidden) return
      if (reduced.matches) drawNow()
      else frame = requestAnimationFrame(loop)
    }

    const size = new ResizeObserver(fit)
    size.observe(wrap)
    const sight = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting
        run()
      },
      { rootMargin: '80px' },
    )
    sight.observe(wrap)
    const scheme = window.matchMedia('(prefers-color-scheme: dark)')
    readTheme()

    const onContextLost = (event: Event) => {
      event.preventDefault()
      stop()
    }
    reduced.addEventListener('change', run)
    scheme.addEventListener('change', readTheme)
    document.addEventListener('visibilitychange', run)
    canvas.addEventListener('webglcontextlost', onContextLost)

    return () => {
      stop()
      size.disconnect()
      sight.disconnect()
      reduced.removeEventListener('change', run)
      scheme.removeEventListener('change', readTheme)
      document.removeEventListener('visibilitychange', run)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      // Keep the context itself: React may remount this same canvas
      // (StrictMode does), and a deliberately lost context can't be reused.
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)
    }
  }, [])

  return (
    <div ref={wrapRef} className="burning">
      <canvas ref={canvasRef} className="burning__fire" aria-hidden="true" />
      {children}
    </div>
  )
}
