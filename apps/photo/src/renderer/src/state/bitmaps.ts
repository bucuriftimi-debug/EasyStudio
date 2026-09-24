import { tileRect, tilesInRect, uid, type IRect } from '@easystudio/core'

/**
 * Pixel store. Documents reference bitmaps by id; bitmaps are never mutated, so undo snapshots
 * share them freely. A bitmap = an optional base image + 256×256 patch tiles that replace parts
 * of it. Painting creates a new bitmap that reuses the base and all untouched tiles, so an undo
 * step only costs the tiles that actually changed.
 */
export type BitmapSource = ImageBitmap | OffscreenCanvas

export interface StoredBitmap {
  id: string
  width: number
  height: number
  /** null = fully transparent */
  base: BitmapSource | null
  patches: ReadonlyMap<number, OffscreenCanvas>
}

const store = new Map<string, StoredBitmap>()

export function addBitmap(source: BitmapSource, id = uid('bm')): StoredBitmap {
  const bm: StoredBitmap = { id, width: source.width, height: source.height, base: source, patches: new Map() }
  store.set(id, bm)
  return bm
}

/** A bitmap filled with one colour, or fully transparent (costs no memory) when color is null. */
export function addBlankBitmap(w: number, h: number, color: string | null, id = uid('bm')): StoredBitmap {
  if (color) return addBitmap(solidBitmap(w, h, color), id)
  const bm: StoredBitmap = { id, width: w, height: h, base: null, patches: new Map() }
  store.set(id, bm)
  return bm
}

export function getBitmap(id: string): StoredBitmap | undefined {
  return store.get(id)
}

/**
 * New bitmap = parent with the tiles inside `rect` replaced by `data` (straight-alpha RGBA of
 * exactly rect.w × rect.h, rect aligned to tiles).
 */
export function derivePatched(parent: StoredBitmap, rect: IRect, data: ImageData, onlyTiles?: number[], id = uid('bm')): StoredBitmap {
  const patches = new Map(parent.patches)
  const only = onlyTiles ? new Set(onlyTiles) : null
  for (const i of tilesInRect(rect, parent.width, parent.height)) {
    if (only && !only.has(i)) continue
    const tr = tileRect(i, parent.width, parent.height)
    const c = new OffscreenCanvas(tr.w, tr.h)
    c.getContext('2d')!.putImageData(data, rect.x - tr.x, rect.y - tr.y, tr.x - rect.x, tr.y - rect.y, tr.w, tr.h)
    patches.set(i, c)
  }
  const bm: StoredBitmap = { id, width: parent.width, height: parent.height, base: parent.base, patches }
  store.set(id, bm)
  return bm
}

export function collectBitmaps(used: Set<string>): void {
  const liveSources = new Set<BitmapSource>()
  for (const [id, bm] of store) if (used.has(id) && bm.base) liveSources.add(bm.base)
  for (const [id, bm] of store) {
    if (used.has(id)) continue
    // Bases are shared between versions: only close an ImageBitmap nobody else uses.
    if (bm.base instanceof ImageBitmap && !liveSources.has(bm.base)) bm.base.close()
    store.delete(id)
  }
}

/** Draw a bitmap (base + patches) into a 2D context at its natural size. */
export function drawBitmap(ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, bm: StoredBitmap): void {
  if (bm.base) ctx.drawImage(bm.base, 0, 0)
  for (const [i, tile] of bm.patches) {
    const r = tileRect(i, bm.width, bm.height)
    ctx.clearRect(r.x, r.y, r.w, r.h)
    ctx.drawImage(tile, r.x, r.y)
  }
}

export function composeBitmap(bm: StoredBitmap): OffscreenCanvas {
  const c = new OffscreenCanvas(bm.width, bm.height)
  drawBitmap(c.getContext('2d')!, bm)
  return c
}

export function bitmapImageData(bm: StoredBitmap): ImageData {
  return composeBitmap(bm).getContext('2d')!.getImageData(0, 0, bm.width, bm.height)
}

/** Decode an image file (PNG/JPG/WebP/…) into a premultiplied bitmap, respecting EXIF rotation. */
export async function decodeImage(blob: Blob, maxSize: number): Promise<ImageBitmap> {
  const opts: ImageBitmapOptions = {
    premultiplyAlpha: 'premultiply',
    colorSpaceConversion: 'default',
    imageOrientation: 'from-image'
  }
  let bmp = await createImageBitmap(blob, opts)
  if (Math.max(bmp.width, bmp.height) > maxSize) {
    const k = maxSize / Math.max(bmp.width, bmp.height)
    const scaled = await createImageBitmap(bmp, {
      ...opts,
      resizeWidth: Math.round(bmp.width * k),
      resizeHeight: Math.round(bmp.height * k),
      resizeQuality: 'high'
    })
    bmp.close()
    bmp = scaled
  }
  return bmp
}

export function solidBitmap(w: number, h: number, color: string | null): OffscreenCanvas {
  const c = new OffscreenCanvas(w, h)
  if (color) {
    const ctx = c.getContext('2d')!
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
  }
  return c
}

export async function bitmapToPng(bm: StoredBitmap): Promise<Blob> {
  return composeBitmap(bm).convertToBlob({ type: 'image/png' })
}
