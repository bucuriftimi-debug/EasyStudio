import { alignToTiles, tilesInRect, type Vec2 } from '@easystudio/core'
import { ai, aiReady, prepareModels, setProgress, t } from '../ai/client'
import { buildScene, getRenderer, maxImageSize, syncSources } from '../gpuHost'
import { bakeScale, selectShape } from './actions'
import { addBitmap, composeBitmap, derivePatched, getBitmap } from './bitmaps'
import * as ops from './docOps'
import { commit, fitView, getDoc, toast, useEditor } from './store'
import type { Layer, PhotoDoc, RasterLayer, SelOp } from './types'

/**
 * AI features wired into the editor. Everything runs locally (downloaded once), results are
 * normal editable things: a layer mask, a selection, or new pixels (undoable).
 */

/** 'gpu' (WebGPU on the graphics card) or 'cpu'. */
export const aiDevice = async () => (await aiReady()).device

function activeRaster(): RasterLayer | null {
  const doc = getDoc()
  const l = doc ? ops.activeLayer(doc) : undefined
  if (!l || l.type !== 'raster') {
    toast(t('ai.needPicture'), 'error', 4500)
    return null
  }
  return l
}

function fail(e: unknown): void {
  console.error(e)
  toast(t('ai.failed', { msg: (e as Error)?.message ?? String(e) }), 'error', 7000)
}

/** White + alpha canvas from an alpha map (used for masks and selections). */
function alphaCanvas(alpha: Uint8ClampedArray, w: number, h: number): OffscreenCanvas {
  const img = new ImageData(w, h)
  for (let i = 0; i < w * h; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255
    img.data[i * 4 + 3] = alpha[i]
  }
  const c = new OffscreenCanvas(w, h)
  c.getContext('2d')!.putImageData(img, 0, 0)
  return c
}

/**
 * The visible picture as a bitmap, at most `maxSide` px on the long side
 * (exactly `maxSide` when `exact`, enlarging small pictures — MobileSAM needs that).
 */
function renderComposite(doc: PhotoDoc, maxSide: number, exact = false): Promise<ImageBitmap> {
  const r = getRenderer()!
  syncSources(r, doc, useEditor.getState().selection)
  const k = exact ? maxSide / Math.max(doc.width, doc.height) : Math.min(1, maxSide / Math.max(doc.width, doc.height))
  const w = Math.max(1, Math.round(doc.width * k))
  const h = Math.max(1, Math.round(doc.height * k))
  const px = r.exportPixels(buildScene(doc), w, h, null)
  return createImageBitmap(new ImageData(new Uint8ClampedArray(px.data.buffer), w, h))
}

/* ------------------------------ remove background ------------------------------ */

/** Remove the background of the active picture layer (as a layer mask you can touch up). */
export async function removeBackground(): Promise<void> {
  const layer = activeRaster()
  if (!layer) return
  const urls = await prepareModels(['matte'])
  if (!urls) return
  try {
    setProgress(t('ai.removingBg'))
    await aiReady()
    const bm = getBitmap(layer.bitmapId)!
    const bmp = await createImageBitmap(composeBitmap(bm))
    const { alpha, w, h } = await ai.matte(urls.matte, bmp)
    const mask = addBitmap(alphaCanvas(alpha, w, h))
    commit(t('history.removeBg'), (d) => ops.setMask(d, layer.id, { bitmapId: mask.id, enabled: true }))
    useEditor.setState({ editMask: false })
    toast(t('ai.bgDone'), 'success', 6000)
  } catch (e) {
    fail(e)
  } finally {
    setProgress(null)
  }
}

/* ------------------------------ selections ------------------------------ */

/** Select the main subject of the picture (person, animal, product…). */
export async function selectSubject(op: SelOp = 'replace'): Promise<void> {
  const doc = getDoc()
  if (!doc) return
  const urls = await prepareModels(['matte'])
  if (!urls) return
  try {
    setProgress(t('ai.findingSubject'))
    await aiReady()
    const bmp = await renderComposite(doc, 2048)
    const { alpha, w, h } = await ai.matte(urls.matte, bmp)
    const c = new OffscreenCanvas(doc.width, doc.height)
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(alphaCanvas(alpha, w, h), 0, 0, doc.width, doc.height)
    selectShape({ kind: 'mask', canvas: c }, op)
    useEditor.setState({ tool: 'select' })
  } catch (e) {
    fail(e)
  } finally {
    setProgress(null)
  }
}

const encodedKey = new WeakMap<PhotoDoc, string>()
let keySeq = 0

