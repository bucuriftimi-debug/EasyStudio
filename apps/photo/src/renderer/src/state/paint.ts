import i18next from 'i18next'
import { alignToTiles, docToLayer, floodMask, hexToUnit, layerTexToDocUVMatrix, parseHex, toHex, type Vec2 } from '@easystudio/core'
import type { EditClip, EditOp, Renderer } from '@easystudio/gpu'
import { buildScene, getRenderer, syncSources } from '../gpuHost'
import { addBitmap, addBlankBitmap, bitmapImageData, derivePatched, getBitmap, type StoredBitmap } from './bitmaps'
import * as ops from './docOps'
import { selectionInLayer } from './selection'
import { commit, getDoc, rememberColor, setColor, toast, useEditor } from './store'
import type { Layer, PhotoDoc, RasterLayer } from './types'

const t = (k: string, o?: Record<string, unknown>) => i18next.t(k, o) as string
const st = () => useEditor.getState()

/** Where an edit writes: a picture layer's pixels or any layer's mask. */
interface PaintTarget {
  layer: Layer
  kind: 'pixels' | 'mask'
  bitmap: StoredBitmap
}

function currentTarget(): PaintTarget | null {
  const doc = getDoc()
  if (!doc) return null
  const layer = ops.activeLayer(doc)
  if (!layer) return null
  if (st().editMask && layer.mask) {
    const bm = getBitmap(layer.mask.bitmapId)
    return bm ? { layer, kind: 'mask', bitmap: bm } : null
  }
  if (layer.type !== 'raster') return null
  const bm = getBitmap(layer.bitmapId)
  return bm ? { layer, kind: 'pixels', bitmap: bm } : null
}

/**
 * Target for painting. Text and shape layers can't be painted on, so (like in Canva) we quietly
 * add a new transparent layer above them and paint there.
 */
function paintTarget(): PaintTarget | null {
  const cur = currentTarget()
  if (cur) return cur
  const doc = getDoc()
  if (!doc) return null
  const bm = addBlankBitmap(doc.width, doc.height, null)
  const layer = ops.createLayer(bm.id, doc.width, doc.height, t('layers.layer', { n: doc.layers.length + 1 }))
  commit(t('history.newLayer'), (d) => ops.addLayer(d, layer))
  toast(t('msg.autoLayer'))
  return { layer, kind: 'pixels', bitmap: bm }
}

function texPoint(tg: PaintTarget, p: Vec2): Vec2 {
  const l = tg.layer
  const q = docToLayer(l.transform, l.width, l.height, p)
  return { x: (q.x * tg.bitmap.width) / l.width, y: (q.y * tg.bitmap.height) / l.height }
}

/** Texture pixels per document pixel for a target (brush radius conversion). */
function texPerDoc(tg: PaintTarget): number {
  const l = tg.layer
  const s = (Math.abs(l.transform.sx) + Math.abs(l.transform.sy)) / 2
  return tg.bitmap.width / l.width / s
}

function clipFor(tg: PaintTarget, doc: PhotoDoc): EditClip | null {
  const sel = st().selection
  if (!sel) return null
  const l = tg.layer
  return { selectionId: sel.id, toSel: layerTexToDocUVMatrix(l.transform, l.width, l.height, tg.bitmap.width, tg.bitmap.height, doc.width, doc.height) }
}

function ready(tg: PaintTarget): Renderer | null {
  const r = getRenderer()
  const doc = getDoc()
  if (!r || !doc) return null
  syncSources(r, doc, st().selection)
  return r.beginEdit(tg.bitmap.id) ? r : null
}

/** Turn the finished GPU edit into a new bitmap (only changed tiles are stored) and commit it. */
function finalize(r: Renderer, tg: PaintTarget, label: string): boolean {
  const res = r.endEdit()
  if (!res) {
    r.cancelEdit()
    return false
  }
  const img = new ImageData(new Uint8ClampedArray(res.pixels.data.buffer), res.rect.w, res.rect.h)
  const bm = derivePatched(tg.bitmap, res.rect, img, res.tiles)
  r.adoptEdit(bm.id)
  commit(label, (d) =>
    tg.kind === 'mask'
      ? ops.updateLayer(d, tg.layer.id, (l) => ({ mask: { ...(l.mask ?? { enabled: true }), bitmapId: bm.id } }))
      : ops.updateLayer(d, tg.layer.id, { bitmapId: bm.id })
  )
  return true
}

/* ------------------------------ brush / eraser / clone ------------------------------ */

export type BrushTool = 'brush' | 'eraser' | 'clone'

interface StrokeState {
  tool: BrushTool
  tg: PaintTarget
  r: Renderer
  op: EditOp
  clip: EditClip | null
  radius: number
  hardness: number
  smoothing: number
  last: Vec2
  smooth: Vec2
  /** Real pointer position (the smoothed brush lags behind it). */
  raw: Vec2
  leftover: number
}

