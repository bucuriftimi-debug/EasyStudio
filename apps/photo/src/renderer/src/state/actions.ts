import i18next from 'i18next'
import { fitRatioRect, fitTransform, floodMask, identityTransform, IMAGE_FORMATS, type ImageFormat, type Vec2 } from '@easystudio/core'
import { autoEnhance, getLook, type AdjustKey, type AdjustValues } from '@easystudio/gpu'
import { addBitmap, addBlankBitmap, decodeImage } from './bitmaps'
import * as ops from './docOps'
import { DEFAULT_SHAPE, DEFAULT_TEXT, layerSource, lineBoxHeight, measureText, renderLayerCanvas } from './gen'
import * as paint from './paint'
import { readProject, writeProject } from './project'
import { readPsd } from './psd'
import { rememberFile } from './files'
import { buildTemplate, type Template } from './templates'
import * as selection from './selection'
import {
  ask,
  beginGesture,
  closeDocument,
  commit,
  endGesture,
  fitView,
  getDoc,
  isDirty,
  live,
  markSaved,
  openDocument,
  setBusy,
  toast,
  useEditor
} from './store'
import type { Layer, PhotoDoc, RasterLayer, SelOp, ShapeKind, ShapeStyle, TextStyle } from './types'
import { buildScene, getRenderer, maxImageSize, syncSources } from '../gpuHost'
import { baseName, fileExt, openFile, saveFile } from '../platform'

const t = (k: string, o?: Record<string, unknown>) => i18next.t(k, o) as string
const set = useEditor.setState

async function confirmDiscard(): Promise<boolean> {
  return !isDirty() || ask(t('msg.discard'), t('msg.discardYes'), t('dialog.cancel'))
}

/* ------------------------------ open / new ------------------------------ */

export async function newDocument(w: number, h: number, background: string | null, name = t('app.untitled')): Promise<void> {
  if (!(await confirmDiscard())) return
  const bm = addBlankBitmap(w, h, background)
  const layer = ops.createLayer(bm.id, w, h, t('layers.background'))
  openDocument(ops.createDoc(name, w, h, layer), t('history.new'))
}

/** Start from a ready-made design (start screen). */
export async function openTemplate(tpl: Template): Promise<void> {
  if (!(await confirmDiscard())) return
  openDocument(await buildTemplate(tpl), t('history.template'))
  toast(t('tpl.hint'), 'info', 6000)
}

async function imageFromBytes(data: Uint8Array | Blob, type?: string) {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type })
  const max = maxImageSize()
  const bmp = await decodeImage(blob, max)
  return addBitmap(bmp)
}

/** Open a file picked by the user or dropped on the window. */
export async function openBytes(name: string, data: Uint8Array | Blob, path: string | null = null): Promise<void> {
  const ext = fileExt(name)
  if (!(await confirmDiscard())) return
  try {
    setBusy(t('msg.opening'))
    if (ext === 'esp') {
      const bytes = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data
      const doc = await readProject(bytes, maxImageSize())
      openDocument(doc, t('history.open'), path)
    } else if (ext === 'psd') {
      const bytes = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data
      const { doc, skipped } = await readPsd(bytes, baseName(name) || t('app.untitled'), maxImageSize())
      openDocument(doc, t('history.open'))
      if (skipped) toast(t('psd.skipped', { n: skipped }), 'info', 7000)
    } else {
      const bm = await imageFromBytes(data)
      const layer = ops.createLayer(bm.id, bm.width, bm.height, baseName(name) || t('layers.background'))
      openDocument(ops.createDoc(baseName(name) || t('app.untitled'), bm.width, bm.height, layer), t('history.open'))
    }
    toast(t('msg.opened', { name }))
    rememberFile(path)
  } catch (e) {
    console.error(e)
    toast(ext === 'esp' || ext === 'psd' ? t('msg.openFailed', { msg: (e as Error).message }) : t('msg.notImage'), 'error', 5000)
  } finally {
    setBusy(null)
  }
}

