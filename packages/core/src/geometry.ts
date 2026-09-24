/**
 * Layer geometry. Document space: origin top-left, x right, y down, units = document pixels.
 * A layer is a w×h bitmap placed by its center (cx, cy), scaled (sx, sy; negative = mirrored)
 * and rotated by `rot` degrees clockwise.
 */
export interface Vec2 {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface LayerTransform {
  cx: number
  cy: number
  sx: number
  sy: number
  rot: number
}

export const DEG = Math.PI / 180

export function identityTransform(w: number, h: number): LayerTransform {
  return { cx: w / 2, cy: h / 2, sx: 1, sy: 1, rot: 0 }
}

/** Layer-local pixel (0..w, 0..h) → document point. */
export function layerToDoc(t: LayerTransform, w: number, h: number, q: Vec2): Vec2 {
  const a = Math.cos(t.rot * DEG)
  const b = Math.sin(t.rot * DEG)
  const lx = (q.x - w / 2) * t.sx
  const ly = (q.y - h / 2) * t.sy
  return { x: t.cx + a * lx - b * ly, y: t.cy + b * lx + a * ly }
}

/** Document point → layer-local pixel (0..w, 0..h inside the layer). */
export function docToLayer(t: LayerTransform, w: number, h: number, p: Vec2): Vec2 {
  const a = Math.cos(t.rot * DEG)
  const b = Math.sin(t.rot * DEG)
  const dx = p.x - t.cx
  const dy = p.y - t.cy
  return {
    x: (a * dx + b * dy) / t.sx + w / 2,
    y: (-b * dx + a * dy) / t.sy + h / 2
  }
}

/**
 * 3×3 matrix (column-major, ready for WebGL `uniformMatrix3fv`) mapping a document
 * point to layer UV (0..1). Used by the compositor to sample each layer.
 */
export function docToLayerUVMatrix(t: LayerTransform, w: number, h: number): Float32Array {
  const a = Math.cos(t.rot * DEG)
  const b = Math.sin(t.rot * DEG)
  const kx = 1 / (t.sx * w)
  const ky = 1 / (t.sy * h)
  const m00 = a * kx
  const m01 = b * kx
  const m02 = -(a * t.cx + b * t.cy) * kx + 0.5
  const m10 = -b * ky
  const m11 = a * ky
  const m12 = (b * t.cx - a * t.cy) * ky + 0.5
  return new Float32Array([m00, m10, 0, m01, m11, 0, m02, m12, 1])
}

/**
 * Column-major mat3 mapping a pixel of a layer texture (texW×texH, which may differ from the
 * layer's logical w×h) to document UV (0..1 over docW×docH). Used to clip paint to a selection.
 */
export function layerTexToDocUVMatrix(
  t: LayerTransform,
  w: number,
  h: number,
  texW: number,
  texH: number,
  docW: number,
  docH: number
): Float32Array {
  const a = Math.cos(t.rot * DEG)
  const b = Math.sin(t.rot * DEG)
  const kw = w / texW
  const kh = h / texH
  const m00 = (a * t.sx * kw) / docW
  const m01 = (-b * t.sy * kh) / docW
  const m10 = (b * t.sx * kw) / docH
  const m11 = (a * t.sy * kh) / docH
  const m02 = (t.cx - ((a * t.sx * w) / 2 - (b * t.sy * h) / 2)) / docW
  const m12 = (t.cy - ((b * t.sx * w) / 2 + (a * t.sy * h) / 2)) / docH
  return new Float32Array([m00, m10, 0, m01, m11, 0, m02, m12, 1])
}

export function layerCorners(t: LayerTransform, w: number, h: number): Vec2[] {
  return [
    layerToDoc(t, w, h, { x: 0, y: 0 }),
    layerToDoc(t, w, h, { x: w, y: 0 }),
    layerToDoc(t, w, h, { x: w, y: h }),
    layerToDoc(t, w, h, { x: 0, y: h })
  ]
}

export function layerBounds(t: LayerTransform, w: number, h: number): Rect {
  const c = layerCorners(t, w, h)
  const xs = c.map((p) => p.x)
  const ys = c.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

export function layerContains(t: LayerTransform, w: number, h: number, p: Vec2): boolean {
  const q = docToLayer(t, w, h, p)
  return q.x >= 0 && q.y >= 0 && q.x <= w && q.y <= h
}

/* ---------- Whole-document operations applied to one layer transform ---------- */

export function rotateTransform90(t: LayerTransform, docW: number, docH: number, cw: boolean): LayerTransform {
  return cw
    ? { ...t, cx: docH - t.cy, cy: t.cx, rot: normDeg(t.rot + 90) }
    : { ...t, cx: t.cy, cy: docW - t.cx, rot: normDeg(t.rot - 90) }
}

export function flipTransform(t: LayerTransform, docW: number, docH: number, axis: 'h' | 'v'): LayerTransform {
  return axis === 'h'
    ? { ...t, cx: docW - t.cx, sx: -t.sx, rot: normDeg(-t.rot) }
    : { ...t, cy: docH - t.cy, sy: -t.sy, rot: normDeg(-t.rot) }
}

export function translateTransform(t: LayerTransform, dx: number, dy: number): LayerTransform {
  return { ...t, cx: t.cx + dx, cy: t.cy + dy }
}

/** Scale the document by (kx, ky) around its origin. */
export function scaleTransform(t: LayerTransform, kx: number, ky: number): LayerTransform {
  const r = ((normDeg(t.rot) % 180) + 180) % 180
  let fx: number
  let fy: number
  if (Math.abs(r) < 1e-6) {
    fx = kx
    fy = ky
  } else if (Math.abs(r - 90) < 1e-6) {
    fx = ky
    fy = kx
  } else {
    // A rotated layer cannot be skewed; approximate non-uniform scaling uniformly.
    fx = fy = Math.sqrt(kx * ky)
  }
  return { ...t, cx: t.cx * kx, cy: t.cy * ky, sx: t.sx * fx, sy: t.sy * fy }
}

/** Uniform scale + center so the layer fits inside the document. */
export function fitTransform(t: LayerTransform, w: number, h: number, docW: number, docH: number): LayerTransform {
  const base = { ...t, cx: 0, cy: 0, sx: Math.sign(t.sx) || 1, sy: Math.sign(t.sy) || 1 }
  const b = layerBounds(base, w, h)
  const k = Math.min(docW / b.w, docH / b.h)
  return { ...base, cx: docW / 2, cy: docH / 2, sx: base.sx * k, sy: base.sy * k }
}

export function normDeg(d: number): number {
  let r = d % 360
  if (r > 180) r -= 360
  if (r <= -180) r += 360
  return r
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** Fit a rectangle with aspect ratio `ratio` (w/h) inside (W, H), centered. */
export function fitRatioRect(W: number, H: number, ratio: number): Rect {
  let w = W
  let h = W / ratio
  if (h > H) {
    h = H
    w = H * ratio
  }
  return { x: (W - w) / 2, y: (H - h) / 2, w, h }
}
