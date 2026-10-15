import { useEffect, useRef, type ReactNode } from 'react'
import { loaderGone } from '../../boot/loaderGone'
import { edgeFragmentShader, VERTEX_SHADER } from '../../lib/fireplaceShader'

/** Screen pixels per fire pixel before rounding to whole device pixels: the hearth's grain on a phone. */
const GRAIN_CSS = 3.5
/** How far past the outline flames and embers reach, in fire pixels (the band burningEdge draws). */
const REACH = 20
const FRAME_INTERVAL = 1000 / 30
/** Most outlines one fire draws; fewer where the device allows fewer uniforms. */
const MAX_EDGES = 32

interface BurningEdgeProps {
  children: ReactNode
  /**
   * The panels inside whose outlines burn, as a selector — the Tasks page's
   * cards, say. Left out, the outline of what it wraps burns: the calendar.
   */
  panels?: string
}

/**
 * Sets an outline alight — the hearth's flames licking off a calendar's
 * border, or off each panel of a page.
 *
 * The fire is one small canvas round what it wraps, inside the page and
 * behind it, so it scrolls with the panels as one piece. On a phone the page
 * scrolls off the main thread, and a fire drawn anywhere else — a canvas
 * fixed to the screen, say — would trail behind the border it should be
 * hugging. The panels are opaque, so only what burns outward shows. One
 * canvas serves every panel: a page may only hold a handful of WebGL
 * contexts, fewer on a phone, and a card each would run out.
 *
 * It catches only after the loading screen has gone and the screen it is on
 * has painted, and fades in on its first frame. It draws thirty times a
 * second, asking the browser for no frame in between, and stops while it is
 * off screen, the tab is hidden, or nothing is there to burn. Someone who
 * prefers reduced motion gets one still frame. Without WebGL nothing burns.
 */