export async function openDialog(kind: 'image' | 'project' | 'any' = 'any'): Promise<void> {
  const f = await openFile(kind)
  if (f) await openBytes(f.name, f.data, f.path)
}

/** Add a picture as a new layer, scaled down to fit if it is bigger than the canvas. */
export async function addImageLayer(name: string, data: Uint8Array | Blob): Promise<void> {
  const doc = getDoc()
  if (!doc) return openBytes(name, data)
  try {
    const bm = await imageFromBytes(data)
    let tr = { ...identityTransform(bm.width, bm.height), cx: doc.width / 2, cy: doc.height / 2 }
    if (bm.width > doc.width || bm.height > doc.height) tr = fitTransform(tr, bm.width, bm.height, doc.width, doc.height)
    const layer = ops.createLayer(bm.id, bm.width, bm.height, baseName(name) || t('layers.pasted'), tr)
    commit(t('history.addLayer'), (d) => ops.addLayer(d, layer))
    set({ tool: 'move' })
    toast(t('msg.addedLayer'))
  } catch (e) {
    console.error(e)
    toast(t('msg.notImage'), 'error')
  }
}

export async function addImageLayerDialog(): Promise<void> {
  const f = await openFile('image')
  if (f) await addImageLayer(f.name, f.data)
}

export async function pasteImage(blob: Blob): Promise<void> {
  if (getDoc()) await addImageLayer(t('layers.pasted'), blob)
  else await openBytes('pasted.png', blob)
}

export async function closeDoc(): Promise<void> {
  if (await confirmDiscard()) closeDocument()
}

/* ------------------------------ save / export ------------------------------ */

export async function saveProject(saveAs = false): Promise<void> {
  const doc = getDoc()
  if (!doc) return
  try {
    setBusy(t('msg.saving'))
    const data = await writeProject(doc)
    const path = await saveFile(data, `${doc.name}.esp`, [{ name: 'EasyStudio Photo project', extensions: ['esp'] }], saveAs ? null : useEditor.getState().filePath)
    if (path) {
      markSaved(path)
      rememberFile(path)
      if (/[\\/]/.test(path)) {
        const nm = baseName(path)
        if (nm && nm !== doc.name) {
          // Keep the project name in sync with the file name without adding an undo step.
          const h = useEditor.getState().hist!
          const renamed = { ...h.present.state, name: nm }
          set({ hist: { ...h, present: { ...h.present, state: renamed } }, savedDoc: renamed })
        }
      }
      toast(t('msg.saved'), 'success')
    }
  } catch (e) {
    console.error(e)
    toast(t('msg.openFailed', { msg: (e as Error).message }), 'error')
  } finally {
    setBusy(null)
  }
}

export interface ExportSettings {
  format: ImageFormat
  quality: number
  width: number
  height: number
}

export async function renderExport(doc: PhotoDoc, s: ExportSettings): Promise<Blob> {
  const r = getRenderer()
  if (!r) throw new Error('GPU not ready')
  syncSources(r, doc)
  const fmt = IMAGE_FORMATS.find((f) => f.id === s.format)!
  const px = r.exportPixels(buildScene(doc), s.width, s.height, s.format === 'jpeg' ? [1, 1, 1] : null)
  const canvas = new OffscreenCanvas(px.w, px.h)
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px.data.buffer), px.w, px.h), 0, 0)
  return canvas.convertToBlob({ type: fmt.mime, quality: fmt.lossy ? s.quality / 100 : undefined })
}

