/**
 * Tile math. Layer pixels are stored as a base image plus 256×256 "patch" tiles, so an undo
 * step of a brush stroke only keeps the tiles that changed, not a copy of the whole picture.
 */
export const TILE = 256

export interface IRect {
  x: number
  y: number
  w: number
  h: number
}

export function tileCols(w: number): number {
  return Math.ceil(w / TILE)
}

export function tileRows(h: number): number {
  return Math.ceil(h / TILE)
}

export function tileIndex(tx: number, ty: number, w: number): number {
  return ty * tileCols(w) + tx
}

/** Pixel rectangle of a tile (edge tiles are smaller). */
export function tileRect(index: number, w: number, h: number): IRect {
  const cols = tileCols(w)
  const tx = index % cols
  const ty = Math.floor(index / cols)
  const x = tx * TILE
  const y = ty * TILE
  return { x, y, w: Math.min(TILE, w - x), h: Math.min(TILE, h - y) }
}

/** Clip a rectangle to the image and grow it to whole tiles. Null if nothing is left. */
export function alignToTiles(r: IRect, w: number, h: number): IRect | null {
  const cx0 = Math.max(0, r.x)
  const cy0 = Math.max(0, r.y)
  const cx1 = Math.min(w, r.x + r.w)
  const cy1 = Math.min(h, r.y + r.h)
  if (cx1 <= cx0 || cy1 <= cy0) return null
  const x0 = Math.floor(cx0 / TILE) * TILE
  const y0 = Math.floor(cy0 / TILE) * TILE
  const x1 = Math.min(w, Math.ceil(cx1 / TILE) * TILE)
  const y1 = Math.min(h, Math.ceil(cy1 / TILE) * TILE)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** Indices of all tiles touched by an (already tile-aligned or arbitrary) rectangle. */
export function tilesInRect(r: IRect, w: number, h: number): number[] {
  const a = alignToTiles(r, w, h)
  if (!a) return []
  const out: number[] = []
  for (let y = a.y; y < a.y + a.h; y += TILE) for (let x = a.x; x < a.x + a.w; x += TILE) out.push(tileIndex(x / TILE, y / TILE, w))
  return out
}

export function unionRect(a: IRect | null, b: IRect): IRect {
  if (!a) return { ...b }
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}
