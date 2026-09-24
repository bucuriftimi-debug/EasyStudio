import { Program, TargetPool, createTarget, createTexture, deleteTarget, type GL, type Target, type TexInfo } from './gl'
import {
  FS_BLUR,
  FS_COLOR,
  FS_COMPOSITE,
  FS_DAB,
  FS_DETAIL,
  FS_EDIT,
  FS_EXPORT,
  FS_PRESENT,
  FS_READ,
  FS_RESAMPLE,
  VS_DAB,
  VS_FULLSCREEN
} from './shaders'
import { NEUTRAL_EFFECTS, isNeutral, type EffectParams } from './effects'
import { blendIndex, type BlendMode } from './blend'

export interface RenderLayer {
  /** Stable id: the processed (effects applied) texture is cached per layer id. */
  id: string
  /** Id of an uploaded source texture (see `uploadSource`). */
  sourceId: string
  /** Optional layer mask (grey texture, same UV as the layer). */
  maskId?: string | null
  visible: boolean
  /** 0..1 */
  opacity: number
  blend: BlendMode
  /** Column-major mat3 mapping document pixels → layer UV (see core `docToLayerUVMatrix`). */
  docToLayer: Float32Array
  effects: EffectParams
}

export interface RenderScene {
  width: number
  height: number
  /** Bottom → top. */
  layers: RenderLayer[]
}

export interface ViewParams {
  /** CSS px per document px */
  zoom: number
  /** Screen position (CSS px, relative to the canvas) of the document's top-left corner. */
  panX: number
  panY: number
  dpr: number
  bg: [number, number, number]
  /** Source id of the selection mask (alpha) to outline with marching ants. */
  selectionId?: string | null
  /** Seconds, animates the marching ants. */
  time?: number
}

export interface PixelData {
  data: Uint8Array<ArrayBuffer>
  w: number
  h: number
}

export interface IRectLike {
  x: number
  y: number
  w: number
  h: number
}

/** How an edit changes the pixels (see FS_EDIT). */
export type EditOp =
  | { mode: 'paint'; color: [number, number, number]; opacity: number }
  | { mode: 'erase'; opacity: number }
  | { mode: 'clone'; dx: number; dy: number; opacity: number }
  | {
      mode: 'gradient' | 'gradientSet'
      type: 'linear' | 'radial'
      p0: [number, number]
      p1: [number, number]
      c0: [number, number, number, number]
      c1: [number, number, number, number]
      opacity: number
    }
  | { mode: 'clear' }
  | { mode: 'fill'; color: [number, number, number]; opacity: number }
  | { mode: 'keep' }

/** Restrict an edit to a selection: mask source + matrix from texture px to selection UV. */
export interface EditClip {
  selectionId: string
  toSel: Float32Array
}

const MODE_INDEX: Record<EditOp['mode'], number> = { paint: 0, erase: 1, clone: 2, gradient: 3, clear: 4, fill: 5, keep: 6, gradientSet: 7 }

interface EditSession {
  sourceId: string
  orig: TexInfo
  live: Target
  stroke: Target
  dirty: IRectLike | null
  /** Indices of the 256px tiles actually touched (row-major), so undo stores only those. */
  tiles: Set<number>
}

const EDIT_TILE = 256

/**
 * WebGL2 renderer: every pixel operation (adjustments, blur, blending, painting, zoom) runs on
 * the GPU. Results are cached per layer and per scene, so moving a slider only reprocesses one
 * layer, and panning/zooming only redraws the final on-screen pass.
 */
