import { useEffect, useRef } from 'react'
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
    gl.uniform4f(uMouse, 0.5, 0.5, 0, 0)

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
      if (now - lastDrawn >= FRAME_INTERVAL) {
        lastDrawn = now
        draw((now - started) / 1000)
      }
      frame = requestAnimationFrame(loop)
    }

    const run = () => {
      cancelAnimationFrame(frame)
      if (reducedMotion.matches) {
        // A still fire is still a fire.
        draw(6.5)
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
      if (reducedMotion.matches) draw(6.5)
    }

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
    canvas.addEventListener('webglcontextlost', onContextLost)

    return () => {
      cancelAnimationFrame(frame)
      reducedMotion.removeEventListener('change', run)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', onResize)
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