export function BurningEdge({ children, panels }: BurningEdgeProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    // Creating a WebGL context and compiling its shader can hold the page
    // for a moment, longest the first time. The Tasks page renders beneath
    // the loading screen, whose fire shouldn't pay for that, and a change of
    // screen should show before its fire catches — so this waits for the
    // loader to go, then for a frame to paint.
    let cancelled = false
    let paint = 0
    let after = 0
    let douse: (() => void) | undefined
    void loaderGone.then(() => {
      if (cancelled) return
      paint = requestAnimationFrame(() => {
        after = window.setTimeout(() => {
          douse = kindle(wrap, canvas, panels)
        })
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(paint)
      window.clearTimeout(after)
      douse?.()
    }
  }, [panels])

  return (
    <div ref={wrapRef} className="burning">
      <canvas ref={canvasRef} className="burning__fire" aria-hidden="true" />
      {children}
    </div>
  )
}

/**
 * Sets up the fire on `canvas` and starts it once its shader is ready;
 * returns what puts it out. Where the browser can, the shader compiles in
 * the background and is only asked about once it is done — asking sooner
 * would make the page wait for it.
 */
function kindle(wrap: HTMLDivElement, canvas: HTMLCanvasElement, panels?: string): () => void {
  const context = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
  })
  if (!context) return () => {}
  const gl = context

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)
    if (!shader) return null
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    return shader
  }
  // Each outline takes one uniform vector; a few go to the rest.
  const maxEdges = Math.max(
    1,
    Math.min(MAX_EDGES, Number(gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)) - 4),
  )
  const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragment = compile(gl.FRAGMENT_SHADER, edgeFragmentShader(maxEdges))
  const program = gl.createProgram()
  if (!vertex || !fragment || !program) return () => {}
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)

  const background = gl.getExtension('KHR_parallel_shader_compile')
  let check = 0
  let burning: (() => void) | undefined
  const whenCompiled = () => {
    check = 0
    if (gl.isContextLost()) return
    if (background && !gl.getProgramParameter(program, background.COMPLETION_STATUS_KHR)) {
      check = window.setTimeout(whenCompiled, 50)
      return
    }
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(
        'Burning edge shader failed:',
        gl.getShaderInfoLog(fragment) || gl.getShaderInfoLog(vertex) || gl.getProgramInfoLog(program),
      )
      return
    }
    burning = burn()
  }
  // Even asking whether it is done waits while the browser is still
  // translating the shader, so the first question comes a moment later.
  if (background) check = window.setTimeout(whenCompiled, 150)
  else whenCompiled()

  return () => {
    window.clearTimeout(check)
    burning?.()
    // Keep the context itself: React may remount this same canvas
    // (StrictMode does), and a deliberately lost context can't be reused.
    gl.deleteProgram(program)
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
  }

  function burn() {
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0)
    const uTime = gl.getUniformLocation(program, 'time')
    const uEdges = gl.getUniformLocation(program, 'edges')
    const uEdgeCount = gl.getUniformLocation(program, 'edgeCount')
    const uOnLight = gl.getUniformLocation(program, 'onLight')

    const started = performance.now()
    let lastDrawn = 0
    const draw = (seconds: number) => {
      gl.uniform1f(uTime, seconds)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    canvas.classList.add('burning__fire--lit')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const drawNow = () => draw(reduced.matches ? 6.5 : (performance.now() - started) / 1000)

    // Where each panel sits within the wrapper, by layout alone: a card
    // still settling in mid-animation burns where it will come to rest.
    const placeOf = (panel: HTMLElement) => {
      let x = 0
      let y = 0
      for (let node: HTMLElement | null = panel; node && node !== wrap; ) {
        x += node.offsetLeft
        y += node.offsetTop
        node = node.offsetParent as HTMLElement | null
      }
      return { x, y, width: panel.offsetWidth, height: panel.offsetHeight }
    }
    let watched: HTMLElement[] = []
    let count = 0

    // The canvas covers what it wraps and the fire's reach round it, in
    // whole fire pixels, and each outline sits at a fixed place inside it —
    // so it depends only on the layout, never on where the page is
    // scrolled or on the screen's height (which a phone's address bar keeps
    // changing).
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
      const boxes = panels
        ? watched.filter((panel) => panel.offsetWidth > 0).slice(0, maxEdges).map(placeOf)
        : [{ x: 0, y: 0, width, height }]
      // In fire pixels with y up: left, bottom, right, top.
      const outlines = new Float32Array(4 * Math.max(1, boxes.length))
      boxes.forEach((box, index) =>
        outlines.set(
          [
            REACH + box.x / grain,
            rows - REACH - (box.y + box.height) / grain,
            REACH + (box.x + box.width) / grain,
            rows - REACH - box.y / grain,
          ],
          4 * index,
        ),
      )
      gl.uniform4fv(uEdges, outlines)
      gl.uniform1i(uEdgeCount, boxes.length)
      const wasBurning = count > 0
      count = boxes.length
      drawNow()
      if (wasBurning !== count > 0) run()
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
      if (!inView || document.hidden || count === 0) return
      if (reduced.matches) drawNow()
      else frame = requestAnimationFrame(loop)
    }

    const size = new ResizeObserver(fit)
    size.observe(wrap)
    // Panels come and go and change places — a subject added, a card
    // floating up once something in it is overdue — so the set is read again
    // after any change to what the wrapper holds, and each is watched for
    // its size.
    let pending = 0
    const collect = () => {
      pending = 0
      if (!panels) return
      for (const panel of watched) size.unobserve(panel)
      watched = [...wrap.querySelectorAll<HTMLElement>(panels)]
      for (const panel of watched) size.observe(panel)
      fit()
    }
    const contents = new MutationObserver(() => {
      if (!pending) pending = requestAnimationFrame(collect)
    })
    if (panels) contents.observe(wrap, { childList: true, subtree: true })
    collect()
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
      cancelAnimationFrame(pending)
      size.disconnect()
      contents.disconnect()
      sight.disconnect()
      reduced.removeEventListener('change', run)
      scheme.removeEventListener('change', readTheme)
      document.removeEventListener('visibilitychange', run)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.classList.remove('burning__fire--lit')
      gl.deleteBuffer(buffer)
    }
  }
}
