import { GEAN_BOUNDS, GEAN_GLASS, GEAN_PATH, GEAN_VIEWBOX, GEAN_WALL } from '../lib/gean'
import { GEAN_FIRE_FRAGMENT, GEAN_FIRE_VERTEX } from '../lib/geanFireShader'

/** Everything that changes from one frame of the fire to the next. */
export interface FireFrame {
  /** Seconds of flame motion. Frozen under reduced motion. */
  time: number
  /** Surface height, 0–1 of the letter height. */
  fill: number
  /** ~0.4 smouldering, 1 burning, above 1 flaring. */
  heat: number
  /** 0–1: the completion moment, lighting the walls. */
  flare: number
  /** Spark density: 0 none, 1 steady, above 1 a burst. */
  sparks: number
}

const MAX_DPR = 2

/**
 * Draws GEAN as four glass vessels with fire inside them.
 *
 * Two canvases do the work. The fire is rendered small — a few dozen pixels
 * tall — by a WebGL shader and scaled up with hard edges, which is what gives
 * it the hearth's pixel grain. It is then composited onto a full-resolution
 * 2D canvas through the letterforms as a clip, so the fire is coarse but the
 * vessel walls stay sharp at any size.
 *
 * Around the fire sit three layers that make the letters read as containers
 * rather than as text with fire behind it: dark glass for the empty space,
 * a soft shadow just inside the walls that gives the volume depth, and the
 * walls themselves — which glow warm only where the fire reaches them.
 * Every layer is clipped to the letters, so nothing escapes the shapes.
 */
export class GeanRenderer {
  /** False when WebGL is unavailable and the fire is drawn on the CPU. */
  webgl: boolean

  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly letters = new Path2D(GEAN_PATH)
  private fire = document.createElement('canvas')
  private readonly under = document.createElement('canvas')
  private readonly over = document.createElement('canvas')
  private readonly litWall = document.createElement('canvas')

  private gl: WebGLRenderingContext | null = null
  private uniforms = new Map<string, WebGLUniformLocation | null>()
  private cpu: CanvasRenderingContext2D | null = null
  private cpuImage: ImageData | null = null