export async function exportImage(s: ExportSettings, preRendered?: Blob): Promise<boolean> {
  const doc = getDoc()
  if (!doc) return false
  const fmt = IMAGE_FORMATS.find((f) => f.id === s.format)!
  try {
    setBusy(t('msg.exporting'))
    const blob = preRendered ?? (await renderExport(doc, s))
    const name = `${doc.name}.${fmt.ext}`
    const path = await saveFile(blob, name, [{ name: fmt.label, extensions: [fmt.ext] }])
    if (path) toast(t('export.done', { name: baseName(path) + '.' + fmt.ext }), 'success')
    return !!path
  } catch (e) {
    console.error(e)
    toast(t('export.failed', { msg: (e as Error).message }), 'error', 6000)
    return false
  } finally {
    setBusy(null)
  }
}

/* ------------------------------ layers ------------------------------ */

export function activeLayer(): Layer | undefined {
  const d = getDoc()
  return d ? ops.activeLayer(d) : undefined
}

/** Selecting a layer is not an undoable edit and does not mark the document as changed. */
export function selectLayer(id: string): void {
  const s = useEditor.getState()
  const h = s.hist
  if (!h || h.present.state.activeLayerId === id) return
  const next = { ...h.present.state, activeLayerId: id }
  set({
    hist: { ...h, present: { ...h.present, state: next } },
    savedDoc: s.savedDoc === h.present.state ? next : s.savedDoc,
    gestureBase: s.gestureBase ? { ...s.gestureBase, activeLayerId: id } : null
  })
}

export function newEmptyLayer(): void {
  const doc = getDoc()
  if (!doc) return
  const bm = addBlankBitmap(doc.width, doc.height, null)
  const n = doc.layers.length + 1
  commit(t('history.newLayer'), (d) => ops.addLayer(d, ops.createLayer(bm.id, doc.width, doc.height, t('layers.layer', { n }))))
}

export function duplicateActive(): void {
  const l = activeLayer()
  if (!l) return
  if (useEditor.getState().selection && l.type === 'raster') {
    paint.layerFromSelection(false)
    return
  }
  commit(t('history.duplicate'), (d) => ops.duplicateLayer(d, l.id, t('layers.copy')))
}

export function deleteActive(): void {
  const l = activeLayer()
  const doc = getDoc()
  if (!l || !doc) return
  if (useEditor.getState().editMask) set({ editMask: false })
  commit(t('history.delete'), (d) => ops.removeLayer(d, l.id))
}

/** Delete key: clear the selected pixels if there is a selection, otherwise delete the layer. */
export function deleteKey(): void {
  if (useEditor.getState().selection) {
    if (!paint.clearSelected()) toast(t('msg.notPixelLayer'))
    return
  }
  deleteActive()
}

export function moveActive(delta: number): void {
  const l = activeLayer()
  if (l) commit(t('history.reorder'), (d) => ops.moveLayerBy(d, l.id, delta))
}

export function setLayerProp<K extends keyof Layer>(id: string, key: K, value: Layer[K], label: string, gesture = false): void {
  const fn = (d: PhotoDoc) => ops.updateLayer(d, id, { [key]: value } as Partial<RasterLayer>)
  if (gesture) live(label, fn)
  else commit(label, fn)
}

/** Convert a text or shape layer into a normal picture layer (so it can be painted on). */
export function rasterizeActive(): void {
  const l = activeLayer()
  if (!l || l.type === 'raster') return
  const c = renderLayerCanvas(l)
  if (!c) return
  const bm = addBitmap(c)
  const next: RasterLayer = { ...ops.createLayer(bm.id, l.width, l.height, l.name, l.transform), id: l.id, opacity: l.opacity, blend: l.blend, visible: l.visible, adjust: l.adjust, look: l.look, mask: l.mask }
  commit(t('history.rasterize'), (d) => ops.replaceLayer(d, l.id, next))
}

/* ------------------------------ text & shapes ------------------------------ */