let stroke: StrokeState | null = null
let lastEnd: { layerId: string; p: Vec2 } | null = null
let cloneSource: Vec2 | null = null
let cloneOffset: Vec2 | null = null

export const isStroking = () => !!stroke

export function setCloneSource(p: Vec2): void {
  cloneSource = p
  cloneOffset = null
  toast(t('msg.cloneSource'))
}

export function getCloneSource(): Vec2 | null {
  return cloneSource
}

function brushSettings(tool: BrushTool) {
  const s = st().settings
  if (tool === 'eraser') return { size: s.eraserSize, hardness: s.eraserHardness, opacity: s.eraserOpacity }
  if (tool === 'clone') return { size: s.cloneSize, hardness: s.cloneHardness, opacity: s.cloneOpacity }
  return { size: s.brushSize, hardness: s.brushHardness, opacity: s.brushOpacity }
}

function dabs(from: Vec2, to: Vec2, radius: number, pressure: number, first: boolean): Float32Array {
  const s = stroke!
  const r = Math.max(0.5, radius * pressure)
  const spacing = Math.max(0.5, r * 0.12)
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.hypot(dx, dy)
  const out: number[] = []
  if (first) out.push(from.x, from.y, r, 0)
  let d = spacing - s.leftover
  while (d <= dist) {
    const k = d / dist
    out.push(from.x + dx * k, from.y + dy * k, r, 0)
    d += spacing
  }
  s.leftover = dist - (d - spacing)
  return new Float32Array(out)
}

export function beginStroke(tool: BrushTool, p: Vec2, pressure: number, shiftLine: boolean): boolean {
  const doc = getDoc()
  if (!doc || stroke) return false
  if (tool === 'clone' && !cloneSource) {
    toast(t('msg.cloneNeedsSource'))
    return false
  }
  const tg = paintTarget()
  if (!tg) return false
  const r = ready(tg)
  if (!r) return false
  const set = brushSettings(tool)
  const opacity = set.opacity / 100
  const pt = texPoint(tg, p)
  let op: EditOp
  if (tg.kind === 'mask') op = tool === 'eraser' ? { mode: 'paint', color: [1, 1, 1], opacity } : { mode: 'erase', opacity }
  else if (tool === 'eraser') op = { mode: 'erase', opacity }
  else if (tool === 'clone') {
    if (!cloneOffset) {
      const src = texPoint(tg, cloneSource!)
      cloneOffset = { x: src.x - pt.x, y: src.y - pt.y }
    }
    op = { mode: 'clone', dx: cloneOffset.x, dy: cloneOffset.y, opacity }
  } else op = { mode: 'paint', color: hexToUnit(st().fg), opacity }

  stroke = {
    tool,
    tg,
    r,
    op,
    clip: clipFor(tg, doc),
    radius: (set.size / 2) * texPerDoc(tg),
    hardness: set.hardness / 100,
    smoothing: tool === 'brush' ? st().settings.brushSmoothing / 100 : 0,
    last: pt,
    smooth: pt,
    raw: pt,
    leftover: 0
  }
  const from = shiftLine && lastEnd?.layerId === tg.layer.id ? lastEnd.p : pt
  r.editDabs(dabs(from, pt, stroke.radius, pressure, true), stroke.hardness)
  r.editApply(op, stroke.clip)
  return true
}

export function continueStroke(p: Vec2, pressure: number): void {
  const s = stroke
  if (!s) return
  const pt = texPoint(s.tg, p)
  s.raw = pt
  // "Lazy mouse" smoothing: the brush follows the pointer with a little delay.
  const k = 1 - s.smoothing * 0.85
  s.smooth = { x: s.smooth.x + (pt.x - s.smooth.x) * k, y: s.smooth.y + (pt.y - s.smooth.y) * k }
  const d = dabs(s.last, s.smooth, s.radius, pressure, false)
  s.last = s.smooth
  if (!d.length) return
  s.r.editDabs(d, s.hardness)
  s.r.editApply(s.op, s.clip)
}

export function endStroke(): void {
  const s = stroke
  if (!s) return
  // With smoothing the brush lags behind: finish the line where the pointer actually stopped.
  if (s.smoothing > 0 && Math.hypot(s.raw.x - s.last.x, s.raw.y - s.last.y) > 0.5) {
    const d = dabs(s.last, s.raw, s.radius, 1, false)
    if (d.length) {
      s.r.editDabs(d, s.hardness)
      s.r.editApply(s.op, s.clip)
    }
    s.last = s.raw
  }
  stroke = null
  const label = t(`history.${s.tg.kind === 'mask' ? 'maskPaint' : s.tool}`)
  if (finalize(s.r, s.tg, label)) {
    lastEnd = { layerId: s.tg.layer.id, p: s.last }
    if (s.tool === 'brush' && s.tg.kind === 'pixels') rememberColor(st().fg)
  }
}

