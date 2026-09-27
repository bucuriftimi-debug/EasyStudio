import i18next from 'i18next'
import { addBitmap, decodeImage } from './bitmaps'
import * as ops from './docOps'
import { maxImageSize } from '../gpuHost'
import type { Layer, PhotoDoc } from './types'

/**
 * Photo collage: pictures laid out in a ready-made grid. Every photo becomes a normal picture
 * layer cut to its cell (cover fit, rounded corners), so it can be moved, filtered or replaced.
 */

const t = (k: string) => i18next.t(k) as string

/** A cell in a 1 × 1 box: x, y, width, height. */
type Cell = [number, number, number, number]

export interface CollageLayout {
  id: string
  cells: Cell[]
}

const grid = (cols: number, rows: number): Cell[] =>
  Array.from({ length: cols * rows }, (_, i) => [(i % cols) / cols, Math.floor(i / cols) / rows, 1 / cols, 1 / rows] as Cell)

export const COLLAGE_LAYOUTS: CollageLayout[] = [
  { id: '2h', cells: grid(2, 1) },
  { id: '2v', cells: grid(1, 2) },
  { id: '3a', cells: [[0, 0, 0.6, 1], [0.6, 0, 0.4, 0.5], [0.6, 0.5, 0.4, 0.5]] },
  { id: '3b', cells: [[0, 0, 1, 0.6], [0, 0.6, 0.5, 0.4], [0.5, 0.6, 0.5, 0.4]] },
  { id: '4', cells: grid(2, 2) },
  { id: '4a', cells: [[0, 0, 1, 0.62], [0, 0.62, 1 / 3, 0.38], [1 / 3, 0.62, 1 / 3, 0.38], [2 / 3, 0.62, 1 / 3, 0.38]] },
  { id: '5', cells: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 1 / 3, 0.5], [1 / 3, 0.5, 1 / 3, 0.5], [2 / 3, 0.5, 1 / 3, 0.5]] },
  { id: '6', cells: grid(3, 2) },
  { id: '9', cells: grid(3, 3) }
]

/** Free users get the layouts with up to this many photos. */
export const FREE_COLLAGE_CELLS = 4

export interface CollageOptions {
  layout: CollageLayout
  width: number
  height: number
  /** Space between photos and around the edge, px. */
  gap: number
  /** Rounded corners, px. */
  radius: number
  background: string
}

/** The cells in document pixels. */
export function cellRects(o: CollageOptions): { x: number; y: number; w: number; h: number }[] {
  const g = o.gap
  return o.layout.cells.map(([cx, cy, cw, ch]) => {
    const x = Math.round(g + cx * (o.width - g))
    const y = Math.round(g + cy * (o.height - g))
    const x2 = Math.round(g + (cx + cw) * (o.width - g)) - g
    const y2 = Math.round(g + (cy + ch) * (o.height - g)) - g
    return { x, y, w: Math.max(1, x2 - x), h: Math.max(1, y2 - y) }
  })
}

function roundedClip(ctx: OffscreenCanvasRenderingContext2D, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, Math.min(r, w / 2, h / 2))
  ctx.clip()
}

/** One photo cut to a cell: scaled to cover it, centred, with rounded corners. */
function cellPicture(img: ImageBitmap | null, w: number, h: number, radius: number): OffscreenCanvas {
  const c = new OffscreenCanvas(w, h)
  const ctx = c.getContext('2d')!
  roundedClip(ctx, w, h, radius)
  if (!img) {
    // Empty cell: a soft placeholder the user can replace (Layer → Add picture).
    ctx.fillStyle = '#d4d4d8'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#a1a1aa'
    ctx.lineWidth = Math.max(4, Math.min(w, h) * 0.02)
    const s = Math.min(w, h) * 0.12
    ctx.beginPath()
    ctx.moveTo(w / 2 - s, h / 2)
    ctx.lineTo(w / 2 + s, h / 2)
    ctx.moveTo(w / 2, h / 2 - s)
    ctx.lineTo(w / 2, h / 2 + s)
    ctx.stroke()
    return c
  }
  const k = Math.max(w / img.width, h / img.height)
  const dw = img.width * k
  const dh = img.height * k
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
  return c
}

/** Build the collage document from the photos (fewer photos than cells leaves placeholders). */
export async function buildCollage(o: CollageOptions, photos: { name: string; data: Uint8Array }[]): Promise<PhotoDoc> {
  const bg = new OffscreenCanvas(o.width, o.height)
  const bctx = bg.getContext('2d')!
  bctx.fillStyle = o.background
  bctx.fillRect(0, 0, o.width, o.height)
  const layers: Layer[] = [ops.createLayer(addBitmap(bg).id, o.width, o.height, t('layers.background'))]
  const rects = cellRects(o)
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i]
    const p = photos[i]
    const img = p ? await decodeImage(new Blob([p.data as BlobPart]), maxImageSize()) : null
    const pic = cellPicture(img, r.w, r.h, o.radius)
    img?.close()
    const name = p ? p.name.replace(/\.[^.]+$/, '') : `${t('collage.photo')} ${i + 1}`
    layers.push(ops.createLayer(addBitmap(pic).id, r.w, r.h, name, { cx: r.x + r.w / 2, cy: r.y + r.h / 2, sx: 1, sy: 1, rot: 0 }))
  }
  return { name: t('collage.name'), width: o.width, height: o.height, layers, activeLayerId: layers[layers.length - 1].id }
}