export function addText(at?: Vec2, patch: Partial<TextStyle> = {}): void {
  const doc = getDoc()
  if (!doc) return
  const size = Math.max(16, Math.round(Math.min(doc.width, doc.height) * 0.08))
  // Readable by default: dark text on light areas, white text with a soft shadow on dark ones.
  const p = at ?? { x: doc.width / 2, y: doc.height / 2 }
  const r = getRenderer()
  let light = false
  if (r) {
    syncSources(r, doc)
    const c = r.pickColor(buildScene(doc), p.x, p.y)
    if (c) light = c[3] > 128 && (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 > 0.62
  }
  const auto: Partial<TextStyle> = light
    ? { color: '#111111', shadowBlur: 0, shadowY: 0 }
    : { color: '#ffffff', shadowColor: '#000000', shadowBlur: Math.round(size * 0.12), shadowY: Math.round(size * 0.03) }
  const style: TextStyle = { ...DEFAULT_TEXT, size, ...auto, ...patch }
  const box = measureText(style)
  const layer = ops.createTextLayer(style, box, p.x, p.y, t('layers.text'))
  commit(t('history.addText'), (d) => ops.addLayer(d, layer))
  set({ panel: 'props', tool: 'move', editMask: false, focusText: layer.id })
}

/** Change text settings; the layer box is re-measured so it always fits the text. */
export function updateText(patch: Partial<TextStyle>, gesture = false): void {
  const l = activeLayer()
  if (!l || l.type !== 'text') return
  const fn = (d: PhotoDoc) =>
    ops.updateLayer(d, l.id, (cur) => {
      if (cur.type !== 'text') return {}
      const style = { ...cur.style, ...patch }
      const size = measureText(style)
      return { style, width: size.w, height: size.h }
    })
  if (gesture) live(t('history.text'), fn)
  else commit(t('history.text'), fn)
}

export function addShape(kind: ShapeKind, a: Vec2, b: Vec2, square: boolean): void {
  const doc = getDoc()
  if (!doc) return
  const fg = useEditor.getState().fg
  let layer: Layer
  if (kind === 'line' || kind === 'arrow') {
    const sw = Math.max(4, Math.round(Math.min(doc.width, doc.height) * 0.008))
    let dx = b.x - a.x
    let dy = b.y - a.y
    if (square) {
      // Snap to 45° steps.
      const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
      const len = Math.hypot(dx, dy)
      dx = Math.cos(ang) * len
      dy = Math.sin(ang) * len
    }
    const len = Math.max(8, Math.hypot(dx, dy))
    const shape: ShapeStyle = { ...DEFAULT_SHAPE, kind, stroke: fg, strokeWidth: sw, fillEnabled: false }
    const h = lineBoxHeight(sw)
    layer = ops.createShapeLayer(shape, len, h, { cx: a.x + dx / 2, cy: a.y + dy / 2, sx: 1, sy: 1, rot: (Math.atan2(dy, dx) * 180) / Math.PI }, t(`shape.${kind}`))
  } else {
    let w = Math.abs(b.x - a.x)
    let h = Math.abs(b.y - a.y)
    if (square) w = h = Math.max(w, h)
    if (w < 4 || h < 4) {
      // A simple click: make a nicely sized shape centred on the click.
      w = h = Math.round(Math.min(doc.width, doc.height) * 0.3)
      a = { x: a.x - w / 2, y: a.y - h / 2 }
      b = { x: a.x + w, y: a.y + h }
    }
    const x0 = b.x < a.x ? a.x - w : a.x
    const y0 = b.y < a.y ? a.y - h : a.y
    const shape: ShapeStyle = { ...DEFAULT_SHAPE, kind, fill: fg, radius: kind === 'rect' ? 0 : 0 }
    layer = ops.createShapeLayer(shape, w, h, { cx: x0 + w / 2, cy: y0 + h / 2, sx: 1, sy: 1, rot: 0 }, t(`shape.${kind}`))
  }
  commit(t('history.addShape'), (d) => ops.addLayer(d, layer))
  set({ panel: 'props', editMask: false })
}

export function updateShape(patch: Partial<ShapeStyle>, gesture = false): void {
  const l = activeLayer()
  if (!l || l.type !== 'shape') return
  const fn = (d: PhotoDoc) =>
    ops.updateLayer(d, l.id, (cur) => {
      if (cur.type !== 'shape') return {}
      const shape = { ...cur.shape, ...patch }
      const line = shape.kind === 'line' || shape.kind === 'arrow'
      return { shape, height: line ? lineBoxHeight(shape.strokeWidth) : cur.height }
    })
  if (gesture) live(t('history.shape'), fn)
  else commit(t('history.shape'), fn)
}

/**
 * After resizing a text or shape layer with the handles, turn the stretch into real settings
 * (bigger font / bigger box) so they stay crisp and strokes keep their width.
 */
export function bakeScale(d: PhotoDoc, id: string): PhotoDoc {
  return ops.updateLayer(d, id, (l) => {
    const { sx, sy } = l.transform
    if (l.type === 'text') {
      const k = (Math.abs(sx) + Math.abs(sy)) / 2
      if (Math.abs(k - 1) < 1e-3) return {}
      const style = { ...l.style, size: Math.max(4, Math.round(l.style.size * k * 10) / 10) }
      const size = measureText(style)
      return { style, width: size.w, height: size.h, transform: { ...l.transform, sx: Math.sign(sx) || 1, sy: Math.sign(sy) || 1 } }
    }
    if (l.type === 'shape') {
      if (Math.abs(Math.abs(sx) - 1) < 1e-3 && Math.abs(Math.abs(sy) - 1) < 1e-3) return {}
      const line = l.shape.kind === 'line' || l.shape.kind === 'arrow'
      return {
        width: Math.max(2, l.width * Math.abs(sx)),
        height: line ? l.height : Math.max(2, l.height * Math.abs(sy)),
        transform: { ...l.transform, sx: Math.sign(sx) || 1, sy: Math.sign(sy) || 1 }
      }
    }
    return {}
  })
}

/* ------------------------------ layer masks ------------------------------ */

export function addMask(): void {
  const l = activeLayer()
  if (!l || l.mask) return
  const sel = useEditor.getState().selection
  const w = Math.max(1, Math.round(l.width))
  const h = Math.max(1, Math.round(l.height))
  let bmId: string
  if (sel) bmId = addBitmap(selection.selectionInLayer(sel, l, w, h)).id
  else bmId = addBlankBitmap(w, h, '#ffffff').id
  commit(t('history.addMask'), (d) => ops.setMask(d, l.id, { bitmapId: bmId, enabled: true }))
  set({ editMask: true, selection: null })
  toast(t('msg.maskHint'))
}

export function deleteMask(): void {
  const l = activeLayer()
  if (!l?.mask) return
  commit(t('history.deleteMask'), (d) => ops.setMask(d, l.id, null))
  set({ editMask: false })
}

export function toggleMask(): void {
  const l = activeLayer()
  if (!l?.mask) return
  const mask = l.mask
  commit(t('history.toggleMask'), (d) => ops.setMask(d, l.id, { ...mask, enabled: !mask.enabled }))
}

export function applyMask(): void {
  if (!paint.applyMask()) toast(t('msg.notPixelLayer'))
}

/* ------------------------------ selections ------------------------------ */

export function selectShape(shape: selection.SelShape, op: SelOp): void {
  const doc = getDoc()
  if (!doc) return
  set({ selection: selection.combine(doc.width, doc.height, shape, op, useEditor.getState().selection) })
}

export function selectAll(): void {
  const doc = getDoc()
  if (doc) set({ selection: selection.selectAll(doc.width, doc.height) })
}

export function deselect(): void {
  set({ selection: null })
}

export function invertSelection(): void {
  const doc = getDoc()
  if (doc) set({ selection: selection.invert(doc.width, doc.height, useEditor.getState().selection) })
}

export function modifySelection(kind: 'feather' | 'expand' | 'contract', px: number): void {
  const sel = useEditor.getState().selection
  if (!sel || px <= 0) return
  set({ selection: kind === 'feather' ? selection.feather(sel, px) : kind === 'expand' ? selection.expand(sel, px) : selection.contract(sel, px) })
}

/** Magic wand: select similar colours of the visible picture around a point. */
export function magicWand(p: Vec2, op: SelOp): void {
  const doc = getDoc()
  const r = getRenderer()
  if (!doc || !r) return
  syncSources(r, doc, useEditor.getState().selection)
  const px = r.exportPixels(buildScene(doc), doc.width, doc.height, null)
  const s = useEditor.getState().settings
  const { mask, bounds } = floodMask(px.data, doc.width, doc.height, p.x, p.y, s.wandTolerance, s.wandContiguous)
  if (!bounds) return
  selectShape({ kind: 'mask', canvas: selection.fromMask(doc.width, doc.height, mask) }, op)
}

export function cropToSelection(): void {
  const sel = useEditor.getState().selection
  if (!sel) return
  const b = sel.bounds
  commit(t('history.crop'), (d) => ops.cropDoc(d, b))
  set({ selection: null })
  fitView()
}

/** Copy what you see (inside the selection, if any) to the system clipboard as a PNG. */
export async function copyToClipboard(): Promise<void> {
  const doc = getDoc()
  const r = getRenderer()
  if (!doc || !r) return
  syncSources(r, doc)
  const px = r.exportPixels(buildScene(doc), doc.width, doc.height, null)
  const full = new OffscreenCanvas(doc.width, doc.height)
  full.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px.data.buffer), doc.width, doc.height), 0, 0)
  const sel = useEditor.getState().selection
  const b = sel?.bounds ?? { x: 0, y: 0, w: doc.width, h: doc.height }
  const out = new OffscreenCanvas(b.w, b.h)
  const ctx = out.getContext('2d')!
  ctx.drawImage(full, -b.x, -b.y)
  if (sel) {
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(sel.canvas, -b.x, -b.y)
  }
  try {
    const blob = await out.convertToBlob({ type: 'image/png' })
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    toast(t('msg.copied'), 'success')
  } catch (e) {
    console.error(e)
    toast(t('msg.copyFailed'), 'error')
  }
}

