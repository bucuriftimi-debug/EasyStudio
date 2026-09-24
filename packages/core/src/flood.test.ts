import { describe, expect, it } from 'vitest'
import { floodMask } from './flood'

/** Build an RGBA image from a string grid: '#' = black, '.' = white. */
function img(rows: string[]) {
  const h = rows.length
  const w = rows[0].length
  const px = new Uint8Array(w * h * 4)
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      const v = c === '#' ? 0 : 255
      px.set([v, v, v, 255], (y * w + x) * 4)
    })
  )
  return { px, w, h }
}

const count = (m: Uint8Array) => m.reduce((n, v) => n + (v ? 1 : 0), 0)

describe('floodMask', () => {
  const { px, w, h } = img([
    '.....#....', //
    '.###.#.##.',
    '.#.#.#.#..',
    '.###.#....',
    '.....#....'
  ])

  it('fills only the connected region (contiguous)', () => {
    const { mask, bounds } = floodMask(px, w, h, 0, 0, 10, true)
    // Left region: 5×5 minus the 8 black ring pixels, and the hole inside the ring is not connected.
    expect(count(mask)).toBe(25 - 8 - 1)
    expect(mask[2 * w + 2]).toBe(0) // hole inside the ring
    expect(bounds).toEqual({ x: 0, y: 0, w: 5, h: 5 })
  })

  it('selects every matching pixel when not contiguous', () => {
    const { mask } = floodMask(px, w, h, 0, 0, 10, false)
    const whites = [...Array(w * h).keys()].filter((i) => px[i * 4] === 255).length
    expect(count(mask)).toBe(whites)
  })

  it('respects tolerance', () => {
    const grad = new Uint8Array(10 * 4)
    for (let i = 0; i < 10; i++) grad.set([i * 20, i * 20, i * 20, 255], i * 4)
    expect(count(floodMask(grad, 10, 1, 0, 0, 0, true).mask)).toBe(1)
    expect(count(floodMask(grad, 10, 1, 0, 0, 16, true).mask)).toBe(3) // 0,20,40 within 40.8
    expect(count(floodMask(grad, 10, 1, 0, 0, 100, true).mask)).toBe(10)
  })

  it('returns an empty mask outside the image', () => {
    expect(floodMask(px, w, h, -1, 3, 50, true).bounds).toBeNull()
  })
})