  private width = 1
  private height = 1
  /** Device pixels per letter unit. */
  private unit = 1

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('A 2D canvas is required for the loading screen.')
    this.ctx = ctx
    this.webgl = this.startWebGL()
    if (!this.webgl) this.cpu = this.fire.getContext('2d')
    this.resize()
  }

  /** Matches the canvases to the element's size and the screen's density. */
  resize(): void {
    const box = this.canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    this.width = Math.max(1, Math.round(box.width * dpr))
    this.height = Math.max(1, Math.round(box.height * dpr))
    this.canvas.width = this.width
    this.canvas.height = this.height
    this.unit = this.width / GEAN_VIEWBOX.width

    // The fire's pixel grain matches the hearth's on a laptop and gets finer
    // on a phone, so small letters still hold a readable flame.
    const letterCss = (box.height * GEAN_BOUNDS.height) / GEAN_VIEWBOX.height
    const pixelCss = Math.min(3.6, Math.max(1.5, letterCss / 64))
    const fireHeight = Math.max(24, Math.round(letterCss / pixelCss))
    this.fire.width = Math.round((fireHeight * GEAN_BOUNDS.width) / GEAN_BOUNDS.height)
    this.fire.height = fireHeight
    this.gl?.viewport(0, 0, this.fire.width, this.fire.height)
    this.cpuImage = this.cpu ? this.cpu.createImageData(this.fire.width, this.fire.height) : null

    this.paintLayers()
  }

  draw(frame: FireFrame): void {
    this.renderFire(frame)

    const { ctx, unit } = this
    const vb = GEAN_VIEWBOX
    const bx = (GEAN_BOUNDS.x - vb.x) * unit
    const by = (GEAN_BOUNDS.y - vb.y) * unit
    const bw = GEAN_BOUNDS.width * unit
    const bh = GEAN_BOUNDS.height * unit

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, this.width, this.height)
    ctx.drawImage(this.under, 0, 0)

    // The fire, poured into the letters.
    ctx.save()
    ctx.setTransform(unit, 0, 0, unit, -vb.x * unit, -vb.y * unit)
    ctx.clip(this.letters, 'evenodd')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.globalCompositeOperation = 'lighter'
    ctx.drawImage(this.fire, bx, by, bw, bh)
    ctx.restore()

    ctx.drawImage(this.over, 0, 0)

    // The walls catch the fire's light up to where it reaches, feathered at
    // the surface so the lit edge has no hard line of its own.
    const surface = Math.min(1, Math.max(0, frame.fill * 1.04))
    if (surface > 0.01) {
      const strength = Math.min(1, 0.3 + 0.7 * Math.min(frame.heat, 1) + frame.flare * 0.7)
      const top = by + bh * (1 - surface)
      const feather = bh * 0.1
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      this.cropLayer(this.litWall, top, this.height, strength)
      this.cropLayer(this.litWall, top - feather, top, strength * 0.45)
      // Completion: the full walls glow once, as the vessels seal.
      if (frame.flare > 0) this.cropLayer(this.litWall, 0, this.height, frame.flare * 0.9)
      ctx.restore()
    }
  }

  dispose(): void {
    const { gl } = this
    this.gl = null
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  }

  /**
   * The GPU can drop a WebGL context at any time (a driver reset, too many
   * contexts). Carry on with the CPU fire on a fresh canvas rather than let
   * the vessels go dark mid-load.
   */
  private readonly onContextLost = () => {
    if (!this.gl) return // our own dispose()
    this.gl = null
    this.uniforms.clear()
    this.webgl = false
    this.fire = document.createElement('canvas')
    this.cpu = this.fire.getContext('2d')
    this.resize()
  }

  // --- Fire ----------------------------------------------------------------

  private startWebGL(): boolean {
    const gl = this.fire.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      // The frame is copied onto the 2D canvas; keep it readable for that.
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    })
    if (!gl) return false

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)
      if (!shader) return null
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('GEAN fire shader failed to compile:', gl.getShaderInfoLog(shader))
        return null
      }
      return shader
    }

    const vertex = compile(gl.VERTEX_SHADER, GEAN_FIRE_VERTEX)
    const fragment = compile(gl.FRAGMENT_SHADER, GEAN_FIRE_FRAGMENT)
    const program = gl.createProgram()
    if (!vertex || !fragment || !program) return false
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('GEAN fire program failed to link:', gl.getProgramInfoLog(program))
      return false
    }
    gl.useProgram(program)

    // One triangle that covers the whole viewport.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    for (const name of ['res', 'aspect', 'time', 'fill', 'heat', 'sparks']) {
      this.uniforms.set(name, gl.getUniformLocation(program, name))
    }
    this.fire.addEventListener('webglcontextlost', this.onContextLost)
    this.gl = gl
    return true
  }

  private renderFire(frame: FireFrame): void {
    const { gl } = this
    if (!gl) {
      this.renderFireOnCpu(frame)
      return
    }
    const u = (name: string) => this.uniforms.get(name) ?? null
    gl.uniform2f(u('res'), this.fire.width, this.fire.height)
    gl.uniform1f(u('aspect'), GEAN_BOUNDS.width / GEAN_BOUNDS.height)
    gl.uniform1f(u('time'), frame.time)
    gl.uniform1f(u('fill'), frame.fill)
    gl.uniform1f(u('heat'), frame.heat)
    gl.uniform1f(u('sparks'), frame.sparks)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  /**
   * Without WebGL: a simpler fire with the same colour ramp and the same
   * filling surface, computed per pixel on the small canvas. Plainer, but it
   * still says exactly how far loading has got.
   */
  private renderFireOnCpu(frame: FireFrame): void {
    const { cpu, cpuImage } = this
    if (!cpu || !cpuImage) return
    const { width: w, height: h } = this.fire
    const data = cpuImage.data
    const aspect = GEAN_BOUNDS.width / GEAN_BOUNDS.height
    const t = frame.time
    const body = frame.fill * (0.92 + 0.12 * frame.fill)

    for (let row = 0; row < h; row += 1) {
      const y = 1 - (row + 0.5) / h
      for (let col = 0; col < w; col += 1) {
        const x = (col / w) * aspect
        const surface =
          body + 0.035 * Math.sin(x * 9 + t * 3.1) + 0.02 * Math.sin(x * 23 - t * 5.3)
        let f = 0
        if (y < surface && frame.fill > 0.01) {
          const depth = y / Math.max(surface, 0.01)
          const flicker = 0.82 + 0.18 * Math.sin(x * 41 + y * 29 - t * 8)
          f = Math.min(1.4, (1 - 0.62 * depth) * flicker * frame.heat)
        }
        const f3 = f * f * f
        const i = (row * w + col) * 4
        data[i] = Math.min(255, 382 * f)
        data[i + 1] = Math.min(255, 382 * f3)
        data[i + 2] = Math.min(255, 382 * f3 * f3)
        data[i + 3] = 255
      }
    }
    cpu.putImageData(cpuImage, 0, 0)
  }

  // --- Vessel ----------------------------------------------------------------

  /** Paints the layers that only change with size: glass, depth, walls. */
  private paintLayers(): void {
    const vb = GEAN_VIEWBOX
    const layer = (canvas: HTMLCanvasElement) => {
      canvas.width = this.width
      canvas.height = this.height
      const x = canvas.getContext('2d')!
      x.setTransform(this.unit, 0, 0, this.unit, -vb.x * this.unit, -vb.y * this.unit)
      x.lineJoin = 'round'
      return x
    }

    // Empty glass: what the vessels hold before the fire rises.
    const under = layer(this.under)
    const glass = under.createLinearGradient(0, 0, 0, GEAN_BOUNDS.height)
    glass.addColorStop(0, GEAN_GLASS.top)
    glass.addColorStop(1, GEAN_GLASS.bottom)
    under.fillStyle = glass
    under.fill(this.letters, 'evenodd')

    const over = layer(this.over)
    // Depth: the volume darkens toward its walls. Shadow of everything
    // outside the letters, cast inward and clipped to them.
    over.save()
    over.clip(this.letters, 'evenodd')
    const outside = new Path2D()
    outside.rect(vb.x - 40, vb.y - 40, vb.width + 80, vb.height + 80)
    outside.addPath(this.letters)
    over.shadowColor = 'rgba(0, 0, 0, 0.82)'
    over.shadowBlur = 4.5 * this.unit // shadow blur ignores the transform
    over.fillStyle = '#000'
    over.fill(outside, 'evenodd')
    over.restore()
    // A faint cool sheen on the upper walls, as on glass.
    over.save()
    over.clip(this.letters, 'evenodd')
    const sheen = over.createLinearGradient(0, 0, 0, GEAN_BOUNDS.height)
    sheen.addColorStop(0, 'rgba(214, 222, 255, 0.075)')
    sheen.addColorStop(0.4, 'rgba(214, 222, 255, 0)')
    over.fillStyle = sheen
    over.fillRect(vb.x, vb.y, vb.width, vb.height)
    over.restore()
    // The walls.
    over.lineWidth = GEAN_WALL
    over.strokeStyle = GEAN_GLASS.wall
    over.stroke(this.letters)

    // The walls lit from inside: only the inner half of each stroke, so the
    // light stays within the letters.
    const lit = layer(this.litWall)
    lit.save()
    lit.clip(this.letters, 'evenodd')
    lit.lineWidth = 7
    lit.strokeStyle = 'rgba(255, 112, 40, 0.10)'
    lit.stroke(this.letters)
    lit.lineWidth = 2.6
    lit.strokeStyle = 'rgba(255, 152, 72, 0.6)'
    lit.stroke(this.letters)
    lit.restore()
  }

  /** Draws the horizontal slice [top, bottom) of a full-size layer. */
  private cropLayer(source: HTMLCanvasElement, top: number, bottom: number, alpha: number) {
    const y0 = Math.max(0, Math.floor(top))
    const y1 = Math.min(this.height, Math.ceil(bottom))
    if (y1 <= y0 || alpha <= 0) return
    this.ctx.globalAlpha = alpha
    this.ctx.drawImage(source, 0, y0, this.width, y1 - y0, 0, y0, this.width, y1 - y0)
  }
}
