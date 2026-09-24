import i18next from 'i18next'
import { readPsd as parsePsd, type Layer as PsdLayer, type PixelData } from 'ag-psd'
import { BLEND_MODES, type BlendMode } from '@easystudio/gpu'
import { addBitmap } from './bitmaps'
import * as ops from './docOps'
import type { Layer, PhotoDoc } from './types'

/**
 * Photoshop (.psd) import. Every pixel layer becomes an editable layer with its position,
 * opacity, blend mode, visibility and layer mask. Groups are flattened (their visibility and
 * opacity are passed on to the layers inside). Things this editor has no equivalent for —
 * adjustment layers, layer styles, clipping masks — are counted so the user can be told.
 */

export interface PsdImport {
  doc: PhotoDoc
  /** How many parts could not be imported exactly. */
  skipped: number
}

/** 8-bit RGBA from ag-psd pixel data (which may be 8, 16 or 32 bits per channel). */
function toImageData(p: PixelData): ImageData {
  const d = p.data
  let out: Uint8ClampedArray<ArrayBuffer>
  if (d instanceof Uint16Array) {
    out = new Uint8ClampedArray(d.length)
    for (let i = 0; i < d.length; i++) out[i] = d[i] >> 8
  } else if (d instanceof Float32Array) {
    out = new Uint8ClampedArray(d.length)
    for (let i = 0; i < d.length; i++) out[i] = d[i] * 255
  } else {
    out = new Uint8ClampedArray(d.length)
    out.set(d)
  }
  return new ImageData(out, p.width, p.height)
}

/** Pixel data as a canvas, scaled by `k` (big documents are shrunk to what the GPU can hold). */
function toCanvas(p: PixelData, k: number): OffscreenCanvas {
  const src = new OffscreenCanvas(p.width, p.height)
  src.getContext('2d')!.putImageData(toImageData(p), 0, 0)
  if (k === 1) return src
  const out = new OffscreenCanvas(Math.max(1, Math.round(p.width * k)), Math.max(1, Math.round(p.height * k)))
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, out.width, out.height)
  return out
}

/** Photoshop blend mode → ours (the closest one when there is no exact match). */
function blendOf(mode: string | undefined): { blend: BlendMode; exact: boolean } {
  const m = (mode ?? 'normal').replace(/ /g, '-')
  if ((BLEND_MODES as readonly string[]).includes(m)) return { blend: m as BlendMode, exact: true }
  const near: Record<string, BlendMode> = {
    'pass-through': 'normal',
    dissolve: 'normal',
    'linear-burn': 'color-burn',
    'darker-color': 'darken',
    'linear-dodge': 'screen',
    'lighter-color': 'lighten',
    'vivid-light': 'hard-light',
    'linear-light': 'hard-light',
    'pin-light': 'hard-light',
    'hard-mix': 'hard-light',
    subtract: 'difference',
    divide: 'screen'
  }
  return { blend: near[m] ?? 'normal', exact: m === 'pass-through' }
}

/**
 * Layer mask in layer space: alpha = grey value (our masks use alpha: opaque = visible).
 * Outside the mask's own rectangle Photoshop uses its "default colour".
 */
function maskCanvas(l: PsdLayer, w: number, h: number, k: number): OffscreenCanvas | null {
  const m = l.mask
  if (!m?.imageData) return null
  const lw = (l.right ?? 0) - (l.left ?? 0)
  const lh = (l.bottom ?? 0) - (l.top ?? 0)
  const full = new OffscreenCanvas(lw, lh)
  const ctx = full.getContext('2d')!
  ctx.fillStyle = `rgba(255,255,255,${(m.defaultColor ?? 255) / 255})`
  ctx.fillRect(0, 0, lw, lh)
  const src = m.imageData
  const img = toImageData(src)
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i + 3] = img.data[i]
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255
  }
  const piece = new OffscreenCanvas(src.width, src.height)
  piece.getContext('2d')!.putImageData(img, 0, 0)
  ctx.globalCompositeOperation = 'copy'
  ctx.save()
  ctx.beginPath()
  ctx.rect((m.left ?? 0) - (l.left ?? 0), (m.top ?? 0) - (l.top ?? 0), src.width, src.height)
  ctx.clip()
  ctx.drawImage(piece, (m.left ?? 0) - (l.left ?? 0), (m.top ?? 0) - (l.top ?? 0))
  ctx.restore()
  if (k === 1 && lw === w && lh === h) return full
  const out = new OffscreenCanvas(w, h)
  out.getContext('2d')!.drawImage(full, 0, 0, w, h)
  return out
}

export async function readPsd(bytes: Uint8Array, name: string, maxSize: number): Promise<PsdImport> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const psd = parsePsd(buffer, { useImageData: true, skipThumbnail: true, skipLinkedFilesData: true })
  const k = Math.min(1, maxSize / Math.max(psd.width, psd.height))
  const W = Math.max(1, Math.round(psd.width * k))
  const H = Math.max(1, Math.round(psd.height * k))
  const layers: Layer[] = []
  let skipped = 0

  const walk = (list: PsdLayer[] | undefined, hidden: boolean, opacity: number) => {
    for (const l of list ?? []) {
      const lHidden = hidden || !!l.hidden
      const lOpacity = opacity * (l.opacity ?? 1)
      if (l.children) {
        walk(l.children, lHidden, lOpacity)
        if (l.mask?.imageData || (l.blendMode && l.blendMode !== 'pass through' && l.blendMode !== 'normal')) skipped++
        continue
      }
      if (l.adjustment) {
        skipped++
        continue
      }
      if ((l.effects && !l.effects.disabled) || l.clipping) skipped++
      const img = l.imageData
      const w0 = (l.right ?? 0) - (l.left ?? 0)
      const h0 = (l.bottom ?? 0) - (l.top ?? 0)
      if (!img || w0 <= 0 || h0 <= 0) {
        if (l.vectorFill) skipped++
        continue
      }
      const canvas = toCanvas(img, k)
      const bm = addBitmap(canvas)
      const { blend, exact } = blendOf(l.blendMode)
      if (!exact) skipped++
      const mask = maskCanvas(l, canvas.width, canvas.height, k)
      const layer: Layer = {
        ...ops.createLayer(bm.id, canvas.width, canvas.height, l.name || i18next.t('layers.layer', { n: layers.length + 1 }), {
          cx: ((l.left ?? 0) + w0 / 2) * k,
          cy: ((l.top ?? 0) + h0 / 2) * k,
          sx: 1,
          sy: 1,
          rot: 0
        }),
        visible: !lHidden,
        opacity: Math.round(lOpacity * 100),
        blend,
        mask: mask ? { bitmapId: addBitmap(mask).id, enabled: !l.mask?.disabled } : null
      }
      layers.push(layer)
    }
  }
  walk(psd.children, false, 1)

  // A flattened PSD (or one saved without layers): use the merged picture.
  if (!layers.length) {
    if (!psd.imageData) throw new Error(i18next.t('err.psdNoData'))
    const canvas = toCanvas(psd.imageData, k)
    layers.push(ops.createLayer(addBitmap(canvas).id, canvas.width, canvas.height, name))
  }

  const doc: PhotoDoc = { name, width: W, height: H, layers, activeLayerId: layers[layers.length - 1].id }
  return { doc, skipped }
}