export function cancelStroke(): void {
  if (!stroke) return
  stroke.r.cancelEdit()
  stroke = null
}

/* ------------------------------ gradient ------------------------------ */

let gradient: { tg: PaintTarget; r: Renderer; p0: Vec2; clip: EditClip | null } | null = null

export function beginGradient(p: Vec2): boolean {
  const doc = getDoc()
  if (!doc) return false
  const tg = paintTarget()
  if (!tg) return false
  const r = ready(tg)
  if (!r) return false
  gradient = { tg, r, p0: texPoint(tg, p), clip: clipFor(tg, doc) }
  return true
}

export function updateGradient(p: Vec2): void {
  const g = gradient
  if (!g) return
  const s = st()
  const p1 = texPoint(g.tg, p)
  const fg = hexToUnit(s.fg)
  const bg = hexToUnit(s.bg)
  const onMask = g.tg.kind === 'mask'
  g.r.editReset()
  g.r.editApply(
    {
      mode: onMask ? 'gradientSet' : 'gradient',
      type: s.settings.gradientType,
      p0: [g.p0.x, g.p0.y],
      p1: [p1.x, p1.y],
      c0: onMask ? [1, 1, 1, 1] : [...fg, 1],
      c1: onMask ? [1, 1, 1, 0] : s.settings.gradientToTransparent ? [...fg, 0] : [...bg, 1],
      opacity: 1
    },
    g.clip
  )
}

export function endGradient(): void {
  const g = gradient
  gradient = null
  if (g) finalize(g.r, g.tg, t('history.gradient'))
}

export function cancelGradient(): void {
  gradient?.r.cancelEdit()
  gradient = null
}

/* ------------------------------ paint bucket ------------------------------ */

export function bucketFill(p: Vec2): void {
  const doc = getDoc()
  if (!doc) return
  if (st().editMask) return toast(t('msg.bucketMask'))
  const tg = paintTarget()
  if (!tg || tg.kind !== 'pixels') return
  const bm = tg.bitmap
  const q = texPoint(tg, p)
  const img = bitmapImageData(bm)
  const s = st().settings
  const { mask, bounds } = floodMask(img.data, bm.width, bm.height, q.x, q.y, s.fillTolerance, s.fillContiguous)
  if (!bounds) return
  const sel = st().selection
  const selA = sel ? selectionInLayer(sel, tg.layer, bm.width, bm.height).getContext('2d')!.getImageData(0, 0, bm.width, bm.height).data : null
  const c = parseHex(st().fg)!
  const d = img.data
  for (let y = bounds.y; y < bounds.y + bounds.h; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.w; x++) {
      const i = y * bm.width + x
      if (!mask[i]) continue
      const a = selA ? selA[i * 4 + 3] / 255 : 1
      if (a <= 0) continue
      const o = i * 4
      const oa = d[o + 3] / 255
      const na = a + oa * (1 - a)
      d[o] = (c.r * a + d[o] * oa * (1 - a)) / na
      d[o + 1] = (c.g * a + d[o + 1] * oa * (1 - a)) / na
      d[o + 2] = (c.b * a + d[o + 2] * oa * (1 - a)) / na
      d[o + 3] = na * 255
    }
  }
  const rect = alignToTiles(bounds, bm.width, bm.height)
  if (!rect) return
  const part = new ImageData(rect.w, rect.h)
  for (let y = 0; y < rect.h; y++) {
    const start = ((rect.y + y) * bm.width + rect.x) * 4
    part.data.set(d.subarray(start, start + rect.w * 4), y * rect.w * 4)
  }
  const next = derivePatched(bm, rect, part)
  commit(t('history.fill'), (dd) => ops.updateLayer(dd, tg.layer.id, { bitmapId: next.id }))
  rememberColor(st().fg)
}

/* ------------------------------ eyedropper ------------------------------ */

export function pickColor(p: Vec2): void {
  const doc = getDoc()
  const r = getRenderer()
  if (!doc || !r) return
  syncSources(r, doc, st().selection)
  const c = r.pickColor(buildScene(doc), p.x, p.y)
  if (c && c[3] > 0) setColor('fg', toHex({ r: c[0], g: c[1], b: c[2] }))
}

/* ------------------------------ selection pixel operations ------------------------------ */

