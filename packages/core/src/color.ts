/** Colour helpers shared by the colour picker, text/shape styles and the GPU tools. */

export interface RGB {
  r: number
  g: number
  b: number
}

export interface HSV {
  /** 0..360 */
  h: number
  /** 0..1 */
  s: number
  /** 0..1 */
  v: number
}

export function parseHex(hex: string): RGB | null {
  const m = hex.trim().replace(/^#/, '')
  const full = m.length === 3 ? m.replace(/(.)/g, '$1$1') : m
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  const n = parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function toHex({ r, g, b }: RGB): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const d = max - min
  let h = 0
  if (d) {
    if (max === R) h = ((G - B) / d) % 6
    else if (max === G) h = (B - R) / d + 2
    else h = (R - G) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max ? d / max : 0, v: max }
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const c = v * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = v - c
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

export const hexToHsv = (hex: string): HSV => rgbToHsv(parseHex(hex) ?? { r: 0, g: 0, b: 0 })
export const hsvToHex = (hsv: HSV): string => toHex(hsvToRgb(hsv))

/** 0..1 floats for shaders. */
export function hexToUnit(hex: string): [number, number, number] {
  const c = parseHex(hex) ?? { r: 0, g: 0, b: 0 }
  return [c.r / 255, c.g / 255, c.b / 255]
}

/** Perceived brightness 0..1 (for choosing readable text on a swatch). */
export function luminance(hex: string): number {
  const c = parseHex(hex) ?? { r: 0, g: 0, b: 0 }
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255
}
