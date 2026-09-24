import { uid, type Vec2 } from '@easystudio/core'
import type { Layer, SelOp, Selection } from './types'

/**
 * Selections are document-sized alpha masks drawn with Canvas 2D (antialiased shapes, blur,
 * compositing). The GPU gets the mask as a texture for marching ants and to clip painting.
 */

export type SelShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'ellipse'; x: number; y: number; w: number; h: number }
  | { kind: 'lasso'; pts: Vec2[] }
  | { kind: 'mask'; canvas: OffscreenCanvas }

function blank(w: number, h: number): OffscreenCanvas {
  return new OffscreenCanvas(w, h)
}

/** Measure the non-transparent area; null means the mask is empty. */
function finish(c: OffscreenCanvas): Selection | null {
  const { width: w, height: h } = c
  const d = c.getContext('2d')!.getImageData(0, 0, w, h).data
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    const row = y * w * 4
    for (let x = 0; x < w; x++) {
      if (d[row + x * 4 + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { id: uid('sel'), canvas: c, bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } }
}

function drawShape(ctx: OffscreenCanvasRenderingContext2D, s: SelShape): void {
  ctx.fillStyle = '#fff'
  if (s.kind === 'mask') {
    ctx.drawImage(s.canvas, 0, 0)
    return
  }
  ctx.beginPath()
  if (s.kind === 'rect') ctx.rect(s.x, s.y, s.w, s.h)
  else if (s.kind === 'ellipse') ctx.ellipse(s.x + s.w / 2, s.y + s.h / 2, Math.abs(s.w / 2), Math.abs(s.h / 2), 0, 0, Math.PI * 2)
  else {
    s.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
    ctx.closePath()
  }
  ctx.fill('nonzero')
}

/** Combine a new shape with the current selection. */
export function combine(w: number, h: number, shape: SelShape, op: SelOp, current: Selection | null): Selection | null {
  const c = blank(w, h)
  const ctx = c.getContext('2d')!
  if (current && op !== 'replace') {
    ctx.drawImage(current.canvas, 0, 0)
    ctx.globalCompositeOperation = op === 'sub' ? 'destination-out' : op === 'int' ? 'destination-in' : 'source-over'
  }
  drawShape(ctx, shape)
  return finish(c)
}

export function selectAll(w: number, h: number): Selection {
  return finish(combine(w, h, { kind: 'rect', x: 0, y: 0, w, h }, 'replace', null)!.canvas)!
}

export function invert(w: number, h: number, sel: Selection | null): Selection | null {
  const c = blank(w, h)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  if (sel) {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.drawImage(sel.canvas, 0, 0)
  }
  return finish(c)
}

export function feather(sel: Selection, radius: number): Selection | null {
  const { width: w, height: h } = sel.canvas
  const c = blank(w, h)
  const ctx = c.getContext('2d')!
  ctx.filter = `blur(${Math.max(0, radius)}px)`
  ctx.drawImage(sel.canvas, 0, 0)
  return finish(c)
}

/** Grow the selection by `radius` px (union of shifted copies ≈ dilation by a disc). */
function dilate(src: OffscreenCanvas, radius: number): OffscreenCanvas {
  const { width: w, height: h } = src
  const c = blank(w, h)
  const ctx = c.getContext('2d')!
  ctx.drawImage(src, 0, 0)
  const rings = radius > 6 ? [radius, radius * 0.66, radius * 0.33] : [radius]
  for (const r of rings) {
    const n = Math.max(8, Math.ceil((Math.PI * 2 * r) / Math.max(1.5, r * 0.35)))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      ctx.drawImage(src, Math.cos(a) * r, Math.sin(a) * r)
    }
  }
  return c
}

export function expand(sel: Selection, radius: number): Selection | null {
  return finish(dilate(sel.canvas, radius))
}

export function contract(sel: Selection, radius: number): Selection | null {
  const { width: w, height: h } = sel.canvas
  const inv = invert(w, h, sel)
  if (!inv) return sel
  const grown = dilate(inv.canvas, radius)
  const c = blank(w, h)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'destination-out'
  ctx.drawImage(grown, 0, 0)
  return finish(c)
}

/** Build a selection from a flood-fill mask (magic wand). */
export function fromMask(w: number, h: number, mask: Uint8Array): OffscreenCanvas {
  const c = blank(w, h)
  const img = new ImageData(w, h)
  const d = img.data
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      const o = i * 4
      d[o] = d[o + 1] = d[o + 2] = 255
      d[o + 3] = mask[i]
    }
  }
  c.getContext('2d')!.putImageData(img, 0, 0)
  return c
}

/** The selection drawn into a layer's own pixel grid (white + alpha), e.g. to create a layer mask. */
export function selectionInLayer(sel: Selection, l: Layer, texW: number, texH: number): OffscreenCanvas {
  const c = blank(texW, texH)
  const ctx = c.getContext('2d')!
  const t = l.transform
  const m = new DOMMatrix()
    .scale(texW / l.width, texH / l.height)
    .translate(l.width / 2, l.height / 2)
    .scale(1 / t.sx, 1 / t.sy)
    .rotate(-t.rot)
    .translate(-t.cx, -t.cy)
  ctx.setTransform(m)
  ctx.drawImage(sel.canvas, 0, 0)
  return c
}
