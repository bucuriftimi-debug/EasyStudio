/**
 * Flood fill on straight-alpha RGBA pixels. Returns a mask (255 = inside) of the pixels whose
 * colour is within `tolerance` (0..100) of the seed pixel. Used by the magic wand and paint bucket.
 */
export function floodMask(
  px: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  sx: number,
  sy: number,
  tolerance: number,
  contiguous: boolean
): { mask: Uint8Array; bounds: { x: number; y: number; w: number; h: number } | null } {
  const mask = new Uint8Array(w * h)
  const x0 = Math.floor(sx)
  const y0 = Math.floor(sy)
  if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return { mask, bounds: null }
  const tol = Math.round((Math.max(0, Math.min(100, tolerance)) / 100) * 255)
  const s = (y0 * w + x0) * 4
  const r = px[s]
  const g = px[s + 1]
  const b = px[s + 2]
  const a = px[s + 3]
  const match = (i: number): boolean => {
    const o = i * 4
    // Fully transparent pixels match each other regardless of their (meaningless) colour.
    if (a === 0 && px[o + 3] === 0) return true
    return (
      Math.abs(px[o] - r) <= tol &&
      Math.abs(px[o + 1] - g) <= tol &&
      Math.abs(px[o + 2] - b) <= tol &&
      Math.abs(px[o + 3] - a) <= tol
    )
  }
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  const mark = (x: number, y: number) => {
    mask[y * w + x] = 255
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }

  if (!contiguous) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (match(y * w + x)) mark(x, y)
  } else {
    // Scanline fill with an explicit stack.
    const stack: number[] = [x0, y0]
    while (stack.length) {
      const y = stack.pop()!
      let x = stack.pop()!
      let i = y * w + x
      while (x > 0 && !mask[i - 1] && match(i - 1)) {
        x--
        i--
      }
      let up = false
      let down = false
      while (x < w && !mask[i] && match(i)) {
        mark(x, y)
        if (y > 0) {
          const u = i - w
          if (!mask[u] && match(u)) {
            if (!up) {
              stack.push(x, y - 1)
              up = true
            }
          } else up = false
        }
        if (y < h - 1) {
          const d = i + w
          if (!mask[d] && match(d)) {
            if (!down) {
              stack.push(x, y + 1)
              down = true
            }
          } else down = false
        }
        x++
        i++
      }
    }
  }
  return { mask, bounds: maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } }
}
