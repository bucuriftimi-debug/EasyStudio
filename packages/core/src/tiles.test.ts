import { describe, expect, it } from 'vitest'
import { alignToTiles, tileRect, tilesInRect, unionRect, TILE } from './tiles'
import { hexToHsv, hsvToHex, parseHex, toHex } from './color'
import { layerTexToDocUVMatrix, layerToDoc, type LayerTransform } from './geometry'

describe('tiles', () => {
  it('computes edge tiles', () => {
    expect(tileRect(0, 600, 300)).toEqual({ x: 0, y: 0, w: TILE, h: TILE })
    expect(tileRect(2, 600, 300)).toEqual({ x: 512, y: 0, w: 88, h: TILE })
    expect(tileRect(5, 600, 300)).toEqual({ x: 512, y: 256, w: 88, h: 44 })
  })

  it('aligns and clips rectangles to tiles', () => {
    expect(alignToTiles({ x: 300, y: 10, w: 20, h: 20 }, 600, 300)).toEqual({ x: 256, y: 0, w: 256, h: 256 })
    expect(alignToTiles({ x: -50, y: 250, w: 700, h: 100 }, 600, 300)).toEqual({ x: 0, y: 0, w: 600, h: 300 })
    expect(alignToTiles({ x: 700, y: 0, w: 10, h: 10 }, 600, 300)).toBeNull()
  })

  it('lists touched tiles', () => {
    expect(tilesInRect({ x: 250, y: 250, w: 10, h: 10 }, 600, 300)).toEqual([0, 1, 3, 4])
  })

  it('unions rectangles', () => {
    expect(unionRect(null, { x: 1, y: 2, w: 3, h: 4 })).toEqual({ x: 1, y: 2, w: 3, h: 4 })
    expect(unionRect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: -5, w: 10, h: 10 })).toEqual({ x: 0, y: -5, w: 15, h: 15 })
  })
})

describe('color', () => {
  it('round-trips hex ↔ hsv', () => {
    for (const hex of ['#ff0000', '#7b6bff', '#000000', '#ffffff', '#12ab34']) expect(hsvToHex(hexToHsv(hex))).toBe(hex)
  })
  it('parses short hex and rejects garbage', () => {
    expect(toHex(parseHex('#abc')!)).toBe('#aabbcc')
    expect(parseHex('nope')).toBeNull()
  })
})

describe('layer texture → doc UV', () => {
  it('matches layerToDoc for a scaled, rotated layer with a hi-res texture', () => {
    const t: LayerTransform = { cx: 400, cy: 300, sx: 1.5, sy: -0.5, rot: 30 }
    const w = 200
    const h = 100
    const m = layerTexToDocUVMatrix(t, w, h, w * 2, h * 2, 1000, 800)
    for (const px of [{ x: 0, y: 0 }, { x: 123, y: 45 }, { x: 400, y: 200 }]) {
      const d = layerToDoc(t, w, h, { x: px.x / 2, y: px.y / 2 })
      const u = { x: m[0] * px.x + m[3] * px.y + m[6], y: m[1] * px.x + m[4] * px.y + m[7] }
      expect(u.x).toBeCloseTo(d.x / 1000, 5)
      expect(u.y).toBeCloseTo(d.y / 800, 5)
    }
  })
})
