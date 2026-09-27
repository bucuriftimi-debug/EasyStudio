import { ai, aiReady, prepareModels, setProgress, t } from '../ai/client'
import { activeRaster, alphaCanvas, fail } from './ai'
import { addBitmap, composeBitmap, getBitmap } from './bitmaps'
import * as ops from './docOps'
import { aiAllowed, aiUsed } from './pro'
import { selectionInLayer } from './selection'
import { commit, toast, useEditor } from './store'

/**
 * Portrait retouching.
 * - Smooth skin: the person is found with the background-removal model, skin is found by its
 *   colour, and only smooth skin areas are blended with a blurred copy. Eyes, lips, hair and
 *   edges have strong detail and stay sharp.
 * - Whiten teeth: works on the selection (select the teeth with "Select an object (click)").
 * Both replace the layer's pixels in one undo step.
 */

const smoothstep = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return k * k * (3 - 2 * k)
}

/** 0…1: how much a colour looks like skin (YCbCr ranges that cover light to dark skin). */
function skinness(r: number, g: number, b: number): number {
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
  const inCb = smoothstep(72, 82, cb) * (1 - smoothstep(122, 132, cb))
  const inCr = smoothstep(128, 138, cr) * (1 - smoothstep(168, 178, cr))
  return inCb * inCr
}

function blurred(src: OffscreenCanvas, radius: number): ImageData {
  const c = new OffscreenCanvas(src.width, src.height)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.filter = `blur(${radius}px)`
  ctx.drawImage(src, 0, 0)
  return ctx.getImageData(0, 0, c.width, c.height)
}

/**
 * The retouched pixels (pure image maths, no model): `person` is a W×H alpha map (null = the
 * whole picture), `strength` 0…1.
 */
export function smoothSkinPixels(src: OffscreenCanvas, person: Uint8ClampedArray | null, strength: number): ImageData {
  const W = src.width
  const H = src.height
  const orig = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H)
  const radius = Math.max(2, Math.round(Math.min(W, H) / 170))
  const soft = blurred(src, radius)
  // Skin mask, blurred so it has no speckles or hard edges.
  const mask = new OffscreenCanvas(W, H)
  const md = new ImageData(W, H)
  const o = orig.data
  for (let i = 0, p = 0; p < W * H; p++, i += 4) {
    const s = skinness(o[i], o[i + 1], o[i + 2]) * (person ? person[p] / 255 : 1)
    md.data[i + 3] = Math.round(s * 255)
  }
  mask.getContext('2d')!.putImageData(md, 0, 0)
  const m = blurred(mask, radius * 1.5).data
  const s = soft.data
  const out = new ImageData(W, H)
  const d = out.data
  for (let i = 0; i < o.length; i += 4) {
    // Detail (difference from the blurred copy): pores and blemishes are small, features are big.
    const diff = Math.abs(o[i] - s[i]) + Math.abs(o[i + 1] - s[i + 1]) + Math.abs(o[i + 2] - s[i + 2])
    const w = strength * (m[i + 3] / 255) * (1 - smoothstep(18, 60, diff))
    // A touch of glow on the smoothed skin.
    const lift = 1 + 0.04 * w
    for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, (o[i + c] + (s[i + c] - o[i + c]) * w) * lift)
    d[i + 3] = o[i + 3]
  }
  return out
}

/** Whiter teeth inside `mask` (alpha, same size): less yellow, a little brighter. */
export function whitenPixels(src: OffscreenCanvas, mask: Uint8ClampedArray, amount: number): ImageData {
  const img = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, src.width, src.height)
  const d = img.data
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const m = (mask[p] / 255) * amount
    if (m <= 0) continue
    const r = d[i]
    const g = d[i + 1]
    const b = d[i + 2]
    const l = 0.299 * r + 0.587 * g + 0.114 * b
    // Only the lighter parts of the selection (teeth, not lips or gums).
    const k = m * smoothstep(70, 130, l)
    const target = Math.min(255, l * 1.12 + 10)
    d[i] = r + (target - r) * k * 0.85
    d[i + 1] = g + (target - g) * k * 0.85
    d[i + 2] = b + (Math.min(255, target + 6) - b) * k * 0.9
  }
  return img
}

function replacePixels(layerId: string, img: ImageData, label: string): void {
  const c = new OffscreenCanvas(img.width, img.height)
  c.getContext('2d')!.putImageData(img, 0, 0)
  const next = addBitmap(c)
  commit(label, (d) => ops.updateLayer(d, layerId, { bitmapId: next.id }))
}

/** Smooth the skin of the person in the active picture (AI finds the person). */
export async function retouchPortrait(strength: number): Promise<void> {
  const layer = activeRaster()
  if (!layer || !aiAllowed(t('ai.retouch'))) return
  const urls = await prepareModels(['matte'])
  if (!urls) return
  try {
    setProgress(t('ai.retouching'))
    await aiReady()
    const bm = getBitmap(layer.bitmapId)!
    const src = composeBitmap(bm)
    const { alpha, w, h } = await ai.matte(urls.matte, await createImageBitmap(src))
    const pc = new OffscreenCanvas(bm.width, bm.height)
    const pctx = pc.getContext('2d', { willReadFrequently: true })!
    pctx.imageSmoothingQuality = 'high'
    pctx.drawImage(alphaCanvas(alpha, w, h), 0, 0, bm.width, bm.height)
    const pd = pctx.getImageData(0, 0, bm.width, bm.height).data
    const person = new Uint8ClampedArray(bm.width * bm.height)
    for (let p = 0; p < person.length; p++) person[p] = pd[p * 4 + 3]
    replacePixels(layer.id, smoothSkinPixels(src, person, strength), t('history.retouch'))
    toast(t('ai.retouchDone'), 'success', 5000)
    aiUsed()
  } catch (e) {
    fail(e)
  } finally {
    setProgress(null)
  }
}

/** Whiten the selected teeth of the active picture. */
export function whitenTeeth(amount = 0.8): void {
  const layer = activeRaster()
  const sel = useEditor.getState().selection
  if (!layer) return
  if (!sel) {
    toast(t('ai.whitenNeedsSelection'), 'info', 6000)
    return
  }
  const bm = getBitmap(layer.bitmapId)!
  const src = composeBitmap(bm)
  const mc = selectionInLayer(sel, layer, bm.width, bm.height)
  const md = mc.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, bm.width, bm.height).data
  const mask = new Uint8ClampedArray(bm.width * bm.height)
  for (let p = 0; p < mask.length; p++) mask[p] = md[p * 4 + 3]
  replacePixels(layer.id, whitenPixels(src, mask, amount), t('history.whiten'))
  toast(t('ai.whitenDone'), 'success', 4000)
}
