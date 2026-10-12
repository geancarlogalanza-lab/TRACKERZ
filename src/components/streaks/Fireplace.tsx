import { useEffect, useRef } from 'react'
import { burningEdge, onBurningEdgeChange } from '../../lib/burningEdge'
import { FRAGMENT_SHADER, VERTEX_SHADER } from '../../lib/fireplaceShader'

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
  /** Reports whether WebGL came up, so the page can dress for it or not. */
  onReady: (ok: boolean) => void
}

/**
 * The fireplace behind the Streak tracker. It renders at a fraction of the
 * screen's resolution and lets the browser scale it up with hard pixel
 * edges, caps itself at 30 frames a second, stops entirely when the tab is
 * hidden, and draws a single still frame when the person prefers reduced
 * motion. Unmounting releases the GL context.
 */
export function Fireplace({ onReady }: FireplaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', {
      alpha: false,
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
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
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
    let lastDrawn = 0
    const started = performance.now()

    const loop = (now: number) => {
      // Thirty frames a second — but a calendar that has just moved (a
      // scroll, a new month's height) is redrawn at once, so its flames
      // stay on its border rather than trailing behind.
      const moved = placeEdge()
      if (moved || now - lastDrawn >= FRAME_INTERVAL) {
        lastDrawn = now
        draw((now - started) / 1000)
      }
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

    const run = () => {
      cancelAnimationFrame(frame)
      if (reducedMotion.matches) {
        drawStill()
      } else {
        frame = requestAnimationFrame(loop)
      }
    }

    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(frame)
      else run()
    }
    const onResize = () => {
      resize()
      edgeDrawn[0] = Number.NaN
      if (reducedMotion.matches) drawStill()
    }
    const onEdgeMoved = () => {
      if (reducedMotion.matches) drawStill()
    }
    const edgeSize = new ResizeObserver(onEdgeMoved)
    const watchEdge = () => {
      edgeSize.disconnect()
      const element = burningEdge()
      if (element) edgeSize.observe(element)
      onEdgeMoved()
    }
    watchEdge()
    const stopWatchingEdge = onBurningEdgeChange(watchEdge)

    // A lost context (GPU reset, too many contexts) can't be drawn to. Go
    // quiet rather than spin, and let the page drop the hearth dressing.
    const onContextLost = (event: Event) => {
      event.preventDefault()
      cancelAnimationFrame(frame)
      onReady(false)
    }

    run()
    reducedMotion.addEventListener('change', run)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onEdgeMoved, { passive: true, capture: true })
    canvas.addEventListener('webglcontextlost', onContextLost)

    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(stillFrame)
      stopWatchingEdge()
      edgeSize.disconnect()
      reducedMotion.removeEventListener('change', run)
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
  }, [onReady])

  return <canvas ref={canvasRef} className="hearth" aria-hidden="true" />
}