export class Renderer {
  readonly gl: GL
  readonly maxTextureSize: number
  private prog: Record<'color' | 'blur' | 'detail' | 'composite' | 'present' | 'resample' | 'export' | 'dab' | 'edit' | 'read', Program>
  private pool: TargetPool
  private sources = new Map<string, TexInfo>()
  private processed = new Map<string, { key: string; target: Target }>()
  private comp: { a: Target; b: Target } | null = null
  private compKey = ''
  private compResult: Target | null = null
  private compScale = 1
  private emptyVao: WebGLVertexArrayObject
  private dabVao: WebGLVertexArrayObject
  private dabBuf: WebGLBuffer
  private whiteTex: WebGLTexture
  private edit: EditSession | null = null
  /** Bumped on every live edit so caches know the pixels changed. */
  private editVersion = 0
  /** Textures whose mipmaps match their level 0 (mipmaps are only built when something samples them smaller). */
  private mipped = new Set<WebGLTexture>()
  /** Bumped by `updateSource` (video frames) so cached results made from the old pixels are redone. */
  private versions = new Map<string, number>()
  contextLost = false

  /** An OffscreenCanvas works too (video export renders without anything on screen). */
  constructor(readonly canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = (canvas as HTMLCanvasElement).getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    })
    if (!gl) throw new Error('WebGL2 is not available on this computer.')
    this.gl = gl
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1)
    this.emptyVao = gl.createVertexArray()!
    gl.bindVertexArray(this.emptyVao)
    gl.disable(gl.BLEND)
    this.pool = new TargetPool(gl)
    this.prog = {
      color: new Program(gl, VS_FULLSCREEN, FS_COLOR),
      blur: new Program(gl, VS_FULLSCREEN, FS_BLUR),
      detail: new Program(gl, VS_FULLSCREEN, FS_DETAIL),
      composite: new Program(gl, VS_FULLSCREEN, FS_COMPOSITE),
      present: new Program(gl, VS_FULLSCREEN, FS_PRESENT),
      resample: new Program(gl, VS_FULLSCREEN, FS_RESAMPLE),
      export: new Program(gl, VS_FULLSCREEN, FS_EXPORT),
      dab: new Program(gl, VS_DAB, FS_DAB),
      edit: new Program(gl, VS_FULLSCREEN, FS_EDIT),
      read: new Program(gl, VS_FULLSCREEN, FS_READ)
    }
    // Instanced quads for brush dabs.
    this.dabVao = gl.createVertexArray()!
    this.dabBuf = gl.createBuffer()!
    gl.bindVertexArray(this.dabVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dabBuf)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0)
    gl.vertexAttribDivisor(0, 1)
    gl.bindVertexArray(this.emptyVao)
    // 1×1 white texture, bound when a sampler has nothing to read (no mask / no selection).
    this.whiteTex = createTexture(gl, 1, 1, false)
    gl.bindTexture(gl.TEXTURE_2D, this.whiteTex)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]))

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this.contextLost = true
    })
  }

  /** Human readable GPU name (for the About box / diagnostics). */
  gpuName(): string {
    const gl = this.gl
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER))
  }

  /* ------------------------------ sources ------------------------------ */

  hasSource(id: string): boolean {
    return this.sources.has(id)
  }

  private src(id: string | null | undefined): TexInfo | undefined {
    if (!id) return undefined
    if (this.edit && this.edit.sourceId === id) return this.edit.live
    return this.sources.get(id)
  }

  uploadSource(id: string, image: TexImageSource, w: number, h: number): void {
    this.uploadTiled(id, w, h, image, [])
  }

  /**
   * Upload a bitmap made of an optional base image plus patch tiles that replace parts of it
   * (texSubImage2D replaces pixels, including transparency, so patches win over the base).
   */
  uploadTiled(id: string, w: number, h: number, base: TexImageSource | null, patches: { x: number; y: number; w: number; h: number; image: TexImageSource }[]): void {
    if (this.sources.has(id)) return
    const gl = this.gl
    const tex = createTexture(gl, w, h, true)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    if (base) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, base)
    else {
      // Transparent: clear through a temporary framebuffer (no CPU buffer needed).
      const fb = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.deleteFramebuffer(fb)
      gl.bindTexture(gl.TEXTURE_2D, tex)
    }
    for (const p of patches) gl.texSubImage2D(gl.TEXTURE_2D, 0, p.x, p.y, p.w, p.h, gl.RGBA, gl.UNSIGNED_BYTE, p.image)
    gl.generateMipmap(gl.TEXTURE_2D)
    this.mipped.add(tex)
    this.sources.set(id, { tex, w, h, mips: true })
  }

  /**
   * Replace the pixels of a source (a new video frame). The texture is kept when the size is
   * unchanged; mipmaps are rebuilt only if something samples it smaller.
   */
  updateSource(id: string, image: TexImageSource, w: number, h: number): void {
    const gl = this.gl
    let s = this.sources.get(id)
    if (s && (s.w !== w || s.h !== h)) {
      this.deleteSource(id)
      s = undefined
    }
    if (!s) {
      s = { tex: createTexture(gl, w, h, true), w, h, mips: true }
      this.sources.set(id, s)
    }
    gl.bindTexture(gl.TEXTURE_2D, s.tex)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, image)
    this.mipped.delete(s.tex)
    this.versions.set(id, (this.versions.get(id) ?? 0) + 1)
    this.compKey = ''
  }

  private deleteSource(id: string): void {
    const s = this.sources.get(id)
    if (!s) return
    this.gl.deleteTexture(s.tex)
    this.mipped.delete(s.tex)
    this.sources.delete(id)
    this.versions.delete(id)
    this.compKey = ''
  }

  /** Free GPU memory for sources / layers that are no longer part of the document. */
  retain(sourceIds: Set<string>, layerIds: Set<string>): void {
    for (const id of [...this.sources.keys()]) {
      if (!sourceIds.has(id) && this.edit?.sourceId !== id) this.deleteSource(id)
    }
    for (const [id, p] of this.processed) {
      if (!layerIds.has(id)) {
        deleteTarget(this.gl, p.target)
        this.mipped.delete(p.target.tex)
        this.processed.delete(id)
      }
    }
  }

  /* ------------------------------ passes ------------------------------ */

  private draw(target: Target | null, w: number, h: number): void {
    const gl = this.gl
    if (target) this.mipped.delete(target.tex)
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null)
    gl.viewport(0, 0, w, h)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  private mip(t: TexInfo): void {
    if (!t.mips || this.mipped.has(t.tex)) return
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, t.tex)
    gl.generateMipmap(gl.TEXTURE_2D)
    this.mipped.add(t.tex)
  }

  /** How many texels of `srcW` are covered by one document pixel (> 1 means the layer is shown smaller). */
  private static minification(m: Float32Array, srcW: number, srcH: number): number {
    return Math.max(Math.hypot(m[0], m[1]) * srcW, Math.hypot(m[3], m[4]) * srcH)
  }

  private colorPass(src: TexInfo, e: EffectParams, out: Target): void {
    this.prog.color
      .use()
      .tex('uSrc', 0, src.tex)
      .f2('uSize', out.w, out.h)
      .f1('uExposure', e.exposure)
      .f1('uBrightness', e.brightness)
      .f1('uContrast', e.contrast)
      .f1('uHighlights', e.highlights)
      .f1('uShadows', e.shadows)
      .f1('uTemperature', e.temperature)
      .f1('uTint', e.tint)
      .f1('uHue', e.hue)
      .f1('uSaturation', e.saturation)
      .f1('uVibrance', e.vibrance)
      .f1('uFade', e.fade)
      .f1('uMono', e.mono)
      .f1('uSplitAmount', e.splitAmount)
      .f3('uSplitShadow', e.splitShadow)
      .f3('uSplitHighlight', e.splitHighlight)
      .f1('uVignette', e.vignette)
      .f1('uGrain', e.grain)
    this.draw(out, out.w, out.h)
  }

  /** Gaussian blur; large radii are computed at reduced resolution (source needs mipmaps). */
  private blur(src: TexInfo, sigma: number): Target {
    const f = Math.max(1, sigma / 6)
    const tw = Math.max(1, Math.ceil(src.w / f))
    const th = Math.max(1, Math.ceil(src.h / f))
    const s = sigma / f
    if (f > 1.5) this.mip(src)
    const tmp = this.pool.acquire(tw, th, false)
    const out = this.pool.acquire(tw, th, false)
    const p = this.prog.blur.use()
    p.tex('uSrc', 0, src.tex).f2('uOut', tw, th).f2('uStep', 1 / tw, 0).f1('uSigma', s)
    this.draw(tmp, tw, th)
    p.tex('uSrc', 0, tmp.tex).f2('uStep', 0, 1 / th)
    this.draw(out, tw, th)
    this.pool.release(tmp)
    return out
  }

  /** Run the whole effects chain of one layer: src → out (same aspect, usually same size). */
  private applyEffects(src: TexInfo, e: EffectParams, out: Target): void {
    const w = out.w
    const h = out.h
    const needDetail = e.sharpen > 0 || e.clarity !== 0
    const needBlur = e.blur > 0
    if (!needDetail && !needBlur) {
      this.colorPass(src, e, out)
      return
    }
    const temps: Target[] = []
    const colored = this.pool.acquire(w, h, true)
    temps.push(colored)
    this.colorPass(src, { ...e, vignette: 0, grain: 0 }, colored)
    let cur: TexInfo = colored

    if (needDetail) {
      const small = e.sharpen > 0 ? this.blur(colored, 1.0) : null
      const large = e.clarity !== 0 ? this.blur(colored, Math.max(2, 0.012 * Math.max(w, h))) : null
      const det = this.pool.acquire(w, h, true)
      this.prog.detail
        .use()
        .tex('uSrc', 0, colored.tex)
        .tex('uSmall', 1, (small ?? colored).tex)
        .tex('uLarge', 2, (large ?? colored).tex)
        .f2('uSize', w, h)
        .f1('uSharpen', e.sharpen)
        .f1('uClarity', e.clarity)
      this.draw(det, w, h)
      if (small) temps.push(small)
      if (large) temps.push(large)
      temps.push(det)
      cur = det
    }

    if (needBlur) {
      const b = this.blur(cur, e.blur * 0.015 * Math.max(w, h))
      temps.push(b)
      cur = b
    }

    // Final pass: vignette + grain at full resolution (also upsamples a blurred result).
    this.colorPass(cur, { ...NEUTRAL_EFFECTS, vignette: e.vignette, grain: e.grain }, out)
    for (const t of temps) this.pool.release(t)
  }

  /**
   * Apply a layer's effects. `scale` is the composite resolution relative to the document:
   * when the picture is shown small, effects are computed on a smaller copy (much faster),
   * and the full resolution is used again when zooming in or exporting.
   */
  private processLayer(l: RenderLayer, scale: number): TexInfo | null {
    const src = this.src(l.sourceId)
    if (!src) return null
    const cached = this.processed.get(l.id)
    if (isNeutral(l.effects)) {
      if (cached) {
        deleteTarget(this.gl, cached.target)
        this.mipped.delete(cached.target.tex)
        this.processed.delete(l.id)
      }
      return src
    }
    // Layer texels per composite pixel → how much resolution we can drop (power-of-two steps).
    const perPx = Renderer.minification(l.docToLayer, src.w, src.h) / scale
    const q = perPx <= 1 ? 1 : Math.min(1, Math.pow(2, Math.ceil(Math.log2(1 / perPx))))
    const w = Math.max(1, Math.ceil(src.w * q))
    const h = Math.max(1, Math.ceil(src.h * q))
    const live = this.edit?.sourceId === l.sourceId ? `|live${this.editVersion}` : ''
    const key = `${l.sourceId}@${this.versions.get(l.sourceId) ?? 0}${live}|${w}x${h}|${JSON.stringify(l.effects)}`
    if (cached && cached.key === key) return cached.target
    let target = cached?.target
    if (!target || target.w !== w || target.h !== h) {
      if (target) {
        deleteTarget(this.gl, target)
        this.mipped.delete(target.tex)
      }
      target = createTarget(this.gl, w, h, true)
    }
    this.applyEffects(src, l.effects, target)
    this.processed.set(l.id, { key, target })
    return target
  }

  /* ------------------------------ scene ------------------------------ */

  private sceneKey(s: RenderScene, scale: number): string {
    return JSON.stringify({
      w: s.width,
      h: s.height,
      scale,
      ev: this.edit ? this.editVersion : 0,
      l: s.layers.map((l) => ({ ...l, docToLayer: Array.from(l.docToLayer) }))
    })
  }

  /**
   * Composite all layers. `scale` = resolution relative to the document (1 = full size, used
   * for export; the screen uses a lower power-of-two scale when zoomed out). Cached until the
   * scene changes.
   */
  renderScene(scene: RenderScene, scale = 1): Target {
    const gl = this.gl
    const key = this.sceneKey(scene, scale)
    if (key === this.compKey && this.compResult) return this.compResult
    const w = Math.max(1, Math.ceil(scene.width * scale))
    const h = Math.max(1, Math.ceil(scene.height * scale))
    if (!this.comp || this.comp.a.w !== w || this.comp.a.h !== h) {
      if (this.comp) {
        deleteTarget(gl, this.comp.a)
        deleteTarget(gl, this.comp.b)
      }
      this.comp = { a: createTarget(gl, w, h, true), b: createTarget(gl, w, h, true) }
    }
    let cur = this.comp.a
    let other = this.comp.b
    gl.bindFramebuffer(gl.FRAMEBUFFER, cur.fb)
    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    this.mipped.delete(cur.tex)

    for (const l of scene.layers) {
      if (!l.visible || l.opacity <= 0) continue
      const tex = this.processLayer(l, scale)
      if (!tex) continue
      if (Renderer.minification(l.docToLayer, tex.w, tex.h) / scale > 1.1) this.mip(tex)
      const mask = this.src(l.maskId)
      if (mask && Renderer.minification(l.docToLayer, mask.w, mask.h) / scale > 1.1) this.mip(mask)
      this.prog.composite
        .use()
        .tex('uBackdrop', 0, cur.tex)
        .tex('uLayer', 1, tex.tex)
        .tex('uMask', 2, mask?.tex ?? this.whiteTex)
        .i1('uHasMask', mask ? 1 : 0)
        .m3('uDocToLayer', l.docToLayer)
        .f1('uInvScale', 1 / scale)
        .f1('uOpacity', l.opacity)
        .i1('uBlend', blendIndex(l.blend))
      this.draw(other, w, h)
      ;[cur, other] = [other, cur]
    }
    this.compKey = key
    this.compResult = cur
    this.compScale = scale
    return cur
  }

  /** Draw the document on the canvas. The caller keeps canvas.width/height in device pixels. */
  present(scene: RenderScene, view: ViewParams): void {
    if (this.contextLost) return
    const { dpr } = view
    const zoom = view.zoom * dpr
    // Render just enough pixels for the screen (power-of-two steps limit re-renders while zooming).
    const scale = zoom >= 1 ? 1 : Math.min(1, Math.pow(2, Math.ceil(Math.log2(Math.max(zoom, 1 / 64)))))
    const comp = this.renderScene(scene, scale)
    if (zoom < 0.95 * scale) this.mip(comp)
    const sel = this.src(view.selectionId)
    if (sel && zoom < 0.95) this.mip(sel)
    this.prog.present
      .use()
      .tex('uTex', 0, comp.tex)
      .tex('uSel', 1, sel?.tex ?? this.whiteTex)
      .i1('uHasSel', sel ? 1 : 0)
      .f1('uTime', view.time ?? 0)
      .f1('uDpr', dpr)
      .f2('uDocSize', scene.width, scene.height)
      .f2('uCanvas', this.canvas.width, this.canvas.height)
      .f2('uPan', view.panX * dpr, view.panY * dpr)
      .f1('uZoom', zoom)
      .f1('uChecker', 8 * dpr)
      .f1('uShadow', 16 * dpr)
      .i1('uNearest', zoom >= 3 ? 1 : 0)
      .f3('uBg', view.bg)
    this.draw(null, this.canvas.width, this.canvas.height)
  }

  /** Clear the canvas to the workspace colour (no document open). */
  clear(bg: [number, number, number]): void {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(bg[0], bg[1], bg[2], 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  /** Render the scene at any size and read back straight-alpha RGBA (top row first). */
  exportPixels(scene: RenderScene, outW: number, outH: number, flatten: [number, number, number] | null): PixelData {
    const comp = this.renderScene(scene)
    return this.readBack(comp, outW, outH, flatten)
  }

  /** Colour of the rendered picture at a document point (uses the current on-screen render). */
  pickColor(scene: RenderScene, x: number, y: number): [number, number, number, number] | null {
    if (x < 0 || y < 0 || x >= scene.width || y >= scene.height) return null
    const comp = this.renderScene(scene, this.compScale)
    const px = this.readRect(comp, { x: Math.floor(x * this.compScale), y: Math.floor(y * this.compScale), w: 1, h: 1 })
    return [px.data[0], px.data[1], px.data[2], px.data[3]]
  }

  private readBack(src: TexInfo, outW: number, outH: number, flatten: [number, number, number] | null): PixelData {
    const gl = this.gl
    const w = Math.max(1, Math.min(this.maxTextureSize, Math.round(outW)))
    const h = Math.max(1, Math.min(this.maxTextureSize, Math.round(outH)))
    if (w < src.w * 0.95 || h < src.h * 0.95) this.mip(src)
    const out = createTarget(gl, w, h, false)
    this.prog.export
      .use()
      .tex('uTex', 0, src.tex)
      .f2('uOut', w, h)
      .f4('uFlatten', flatten ? [...flatten, 1] : [0, 0, 0, 0])
    this.draw(out, w, h)
    const data = new Uint8Array(w * h * 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb)
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    deleteTarget(gl, out)
    return { data, w, h }
  }

  /** Exact (1:1) straight-alpha pixels of a rectangle of a texture. */
  private readRect(src: TexInfo, r: IRectLike): PixelData {
    const gl = this.gl
    const out = createTarget(gl, r.w, r.h, false)
    this.prog.read.use().tex('uTex', 0, src.tex).f2('uOffset', r.x, r.y)
    this.draw(out, r.w, r.h)
    const data = new Uint8Array(r.w * r.h * 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb)
    gl.readPixels(0, 0, r.w, r.h, gl.RGBA, gl.UNSIGNED_BYTE, data)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    deleteTarget(gl, out)
    return { data, w: r.w, h: r.h }
  }

  private smallCopy(sourceId: string, maxSize: number): Target | null {
    const src = this.src(sourceId)
    if (!src) return null
    const k = Math.min(1, maxSize / Math.max(src.w, src.h))
    const tw = Math.max(1, Math.round(src.w * k))
    const th = Math.max(1, Math.round(src.h * k))
    if (k < 0.95) this.mip(src)
    const base = this.pool.acquire(tw, th, true)
    this.prog.resample.use().tex('uTex', 0, src.tex).f2('uOut', tw, th)
    this.draw(base, tw, th)
    return base
  }

  /** Small previews of one source with different effects (filter thumbnails). */
  renderPreviews(sourceId: string, list: EffectParams[], maxSize: number): PixelData[] {
    const base = this.smallCopy(sourceId, maxSize)
    if (!base) return []
    const out = this.pool.acquire(base.w, base.h, true)
    const result = list.map((e) => {
      this.applyEffects(base, e, out)
      return this.readBack(out, base.w, base.h, null)
    })
    this.pool.release(out)
    this.pool.release(base)
    return result
  }

  /** Downscaled straight-alpha pixels of a source (for analysis like auto-enhance). */
  readSource(sourceId: string, maxSize: number): PixelData | null {
    const base = this.smallCopy(sourceId, maxSize)
    if (!base) return null
    const px = this.readBack(base, base.w, base.h, null)
    this.pool.release(base)
    return px
  }

  /* ------------------------------ editing pixels ------------------------------ */

  /**
   * Start editing a source texture (a layer's pixels or its mask). While editing, every scene
   * that uses this source shows the live result. Finish with `endEdit` + `adoptEdit`, or `cancelEdit`.
   */
  beginEdit(sourceId: string): boolean {
    this.cancelEdit()
    const orig = this.sources.get(sourceId)
    if (!orig) return false
    const gl = this.gl
    const live = createTarget(gl, orig.w, orig.h, true)
    this.prog.resample.use().tex('uTex', 0, orig.tex).f2('uOut', orig.w, orig.h)
    this.draw(live, orig.w, orig.h)
    const stroke = createTarget(gl, orig.w, orig.h, false)
    gl.bindFramebuffer(gl.FRAMEBUFFER, stroke.fb)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    this.edit = { sourceId, orig, live, stroke, dirty: null, tiles: new Set() }
    this.editVersion++
    this.compKey = ''
    return true
  }

  get editing(): string | null {
    return this.edit?.sourceId ?? null
  }

  /** Stamp brush dabs (x, y, radius, unused) in texture pixels into the stroke buffer. */
  editDabs(dabs: Float32Array, hardness: number): void {
    const e = this.edit
    if (!e || dabs.length < 4) return
    const gl = this.gl
    const n = Math.floor(dabs.length / 4)
    gl.bindVertexArray(this.dabVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dabBuf)
    gl.bufferData(gl.ARRAY_BUFFER, dabs, gl.DYNAMIC_DRAW)
    gl.bindFramebuffer(gl.FRAMEBUFFER, e.stroke.fb)
    gl.viewport(0, 0, e.stroke.w, e.stroke.h)
    this.prog.dab.use().f2('uSize', e.stroke.w, e.stroke.h).f1('uHardness', hardness)
    gl.enable(gl.BLEND)
    gl.blendEquation(gl.MAX)
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n)
    gl.disable(gl.BLEND)
    gl.blendEquation(gl.FUNC_ADD)
    gl.bindVertexArray(this.emptyVao)
    for (let i = 0; i < n; i++) {
      const r = dabs[i * 4 + 2] + 2
      this.addDirty({ x: dabs[i * 4] - r, y: dabs[i * 4 + 1] - r, w: r * 2, h: r * 2 })
    }
  }

  private addDirty(r: IRectLike): void {
    const e = this.edit!
    const x0 = Math.max(0, Math.floor(r.x))
    const y0 = Math.max(0, Math.floor(r.y))
    const x1 = Math.min(e.orig.w, Math.ceil(r.x + r.w))
    const y1 = Math.min(e.orig.h, Math.ceil(r.y + r.h))
    if (x1 <= x0 || y1 <= y0) return
    const cols = Math.ceil(e.orig.w / EDIT_TILE)
    for (let ty = Math.floor(y0 / EDIT_TILE); ty <= Math.floor((y1 - 1) / EDIT_TILE); ty++)
      for (let tx = Math.floor(x0 / EDIT_TILE); tx <= Math.floor((x1 - 1) / EDIT_TILE); tx++) e.tiles.add(ty * cols + tx)
    const d = e.dirty
    e.dirty = d
      ? { x: Math.min(d.x, x0), y: Math.min(d.y, y0), w: Math.max(d.x + d.w, x1) - Math.min(d.x, x0), h: Math.max(d.y + d.h, y1) - Math.min(d.y, y0) }
      : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  }

  /**
   * Recompute the live pixels. Brush modes (paint/erase/clone) use the stroke buffer inside the
   * dirty area; other modes affect `area` (texture px; the whole texture if omitted).
   */
  editApply(op: EditOp, clip: EditClip | null, area?: IRectLike): void {
    const e = this.edit
    if (!e) return
    const gl = this.gl
    const brush = op.mode === 'paint' || op.mode === 'erase' || op.mode === 'clone'
    if (!brush) this.addDirty(area ?? { x: 0, y: 0, w: e.orig.w, h: e.orig.h })
    const d = e.dirty
    if (!d) return
    const sel = clip ? this.src(clip.selectionId) : undefined
    const p = this.prog.edit
      .use()
      .tex('uOrig', 0, e.orig.tex)
      .tex('uStroke', 1, e.stroke.tex)
      .tex('uSel', 2, sel?.tex ?? this.whiteTex)
      .i1('uHasSel', sel ? 1 : 0)
      .m3('uToSel', clip?.toSel ?? new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]))
      .f2('uSize', e.orig.w, e.orig.h)
      .i1('uMode', MODE_INDEX[op.mode])
    if (op.mode === 'paint' || op.mode === 'fill') p.f3('uColor', op.color).f1('uOpacity', op.opacity)
    if (op.mode === 'erase') p.f1('uOpacity', op.opacity)
    if (op.mode === 'clone') p.f1('uOpacity', op.opacity).f2('uOffset', op.dx, op.dy)
    if (op.mode === 'gradient' || op.mode === 'gradientSet') {
      p.f2('uG0', op.p0[0], op.p0[1])
        .f2('uG1', op.p1[0], op.p1[1])
        .i1('uGradType', op.type === 'linear' ? 0 : 1)
        .f4('uGC0', op.c0)
        .f4('uGC1', op.c1)
        .f1('uOpacity', op.opacity)
    }
    gl.enable(gl.SCISSOR_TEST)
    gl.scissor(d.x, d.y, d.w, d.h)
    this.draw(e.live, e.orig.w, e.orig.h)
    gl.disable(gl.SCISSOR_TEST)
    this.editVersion++
    this.compKey = ''
  }

  /** Reset the live pixels and the stroke buffer (e.g. while dragging a gradient). */
  editReset(): void {
    const e = this.edit
    if (!e) return
    const gl = this.gl
    this.prog.resample.use().tex('uTex', 0, e.orig.tex).f2('uOut', e.orig.w, e.orig.h)
    this.draw(e.live, e.orig.w, e.orig.h)
    gl.bindFramebuffer(gl.FRAMEBUFFER, e.stroke.fb)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    e.dirty = null
    e.tiles.clear()
    this.editVersion++
    this.compKey = ''
  }

  /**
   * Finish an edit: returns the changed rectangle (grown to whole 256px tiles) and its
   * straight-alpha pixels. The live texture stays alive until `adoptEdit` or `cancelEdit`.
   */
  endEdit(tile = EDIT_TILE): { rect: IRectLike; pixels: PixelData; tiles: number[] } | null {
    const e = this.edit
    if (!e || !e.dirty) return null
    const x0 = Math.floor(e.dirty.x / tile) * tile
    const y0 = Math.floor(e.dirty.y / tile) * tile
    const x1 = Math.min(e.orig.w, Math.ceil((e.dirty.x + e.dirty.w) / tile) * tile)
    const y1 = Math.min(e.orig.h, Math.ceil((e.dirty.y + e.dirty.h) / tile) * tile)
    const rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
    return { rect, pixels: this.readRect(e.live, rect), tiles: [...e.tiles] }
  }

  /** Register the edited pixels as a new source (no upload needed: the texture is reused). */
  adoptEdit(newId: string): void {
    const e = this.edit
    if (!e) return
    const gl = this.gl
    gl.deleteFramebuffer(e.live.fb)
    deleteTarget(gl, e.stroke)
    this.sources.set(newId, { tex: e.live.tex, w: e.live.w, h: e.live.h, mips: true })
    this.edit = null
    this.compKey = ''
  }

  cancelEdit(): void {
    const e = this.edit
    if (!e) return
    deleteTarget(this.gl, e.live)
    deleteTarget(this.gl, e.stroke)
    this.mipped.delete(e.live.tex)
    this.edit = null
    this.editVersion++
    this.compKey = ''
  }

  dispose(): void {
    const gl = this.gl
    this.cancelEdit()
    for (const s of this.sources.values()) gl.deleteTexture(s.tex)
    for (const p of this.processed.values()) deleteTarget(gl, p.target)
    if (this.comp) {
      deleteTarget(gl, this.comp.a)
      deleteTarget(gl, this.comp.b)
    }
    this.pool.clear()
    this.sources.clear()
    this.processed.clear()
    this.mipped.clear()
    this.comp = null
    this.compResult = null
    this.compKey = ''
  }
}