/* ------------------------------ adjustments ------------------------------ */

export function setAdjust(key: AdjustKey, value: number): void {
  const l = activeLayer()
  if (!l) return
  const label = t(`adjust.${key}`)
  live(label, (d) =>
    ops.updateLayer(d, l.id, (cur) => {
      const adjust: AdjustValues = { ...cur.adjust, [key]: value }
      if (!value) delete adjust[key]
      return { adjust }
    })
  )
}

export function resetAdjustments(): void {
  const l = activeLayer()
  if (l) commit(t('history.resetAdjust'), (d) => ops.updateLayer(d, l.id, { adjust: {}, look: null }))
}

export function applyAuto(): void {
  const l = activeLayer()
  const r = getRenderer()
  const doc = getDoc()
  if (!l || !r || !doc) return
  syncSources(r, doc)
  const px = r.readSource(layerSource(l).id, 160)
  if (!px) return
  const auto = autoEnhance(px.data)
  commit(t('history.auto'), (d) => ops.updateLayer(d, l.id, { adjust: auto }))
  toast(t('msg.autoDone'), 'success')
}

export function setLook(id: string | null): void {
  const l = activeLayer()
  if (!l) return
  const name = id ? t(getLook(id)?.label ?? id) : t('look.none')
  commit(t('history.look', { name }), (d) => ops.updateLayer(d, l.id, { look: id ? { id, amount: 100 } : null }))
}

