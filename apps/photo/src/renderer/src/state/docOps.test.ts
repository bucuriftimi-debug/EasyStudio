import { describe, expect, it } from 'vitest'
import { layerBounds } from '@easystudio/core'
import {
  addLayer,
  createDoc,
  createLayer,
  cropDoc,
  duplicateLayer,
  moveLayerBy,
  removeLayer,
  resizeCanvas,
  resizeDoc,
  rotateDoc90
} from './docOps'

const base = () => {
  const bg = createLayer('bm1', 800, 600, 'Background')
  return createDoc('test', 800, 600, bg)
}

describe('docOps', () => {
  it('adds layers above the active one and activates them', () => {
    let d = base()
    const a = createLayer('bm2', 100, 100, 'A')
    d = addLayer(d, a)
    expect(d.layers.map((l) => l.name)).toEqual(['Background', 'A'])
    expect(d.activeLayerId).toBe(a.id)
  })

  it('removes a layer and picks a new active one', () => {
    let d = base()
    const a = createLayer('bm2', 100, 100, 'A')
    d = addLayer(d, a)
    d = removeLayer(d, a.id)
    expect(d.layers).toHaveLength(1)
    expect(d.activeLayerId).toBe(d.layers[0].id)
  })

  it('duplicates and reorders', () => {
    let d = base()
    d = duplicateLayer(d, d.layers[0].id, 'copy')
    expect(d.layers[1].name).toBe('Background copy')
    expect(d.layers[1].id).not.toBe(d.layers[0].id)
    const top = d.layers[1].id
    d = moveLayerBy(d, top, -1)
    expect(d.layers[0].id).toBe(top)
    d = moveLayerBy(d, top, -5) // clamps
    expect(d.layers[0].id).toBe(top)
  })

  it('crop shifts layers without touching pixels', () => {
    const d = cropDoc(base(), { x: 100, y: 50, w: 400, h: 300 })
    expect([d.width, d.height]).toEqual([400, 300])
    const b = layerBounds(d.layers[0].transform, 800, 600)
    expect(b.x).toBe(-100)
    expect(b.y).toBe(-50)
  })

  it('rotating 90° swaps the canvas size and keeps the layer covering it', () => {
    const d = rotateDoc90(base(), true)
    expect([d.width, d.height]).toEqual([600, 800])
    const b = layerBounds(d.layers[0].transform, 800, 600)
    expect(b.x).toBeCloseTo(0)
    expect(b.y).toBeCloseTo(0)
    expect(b.w).toBeCloseTo(600)
    expect(b.h).toBeCloseTo(800)
  })

  it('resize scales content, canvas size does not', () => {
    const r = resizeDoc(base(), 400, 300)
    expect(layerBounds(r.layers[0].transform, 800, 600).w).toBeCloseTo(400)
    const c = resizeCanvas(base(), 1000, 1000, 0.5, 0.5)
    const b = layerBounds(c.layers[0].transform, 800, 600)
    expect([b.x, b.y, b.w]).toEqual([100, 200, 800])
  })
})