/** Click on something to select it (MobileSAM). The picture is analysed once, then clicks are instant. */
export async function selectObjectAt(p: Vec2, op: SelOp): Promise<void> {
  const doc = getDoc()
  if (!doc || p.x < 0 || p.y < 0 || p.x >= doc.width || p.y >= doc.height) return
  const urls = await prepareModels(['samEncoder', 'samDecoder'])
  if (!urls) return
  try {
    await aiReady()
    let key = encodedKey.get(doc)
    if (!key) {
      setProgress(t('ai.analysing'))
      key = `doc${++keySeq}`
      const bmp = await renderComposite(doc, 1024, true)
      await ai.samEncode(urls.samEncoder, bmp, doc.width, doc.height, key)
      encodedKey.set(doc, key)
    }
    setProgress(null)
    const { alpha, w, h } = await ai.samDecode(urls.samDecoder, key, [{ x: p.x, y: p.y, label: 1 }])
    selectShape({ kind: 'mask', canvas: alphaCanvas(alpha, w, h) }, op)
  } catch (e) {
    fail(e)
  } finally {
    setProgress(null)
  }
}

/* ------------------------------ remove objects ------------------------------ */

/** Mask of a painted stroke (document coordinates) in the pixel grid of a layer. */
function strokeMask(l: Layer, texW: number, texH: number, pts: Vec2[], size: number): OffscreenCanvas {
  const c = new OffscreenCanvas(texW, texH)
  const ctx = c.getContext('2d')!
  const tr = l.transform
  ctx.setTransform(
    new DOMMatrix()
      .scale(texW / l.width, texH / l.height)
      .translate(l.width / 2, l.height / 2)
      .scale(1 / tr.sx, 1 / tr.sy)
      .rotate(-tr.rot)
      .translate(-tr.cx, -tr.cy)
  )
  ctx.strokeStyle = '#fff'
  ctx.fillStyle = '#fff'
  // A little bigger than what was painted: the model works best with some margin around the object.
  ctx.lineWidth = size * 1.15 + 6
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (pts.length === 1) {
    ctx.beginPath()
    ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.beginPath()
    pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)))
    ctx.stroke()
  }
  return c
}

function alphaBounds(d: Uint8ClampedArray, w: number, h: number) {
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (d[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/**
 * Remove what was painted over (or the selection, if `pts` is empty) and fill it in with
 * matching surroundings (LaMa inpainting).
 */
export async function eraseObject(pts: Vec2[], size: number): Promise<void> {
  const doc = getDoc()
  const layer = activeRaster()
  if (!doc || !layer) return
  const sel = useEditor.getState().selection
  if (!pts.length && !sel) return
  const urls = await prepareModels(['lama'])
  if (!urls) return
  try {
    setProgress(t('ai.removingObject'))
    await aiReady()
    const bm = getBitmap(layer.bitmapId)!
    const W = bm.width
    const H = bm.height
    let maskCanvas: OffscreenCanvas
    if (pts.length) maskCanvas = strokeMask(layer, W, H, pts, size)
    else {
      const { selectionInLayer } = await import('./selection')
      maskCanvas = selectionInLayer(sel!, layer, W, H)
    }
    const mctx = maskCanvas.getContext('2d', { willReadFrequently: true })!
    const md = mctx.getImageData(0, 0, W, H).data
    const b = alphaBounds(md, W, H)
    if (!b) return
    // Square area around the object with plenty of context for the model.
    const side = Math.min(Math.max(W, H), Math.max(256, Math.round(Math.max(b.w, b.h) * 2.2 + 64)))
    const cw = Math.min(W, side)
    const ch = Math.min(H, side)
    const cx = Math.min(W - cw, Math.max(0, Math.round(b.x + b.w / 2 - cw / 2)))
    const cy = Math.min(H - ch, Math.max(0, Math.round(b.y + b.h / 2 - ch / 2)))
    const src = composeBitmap(bm).getContext('2d', { willReadFrequently: true })!
    const crop = src.getImageData(cx, cy, cw, ch)
    const cropMask = new Uint8ClampedArray(cw * ch)
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) cropMask[y * cw + x] = md[((cy + y) * W + cx + x) * 4 + 3]
    const filled = await ai.inpaint(urls.lama, new ImageData(new Uint8ClampedArray(crop.data), cw, ch), cropMask.slice())

    // Soft edge so the repaired area blends in.
    const soft = new OffscreenCanvas(cw, ch)
    const sctx = soft.getContext('2d', { willReadFrequently: true })!
    sctx.filter = 'blur(2px)'
    const mc = new OffscreenCanvas(cw, ch)
    const mimg = new ImageData(cw, ch)
    for (let i = 0; i < cw * ch; i++) mimg.data[i * 4 + 3] = cropMask[i]
    mc.getContext('2d')!.putImageData(mimg, 0, 0)
    sctx.drawImage(mc, 0, 0)
    const sm = sctx.getImageData(0, 0, cw, ch).data

    const rect = alignToTiles({ x: cx, y: cy, w: cw, h: ch }, W, H)!
    const out = src.getImageData(rect.x, rect.y, rect.w, rect.h)
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const a = Math.max(sm[(y * cw + x) * 4 + 3], cropMask[y * cw + x]) / 255
        if (a <= 0) continue
        const ci = (y * cw + x) * 4
        const oi = ((cy - rect.y + y) * rect.w + (cx - rect.x + x)) * 4
        for (let c = 0; c < 3; c++) out.data[oi + c] = out.data[oi + c] * (1 - a) + filled.data[ci + c] * a
      }
    }
    const next = derivePatched(bm, rect, out, tilesInRect({ x: cx, y: cy, w: cw, h: ch }, W, H))
    commit(t('history.removeObject'), (d) => ops.updateLayer(d, layer.id, { bitmapId: next.id }))
  } catch (e) {
    fail(e)
  } finally {
    setProgress(null)
  }
}