export function setLookAmount(amount: number): void {
  const l = activeLayer()
  if (!l?.look) return
  const look = l.look
  live(t('history.lookAmount'), (d) => ops.updateLayer(d, l.id, { look: { ...look, amount } }))
}

/* ------------------------------ image operations ------------------------------ */

/** Operations that move every pixel of the document also drop the selection. */
function docOp(label: string, fn: (d: PhotoDoc) => PhotoDoc): void {
  set({ selection: null })
  commit(label, fn)
}

export const rotateImage = (cw: boolean) => docOp(t('history.rotateImage'), (d) => ops.rotateDoc90(d, cw))
export const flipImage = (axis: 'h' | 'v') => docOp(t('history.flipImage'), (d) => ops.flipDoc(d, axis))
export const resizeImage = (w: number, h: number) => docOp(t('history.resize'), (d) => ops.resizeDoc(d, w, h))
export const resizeCanvas = (w: number, h: number, ax: number, ay: number) => docOp(t('history.canvas'), (d) => ops.resizeCanvas(d, w, h, ax, ay))

export function layerOp(kind: 'flipH' | 'flipV' | 'rotate' | 'fit' | 'reset'): void {
  const l = activeLayer()
  if (!l) return
  const map = {
    flipH: [t('history.flipLayer'), (d: PhotoDoc) => ops.flipLayer(d, l.id, 'h')],
    flipV: [t('history.flipLayer'), (d: PhotoDoc) => ops.flipLayer(d, l.id, 'v')],
    rotate: [t('history.rotateLayer'), (d: PhotoDoc) => ops.rotateLayer(d, l.id, 90)],
    fit: [t('history.fitLayer'), (d: PhotoDoc) => ops.fitLayer(d, l.id)],
    reset: [t('history.resetLayer'), (d: PhotoDoc) => ops.resetLayerTransform(d, l.id)]
  } as const
  const [label, fn] = map[kind]
  commit(label, fn)
}

