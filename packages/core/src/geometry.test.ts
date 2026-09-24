import { describe, expect, it } from 'vitest'
import {
  docToLayer,
  docToLayerUVMatrix,
  fitTransform,
  flipTransform,
  identityTransform,
  layerBounds,
  layerCorners,
  layerToDoc,
  rotateTransform90,
  type LayerTransform,
  type Vec2
} from './geometry'

function applyMat(m: Float32Array, p: Vec2): Vec2 {
  // column-major 3x3
  return { x: m[0] * p.x + m[3] * p.y + m[6], y: m[1] * p.x + m[4] * p.y + m[7] }
}

const close = (a: Vec2, b: Vec2) => {
  expect(a.x).toBeCloseTo(b.x, 4)
  expect(a.y).toBeCloseTo(b.y, 4)
}

describe('geometry', () => {
  const t: LayerTransform = { cx: 300, cy: 200, sx: 1.5, sy: -0.75, rot: 33 }
  const w = 400
  const h = 300

  it('layerToDoc and docToLayer are inverses', () => {
    for (const q of [{ x: 0, y: 0 }, { x: 123, y: 45 }, { x: w, y: h }]) {
      close(docToLayer(t, w, h, layerToDoc(t, w, h, q)), q)
    }
  })

  it('UV matrix matches docToLayer / size', () => {
    const m = docToLayerUVMatrix(t, w, h)
    for (const p of [{ x: 10, y: 20 }, { x: 300, y: 200 }, { x: -50, y: 700 }]) {
      const q = docToLayer(t, w, h, p)
      close(applyMat(m, p), { x: q.x / w, y: q.y / h })
    }
  })

  it('identity transform covers the document exactly', () => {
    const b = layerBounds(identityTransform(640, 480), 640, 480)
    expect(b).toEqual({ x: 0, y: 0, w: 640, h: 480 })
  })

  it('rotating the document 90° clockwise moves the top-left corner to the top-right', () => {
    const docW = 640
    const docH = 480
    const r = rotateTransform90(identityTransform(docW, docH), docW, docH, true)
    const c = layerCorners(r, docW, docH)
    close(c[0], { x: docH, y: 0 }) // old top-left → new top-right
    close(c[2], { x: 0, y: docW }) // old bottom-right → new bottom-left
  })

  it('counter-clockwise undoes clockwise', () => {
    const docW = 640
    const docH = 480
    const r = rotateTransform90(rotateTransform90(t, docW, docH, true), docH, docW, false)
    for (const q of [{ x: 0, y: 0 }, { x: 50, y: 70 }]) close(layerToDoc(r, w, h, q), layerToDoc(t, w, h, q))
  })

  it('flipping mirrors every point across the document', () => {
    const docW = 1000
    const docH = 800
    const f = flipTransform(t, docW, docH, 'h')
    for (const q of [{ x: 0, y: 0 }, { x: 77, y: 123 }]) {
      const a = layerToDoc(t, w, h, q)
      close(layerToDoc(f, w, h, q), { x: docW - a.x, y: a.y })
    }
    const v = flipTransform(t, docW, docH, 'v')
    const a = layerToDoc(t, w, h, { x: 10, y: 10 })
    close(layerToDoc(v, w, h, { x: 10, y: 10 }), { x: a.x, y: docH - a.y })
  })

  it('fitTransform fits and centers', () => {
    const f = fitTransform(identityTransform(w, h), 4000, 3000, 1080, 1080)
    const b = layerBounds(f, 4000, 3000)
    expect(b.w).toBeCloseTo(1080)
    expect(b.h).toBeCloseTo(810)
    expect(f.cx).toBe(540)
  })
})
