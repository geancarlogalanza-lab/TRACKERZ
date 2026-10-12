import { useEffect, useRef } from 'react'
import { burningEdge, onBurningEdgeChange } from '../../lib/burningEdge'
import { EDGE_FRAGMENT_SHADER, FRAGMENT_SHADER, VERTEX_SHADER } from '../../lib/fireplaceShader'

/** Canvas rows. Each is ~3 screen pixels tall on a phone: the pixel look. */
const CANVAS_HEIGHT = 240
/** The height, in the shader's own units, that the viewport represents.
 *  Flames burn out around 420 units, so this puts the hearth in the lower
 *  half and leaves the top of the screen dark. Phones get a larger fire —
 *  there is less of the screen for it to share. */
const VIRTUAL_HEIGHT = 900
const VIRTUAL_HEIGHT_NARROW = 700
const FRAME_INTERVAL = 1000 / 30
/** On phones a fixed "New streak" bar covers the bottom edge; the fire
 *  rises from just above it so its brightest part stays in the open. */
const NARROW_MAX_WIDTH = 700
const NARROW_FLOOR_PX = 84

interface FireplaceProps {
  /**
   * The whole hearth behind the Streak tracker, or only the burning edge
   * round a calendar on a page with no hearth — the task calendar.
   */
  variant?: 'hearth' | 'edge'
  /** Reports whether WebGL came up, so the page can dress for it or not. */
  onReady?: (ok: boolean) => void
}

const ignore = () => {}

/**
 * The fireplace behind the Streak tracker. It renders at a fraction of the
 * screen's resolution and lets the browser scale it up with hard pixel
 * edges, caps itself at 30 frames a second, stops entirely when the tab is
 * hidden, and draws a single still frame when the person prefers reduced
 * motion. Unmounting releases the GL context.
 *
 * Either way it sets alight the outline of whichever calendar has
 * registered itself (burningEdge.ts). The edge variant draws nothing else:
 * a transparent canvas with fire only round that outline, in the same
 * grain, at the same pace.
 */