export function nudgeActive(dx: number, dy: number): void {
  const l = activeLayer()
  if (!l) return
  commit(t('history.nudge'), (d) =>
    ops.updateLayer(d, l.id, (c) => ({ transform: { ...c.transform, cx: c.transform.cx + dx, cy: c.transform.cy + dy } }))
  )
}

/* ------------------------------ crop ------------------------------ */

export function startCrop(ratioId = 'free'): void {
  const doc = getDoc()
  if (!doc) return
  set({ tool: 'crop', crop: { x: 0, y: 0, w: doc.width, h: doc.height, ratioId } })
  if (ratioId !== 'free') setCropRatio(ratioId)
}

export function cropRatioValue(ratioId: string, doc: PhotoDoc, ratios: { id: string; ratio: number }[]): number {
  const r = ratios.find((x) => x.id === ratioId)?.ratio ?? 0
  return r === -1 ? doc.width / doc.height : r
}

export function setCropRatio(ratioId: string, ratioValue?: number): void {
  const doc = getDoc()
  const crop = useEditor.getState().crop
  if (!doc || !crop) return
  if (!ratioValue) {
    set({ crop: { ...crop, ratioId } })
    return
  }
  // Largest rectangle with this shape, centred on the current crop.
  const r = fitRatioRect(doc.width, doc.height, ratioValue)
  const cx = Math.min(Math.max(crop.x + crop.w / 2, r.w / 2), doc.width - r.w / 2)
  const cy = Math.min(Math.max(crop.y + crop.h / 2, r.h / 2), doc.height - r.h / 2)
  set({ crop: { x: cx - r.w / 2, y: cy - r.h / 2, w: r.w, h: r.h, ratioId } })
}

export function applyCrop(): void {
  const { crop } = useEditor.getState()
  if (!crop) return
  docOp(t('history.crop'), (d) => ops.cropDoc(d, crop))
  set({ crop: null, tool: 'move' })
  fitView()
}

export function cancelCrop(): void {
  set({ crop: null, tool: 'move' })
}

export { beginGesture, endGesture }