function selectionArea(tg: PaintTarget) {
  const sel = st().selection!
  const b = sel.bounds
  const pts = [
    texPoint(tg, { x: b.x, y: b.y }),
    texPoint(tg, { x: b.x + b.w, y: b.y }),
    texPoint(tg, { x: b.x + b.w, y: b.y + b.h }),
    texPoint(tg, { x: b.x, y: b.y + b.h })
  ]
  const x = Math.floor(Math.min(...pts.map((p) => p.x))) - 2
  const y = Math.floor(Math.min(...pts.map((p) => p.y))) - 2
  return { x, y, w: Math.ceil(Math.max(...pts.map((p) => p.x))) + 2 - x, h: Math.ceil(Math.max(...pts.map((p) => p.y))) + 2 - y }
}

/** Delete (make transparent / hide on a mask) the selected pixels of the active layer. */
export function clearSelected(): boolean {
  const doc = getDoc()
  const tg = currentTarget()
  if (!doc || !tg || !st().selection) return false
  const r = ready(tg)
  if (!r) return false
  r.editApply({ mode: 'clear' }, clipFor(tg, doc), selectionArea(tg))
  return finalize(r, tg, t('history.clear'))
}

export function fillSelected(color: string): boolean {
  const doc = getDoc()
  if (!doc || !st().selection) return false
  const tg = paintTarget()
  if (!tg) return false
  const r = ready(tg)
  if (!r) return false
  const c: [number, number, number] = tg.kind === 'mask' ? [1, 1, 1] : hexToUnit(color)
  r.editApply({ mode: 'fill', color: c, opacity: 1 }, clipFor(tg, doc), selectionArea(tg))
  rememberColor(color)
  return finalize(r, tg, t('history.fill'))
}

/** Copy (or cut) the selected part of a picture layer into a new layer above it. */
export function layerFromSelection(cut: boolean): boolean {
  const doc = getDoc()
  const tg = currentTarget()
  const sel = st().selection
  if (!doc || !tg || tg.kind !== 'pixels' || !sel) return false
  const clip = clipFor(tg, doc)
  const r0 = ready(tg)
  if (!r0) return false
  r0.editApply({ mode: 'keep' }, clip)
  const res = r0.endEdit(1)
  if (!res) {
    r0.cancelEdit()
    return false
  }
  const c = new OffscreenCanvas(res.rect.w, res.rect.h)
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(res.pixels.data.buffer), res.rect.w, res.rect.h), 0, 0)
  const copy = addBitmap(c)
  r0.adoptEdit(copy.id)
  const src = tg.layer as RasterLayer
  const layer: RasterLayer = {
    ...ops.createLayer(copy.id, src.width, src.height, `${src.name} ${t('layers.copy')}`, src.transform),
    adjust: src.adjust,
    look: src.look
  }
  let cleared: StoredBitmap | null = null
  if (cut) {
    const r1 = ready(tg)
    if (r1) {
      r1.editApply({ mode: 'clear' }, clip, selectionArea(tg))
      const res1 = r1.endEdit()
      if (res1) {
        cleared = derivePatched(tg.bitmap, res1.rect, new ImageData(new Uint8ClampedArray(res1.pixels.data.buffer), res1.rect.w, res1.rect.h), res1.tiles)
        r1.adoptEdit(cleared.id)
      } else r1.cancelEdit()
    }
  }
  commit(t(cut ? 'history.cutLayer' : 'history.copyLayer'), (d) => {
    let next = cleared ? ops.updateLayer(d, src.id, { bitmapId: cleared.id }) : d
    next = ops.addLayer({ ...next, activeLayerId: src.id }, layer)
    return next
  })
  useEditor.setState({ selection: null })
  return true
}

/** Multiply a picture layer by its mask and drop the mask. */
export function applyMask(): boolean {
  const doc = getDoc()
  const layer = doc ? ops.activeLayer(doc) : undefined
  if (!doc || !layer || layer.type !== 'raster' || !layer.mask) return false
  const bm = getBitmap(layer.bitmapId)
  const mask = getBitmap(layer.mask.bitmapId)
  if (!bm || !mask) return false
  const tg: PaintTarget = { layer, kind: 'pixels', bitmap: bm }
  const r = ready(tg)
  if (!r) return false
  r.editApply({ mode: 'keep' }, { selectionId: mask.id, toSel: new Float32Array([1 / bm.width, 0, 0, 0, 1 / bm.height, 0, 0, 0, 1]) })
  const res = r.endEdit()
  if (!res) {
    r.cancelEdit()
    return false
  }
  const next = derivePatched(bm, res.rect, new ImageData(new Uint8ClampedArray(res.pixels.data.buffer), res.rect.w, res.rect.h), res.tiles)
  r.adoptEdit(next.id)
  commit(t('history.applyMask'), (d) => ops.updateLayer(d, layer.id, { bitmapId: next.id, mask: null }))
  useEditor.setState({ editMask: false })
  return true
}