export function Fireplace({ variant = 'hearth', onReady = ignore }: FireplaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const edgeOnly = variant === 'edge'

    const gl = canvas.getContext('webgl', {
      alpha: edgeOnly,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    })
    if (!gl) {
      onReady(false)
      return
    }

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)
      if (!shader) return null
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Fireplace shader failed to compile:', gl.getShaderInfoLog(shader))
        gl.deleteShader(shader)
        return null
      }
      return shader
    }

    const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER)
    const fragment = compile(gl.FRAGMENT_SHADER, edgeOnly ? EDGE_FRAGMENT_SHADER : FRAGMENT_SHADER)
    const program = gl.createProgram()
    if (!vertex || !fragment || !program) {
      onReady(false)
      return
    }
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Fireplace program failed to link:', gl.getProgramInfoLog(program))
      onReady(false)
      return
    }
    gl.useProgram(program)

    // One quad covering the clip space.
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]),
      gl.STATIC_DRAW,
    )
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0)

    const uResolution = gl.getUniformLocation(program, 'resolution')
    const uTime = gl.getUniformLocation(program, 'time')
    const uMouse = gl.getUniformLocation(program, 'mouse')
    const uScale = gl.getUniformLocation(program, 'scale')
    const uFloor = gl.getUniformLocation(program, 'floorLine')
    const uEdge = gl.getUniformLocation(program, 'edge')
    const uOnLight = gl.getUniformLocation(program, 'onLight')
    gl.uniform4f(uMouse, 0.5, 0.5, 0, 0)
    gl.uniform4f(uEdge, 0, 0, -1, -1)

    const resize = () => {
      const ratio = window.innerWidth / Math.max(window.innerHeight, 1)
      canvas.height = CANVAS_HEIGHT
      canvas.width = Math.max(1, Math.round(CANVAS_HEIGHT * ratio))
      gl.viewport(0, 0, canvas.width, canvas.height)
      const narrow = window.innerWidth <= NARROW_MAX_WIDTH
      const virtualHeight = narrow ? VIRTUAL_HEIGHT_NARROW : VIRTUAL_HEIGHT
      const scale = virtualHeight / canvas.height
      gl.uniform1f(uScale, scale)
      gl.uniform2f(uResolution, canvas.width * scale, canvas.height * scale)
      const floorPx = narrow ? NARROW_FLOOR_PX : 0
      gl.uniform1f(uFloor, (floorPx / Math.max(window.innerHeight, 1)) * virtualHeight)
    }

    // The calendar's outline, in canvas pixels with y up, for the flames
    // that burn round it — or none when it isn't on the page.
    const edgeNow = [0, 0, -1, -1]
    const edgeDrawn = [Number.NaN, 0, 0, 0]
    /** Hands the shader the outline; says whether it moved since last time. */
    const placeEdge = () => {
      const element = burningEdge()
      if (element) {
        const rect = element.getBoundingClientRect()
        const sx = canvas.width / Math.max(window.innerWidth, 1)
        const sy = canvas.height / Math.max(window.innerHeight, 1)
        edgeNow[0] = rect.left * sx
        edgeNow[1] = (window.innerHeight - rect.bottom) * sy
        edgeNow[2] = rect.right * sx
        edgeNow[3] = (window.innerHeight - rect.top) * sy
      } else {
        edgeNow[0] = 0
        edgeNow[1] = 0
        edgeNow[2] = -1
        edgeNow[3] = -1
      }
      // A tenth of a canvas pixel is far below anything visible.
      if (edgeNow.every((value, i) => Math.abs(value - edgeDrawn[i]) < 0.1)) return false
      edgeDrawn.splice(0, 4, ...edgeNow)
      gl.uniform4f(uEdge, edgeNow[0], edgeNow[1], edgeNow[2], edgeNow[3])
      return true
    }

    const draw = (seconds: number) => {
      gl.uniform1f(uTime, seconds)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    resize()
    onReady(true)

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let timer = 0
    let lastDrawn = 0
    const started = performance.now()

    /** Whether the edge fire has anything on screen to burn round. */
    const edgeInView = () => {
      const margin = 24 // canvas pixels: as far as flames and embers reach
      return (
        edgeNow[2] > edgeNow[0] &&
        edgeNow[2] > -margin &&
        edgeNow[0] < canvas.width + margin &&
        edgeNow[3] > -margin &&
        edgeNow[1] < canvas.height + margin
      )
    }

    const loop = (now: number) => {
      frame = 0
      // Thirty frames a second — but a calendar that has just moved (a
      // scroll, a new month's height) is redrawn at once, so its flames
      // stay on its border rather than trailing behind.
      const moved = placeEdge()
      // The edge's own timer wakes it a touch early, so a frame landing a
      // hair short of the interval still counts as due.
      const due = edgeOnly ? FRAME_INTERVAL - 4 : FRAME_INTERVAL
      if (moved || now - lastDrawn >= due) {
        lastDrawn = now
        draw((now - started) / 1000)
      }
      if (!edgeOnly) {
        frame = requestAnimationFrame(loop)
        return
      }
      // The edge alone asks for no frame between its own: a frame on a page
      // that otherwise sits still is work for the browser even when nothing
      // is drawn. It waits for the next one due, and stops altogether while
      // its calendar is off screen or gone; a scroll, a resize or a new
      // calendar wakes it (kick).
      if (edgeInView()) {
        timer = window.setTimeout(() => {
          timer = 0
          frame = requestAnimationFrame(loop)
        }, Math.max(0, FRAME_INTERVAL - (performance.now() - lastDrawn) - 10))
      }
    }

    /** Something moved: burn on the very next frame (edge variant). */
    const kick = () => {
      if (!edgeOnly || reducedMotion.matches || document.hidden || frame) return
      window.clearTimeout(timer)
      timer = 0
      frame = requestAnimationFrame(loop)
    }

    // A still fire is still a fire; it is redrawn only when the calendar
    // it burns round moves.
    let stillFrame = 0
    const drawStill = () => {
      cancelAnimationFrame(stillFrame)
      stillFrame = requestAnimationFrame(() => {
        placeEdge()
        draw(6.5)
      })
    }

    const stop = () => {
      cancelAnimationFrame(frame)
      frame = 0
      window.clearTimeout(timer)
      timer = 0
    }

    const run = () => {
      stop()
      if (reducedMotion.matches) {
        drawStill()
      } else {
        frame = requestAnimationFrame(loop)
      }
    }

    const onVisibility = () => {
      if (document.hidden) stop()
      else run()
    }
    const onResize = () => {
      resize()
      edgeDrawn[0] = Number.NaN
      if (reducedMotion.matches) drawStill()
      else kick()
    }
    const onEdgeMoved = () => {
      if (reducedMotion.matches) drawStill()
      else kick()
    }
    const edgeSize = new ResizeObserver(onEdgeMoved)
    // A light page takes the fire differently from a dark one; the theme
    // says which this is, as it does for the click embers.
    const readTheme = () => {
      const element = burningEdge() ?? document.documentElement
      const light = getComputedStyle(element).getPropertyValue('--ember-blend').trim() !== 'screen'
      gl.uniform1f(uOnLight, light ? 1 : 0)
      edgeDrawn[0] = Number.NaN
      onEdgeMoved()
    }
    const scheme = window.matchMedia('(prefers-color-scheme: dark)')
    const watchEdge = () => {
      edgeSize.disconnect()
      const element = burningEdge()
      if (element) edgeSize.observe(element)
      readTheme()
    }
    watchEdge()
    const stopWatchingEdge = onBurningEdgeChange(watchEdge)

    // A lost context (GPU reset, too many contexts) can't be drawn to. Go
    // quiet rather than spin, and let the page drop the hearth dressing.
    const onContextLost = (event: Event) => {
      event.preventDefault()
      stop()
      onReady(false)
    }

    run()
    reducedMotion.addEventListener('change', run)
    scheme.addEventListener('change', readTheme)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onEdgeMoved, { passive: true, capture: true })
    canvas.addEventListener('webglcontextlost', onContextLost)

    return () => {
      stop()
      cancelAnimationFrame(stillFrame)
      stopWatchingEdge()
      edgeSize.disconnect()
      reducedMotion.removeEventListener('change', run)
      scheme.removeEventListener('change', readTheme)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onEdgeMoved, { capture: true })
      canvas.removeEventListener('webglcontextlost', onContextLost)
      // Release what we allocated but keep the context itself: React may
      // remount this same canvas (StrictMode does), and a context that has
      // been deliberately lost can't be reused. The browser reclaims it
      // with the element.
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)
    }
  }, [onReady, variant])

  return <canvas ref={canvasRef} className={`hearth${variant === 'edge' ? ' hearth--edge' : ''}`} aria-hidden="true" />
}