/* ------------------------------ upscale ------------------------------ */

const MAX_UPSCALE_PIXELS = 64_000_000

export function canUpscale(scale: 2 | 4): boolean {
  const doc = getDoc()
  const l = doc ? ops.activeLayer(doc) : undefined
  if (!doc || !l || l.type !== 'raster') return false
  const bm = getBitmap(l.bitmapId)
  if (!bm) return false
  const max = maxImageSize()
  return bm.width * scale <= max && bm.height * scale <= max && bm.width * bm.height * scale * scale <= MAX_UPSCALE_PIXELS
}

/** Make the picture 2× or 4× bigger with AI detail (the whole document grows with it). */
export async function upscale(scale: 2 | 4): Promise<void> {
  const doc = getDoc()
  const layer = activeRaster()
  if (!doc || !layer) return
  if (!canUpscale(scale)) {
    toast(t('ai.tooBigToUpscale'), 'error', 5000)
    return
  }
  const urls = await prepareModels(['upscale'])
  if (!urls) return
  try {
    setProgress(t('ai.upscaling', { pct: 0 }), 0)
    await aiReady()
    const bm = getBitmap(layer.bitmapId)!
    const srcCanvas = composeBitmap(bm)
    const img = srcCanvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, bm.width, bm.height)
    let hasAlpha = false
    for (let i = 3; i < img.data.length; i += 4 * 7)
      if (img.data[i] < 255) {
        hasAlpha = true
        break
      }
    const res = await ai.upscale(urls.upscale, img, scale, (p) => setProgress(t('ai.upscaling', { pct: Math.round(p * 100) }), p))
    const out = new OffscreenCanvas(res.width, res.height)
    const octx = out.getContext('2d')!
    if (hasAlpha) {
      // The model only knows colours: bring the transparency along with a smooth resize.
      const a = new OffscreenCanvas(res.width, res.height).getContext('2d', { willReadFrequently: true })!
      a.imageSmoothingQuality = 'high'
      a.drawImage(srcCanvas, 0, 0, res.width, res.height)
      const ad = a.getImageData(0, 0, res.width, res.height).data
      for (let i = 3; i < res.data.length; i += 4) res.data[i] = ad[i]
    }
    octx.putImageData(res, 0, 0)
    const next = addBitmap(out)
    commit(t('history.upscale', { k: scale }), (d) => {
      let nd = ops.resizeDoc(d, d.width * scale, d.height * scale)
      nd = ops.updateLayer(nd, layer.id, (l) => ({
        bitmapId: next.id,
        width: layer.width * scale,
        height: layer.height * scale,
        transform: { ...l.transform, sx: layer.transform.sx, sy: layer.transform.sy }
      }))
      // Keep text and shapes crisp at the new size.
      for (const l of nd.layers) if (l.type !== 'raster') nd = bakeScale(nd, l.id)
      return nd
    })
    useEditor.setState({ selection: null })
    fitView()
    toast(t('ai.upscaleDone', { w: doc.width * scale, h: doc.height * scale }), 'success', 5000)
  } catch (e) {
    fail(e)
  } finally {
    setProgress(null)
  }
}
