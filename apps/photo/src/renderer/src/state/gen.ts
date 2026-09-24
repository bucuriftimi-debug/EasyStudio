import { fontEpoch, renderText } from '@easystudio/draw'
import type { Layer, ShapeStyle } from './types'

export { DEFAULT_TEXT, fontString, measureText, setFontLoadedListener } from '@easystudio/draw'

/**
 * Text and shape layers are stored as settings (editable forever) and drawn to a canvas on
 * demand. The canvas is cached by a hash of the settings; the GPU texture uses the same key.
 */

export const DEFAULT_SHAPE: ShapeStyle = {
  kind: 'rect',
  fill: '#7b6bff',
  fillEnabled: true,
  stroke: '#ffffff',
  strokeWidth: 0,
  radius: 0
}

function shapePath(ctx: OffscreenCanvasRenderingContext2D, s: ShapeStyle, w: number, h: number): void {
  const i = s.fillEnabled || s.kind === 'line' || s.kind === 'arrow' ? s.strokeWidth / 2 : s.strokeWidth / 2
  ctx.beginPath()
  switch (s.kind) {
    case 'rect':
      ctx.roundRect(i, i, Math.max(0, w - i * 2), Math.max(0, h - i * 2), Math.max(0, Math.min(s.radius, (w - i * 2) / 2, (h - i * 2) / 2)))
      break
    case 'ellipse':
      ctx.ellipse(w / 2, h / 2, Math.max(0.5, w / 2 - i), Math.max(0.5, h / 2 - i), 0, 0, Math.PI * 2)
      break
    case 'triangle':
      ctx.moveTo(w / 2, i)
      ctx.lineTo(w - i, h - i)
      ctx.lineTo(i, h - i)
      ctx.closePath()
      break
    case 'star': {
      const rx = w / 2 - i
      const ry = h / 2 - i
      for (let k = 0; k < 10; k++) {
        const r = k % 2 === 0 ? 1 : 0.45
        const a = -Math.PI / 2 + (k * Math.PI) / 5
        const px = w / 2 + Math.cos(a) * rx * r
        const py = h / 2 + Math.sin(a) * ry * r
        if (k === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      break
    }
    default:
      break
  }
}

function renderShape(s: ShapeStyle, w: number, h: number, scale: number): OffscreenCanvas {
  const c = new OffscreenCanvas(Math.max(1, Math.ceil(w * scale)), Math.max(1, Math.ceil(h * scale)))
  const ctx = c.getContext('2d')!
  ctx.scale(scale, scale)
  if (s.kind === 'line' || s.kind === 'arrow') {
    const sw = Math.max(1, s.strokeWidth)
    ctx.strokeStyle = s.stroke
    ctx.fillStyle = s.stroke
    ctx.lineWidth = sw
    ctx.lineCap = 'round'
    const head = s.kind === 'arrow' ? Math.min(w * 0.45, sw * 3 + 10) : 0
    ctx.beginPath()
    ctx.moveTo(sw / 2, h / 2)
    ctx.lineTo(w - sw / 2 - head * 0.8, h / 2)
    ctx.stroke()
    if (head) {
      const hh = Math.min(h / 2, head * 0.55)
      ctx.beginPath()
      ctx.moveTo(w, h / 2)
      ctx.lineTo(w - head, h / 2 - hh)
      ctx.lineTo(w - head, h / 2 + hh)
      ctx.closePath()
      ctx.fill()
    }
    return c
  }
  shapePath(ctx, s, w, h)
  if (s.fillEnabled) {
    ctx.fillStyle = s.fill
    ctx.fill()
  }
  if (s.strokeWidth > 0) {
    ctx.strokeStyle = s.stroke
    ctx.lineWidth = s.strokeWidth
    ctx.lineJoin = 'round'
    ctx.stroke()
  }
  return c
}

/** Box height used for lines and arrows (room for the arrow head). */
export function lineBoxHeight(strokeWidth: number): number {
  return Math.max(12, Math.ceil(Math.max(1, strokeWidth) * 3 + 10))
}

/* ------------------------------ cache ------------------------------ */

function hash(str: string): string {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

const cache = new Map<string, OffscreenCanvas>()
const MAX_CACHE = 48

/** Resolution multiplier so scaled-up text and shapes stay sharp (power of two, 1..8). */
function rasterScale(l: Layer): number {
  const s = Math.max(Math.abs(l.transform.sx), Math.abs(l.transform.sy))
  let k = s <= 1 ? 1 : Math.min(8, Math.pow(2, Math.ceil(Math.log2(s))))
  while (k > 1 && Math.max(l.width, l.height) * k > 8192) k /= 2
  return k
}

/** GPU/source id for a layer's pixels, plus the canvas to upload for generated layers. */
export function layerSource(l: Layer): { id: string; canvas?: OffscreenCanvas } {
  if (l.type === 'raster') return { id: l.bitmapId }
  const k = rasterScale(l)
  const key =
    l.type === 'text'
      ? `txt:${hash(JSON.stringify(l.style))}:${k}:${fontEpoch()}`
      : `shp:${hash(JSON.stringify(l.shape))}:${Math.round(l.width)}x${Math.round(l.height)}:${k}`
  let c = cache.get(key)
  if (!c) {
    c = l.type === 'text' ? renderText(l.style, k) : renderShape(l.shape, l.width, l.height, k)
    cache.set(key, c)
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!)
  } else {
    // Refresh LRU order.
    cache.delete(key)
    cache.set(key, c)
  }
  return { id: key, canvas: c }
}

/** Full-resolution pixels of a generated layer (to convert it to a picture layer). */
export function renderLayerCanvas(l: Layer): OffscreenCanvas | null {
  if (l.type === 'text') return renderText(l.style, 1)
  if (l.type === 'shape') return renderShape(l.shape, Math.round(l.width), Math.round(l.height), 1)
  return null
}
