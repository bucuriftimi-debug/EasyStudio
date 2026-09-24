/**
 * Adjustments (user-facing sliders) and looks (one-click filter presets).
 * Shared by the photo editor (per layer) and later the video editor (per clip).
 */

export type AdjustKey =
  | 'exposure'
  | 'brightness'
  | 'contrast'
  | 'highlights'
  | 'shadows'
  | 'temperature'
  | 'tint'
  | 'hue'
  | 'saturation'
  | 'vibrance'
  | 'clarity'
  | 'sharpen'
  | 'blur'
  | 'vignette'
  | 'grain'
  | 'fade'

export type AdjustGroup = 'light' | 'color' | 'effects'

export interface AdjustDef {
  key: AdjustKey
  group: AdjustGroup
  min: number
  max: number
  /** Shown in Simple mode (everything is shown in Pro mode). */
  simple: boolean
}

/** Slider values are integers in UI units (mostly -100..100); 0 is always neutral. */
export const ADJUSTMENTS: AdjustDef[] = [
  { key: 'exposure', group: 'light', min: -100, max: 100, simple: false },
  { key: 'brightness', group: 'light', min: -100, max: 100, simple: true },
  { key: 'contrast', group: 'light', min: -100, max: 100, simple: true },
  { key: 'highlights', group: 'light', min: -100, max: 100, simple: true },
  { key: 'shadows', group: 'light', min: -100, max: 100, simple: true },
  { key: 'temperature', group: 'color', min: -100, max: 100, simple: true },
  { key: 'tint', group: 'color', min: -100, max: 100, simple: false },
  { key: 'saturation', group: 'color', min: -100, max: 100, simple: true },
  { key: 'vibrance', group: 'color', min: -100, max: 100, simple: false },
  { key: 'hue', group: 'color', min: -100, max: 100, simple: false },
  { key: 'clarity', group: 'effects', min: -100, max: 100, simple: false },
  { key: 'sharpen', group: 'effects', min: 0, max: 100, simple: true },
  { key: 'blur', group: 'effects', min: 0, max: 100, simple: true },
  { key: 'vignette', group: 'effects', min: -100, max: 100, simple: true },
  { key: 'grain', group: 'effects', min: 0, max: 100, simple: false },
  { key: 'fade', group: 'effects', min: 0, max: 100, simple: false }
]

export type AdjustValues = Partial<Record<AdjustKey, number>>

export interface SplitTone {
  shadow: string
  highlight: string
  /** 0..1 */
  amount: number
}

export interface LookDef {
  id: string
  /** i18n key */
  label: string
  adjust: AdjustValues
  mono?: number
  split?: SplitTone
}

export const LOOKS: LookDef[] = [
  { id: 'vivid', label: 'look.vivid', adjust: { saturation: 22, vibrance: 30, contrast: 14, clarity: 10 } },
  { id: 'warm', label: 'look.warm', adjust: { temperature: 32, tint: 4, vibrance: 10 } },
  { id: 'cool', label: 'look.cool', adjust: { temperature: -32, tint: -4, contrast: 6 } },
  {
    id: 'golden',
    label: 'look.golden',
    adjust: { temperature: 30, exposure: 6, highlights: -15, shadows: 15, vibrance: 15 },
    split: { shadow: '#5a3a1a', highlight: '#ffd27a', amount: 0.35 }
  },
  { id: 'matte', label: 'look.matte', adjust: { contrast: -15, fade: 45, saturation: -10 } },
  {
    id: 'film',
    label: 'look.film',
    adjust: { fade: 25, grain: 30, contrast: 10, saturation: -8 },
    split: { shadow: '#1f4a4a', highlight: '#ffcf9a', amount: 0.3 }
  },
  {
    id: 'teal-orange',
    label: 'look.tealOrange',
    adjust: { contrast: 12, saturation: 10 },
    split: { shadow: '#0f5a66', highlight: '#ff9d4d', amount: 0.55 }
  },
  { id: 'dramatic', label: 'look.dramatic', adjust: { contrast: 35, clarity: 40, vignette: 30, saturation: -10, highlights: -20, shadows: 10 } },
  {
    id: 'vintage',
    label: 'look.vintage',
    adjust: { fade: 35, temperature: 20, saturation: -20, grain: 20, vignette: 20 },
    split: { shadow: '#3a2a4a', highlight: '#f7e2b0', amount: 0.3 }
  },
  { id: 'mono', label: 'look.mono', adjust: { contrast: 10 }, mono: 1 },
  { id: 'noir', label: 'look.noir', adjust: { contrast: 45, vignette: 35, shadows: -15 }, mono: 1 },
  {
    id: 'sepia',
    label: 'look.sepia',
    adjust: { fade: 10 },
    mono: 1,
    split: { shadow: '#3b2412', highlight: '#f3d9a6', amount: 0.9 }
  }
]

export function getLook(id: string | null | undefined): LookDef | undefined {
  return id ? LOOKS.find((l) => l.id === id) : undefined
}

/** Normalised parameters consumed by the shaders. */
export interface EffectParams {
  exposure: number
  brightness: number
  contrast: number
  highlights: number
  shadows: number
  temperature: number
  tint: number
  hue: number
  saturation: number
  vibrance: number
  clarity: number
  sharpen: number
  blur: number
  vignette: number
  grain: number
  fade: number
  mono: number
  splitAmount: number
  splitShadow: [number, number, number]
  splitHighlight: [number, number, number]
}

export const NEUTRAL_EFFECTS: EffectParams = {
  exposure: 0,
  brightness: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  temperature: 0,
  tint: 0,
  hue: 0,
  saturation: 0,
  vibrance: 0,
  clarity: 0,
  sharpen: 0,
  blur: 0,
  vignette: 0,
  grain: 0,
  fade: 0,
  mono: 0,
  splitAmount: 0,
  splitShadow: [0.5, 0.5, 0.5],
  splitHighlight: [0.5, 0.5, 0.5]
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** Combine user adjustments with an optional look (amount 0..100) into shader parameters. */
export function toEffectParams(adj: AdjustValues, lookId?: string | null, lookAmount = 100): EffectParams {
  const look = getLook(lookId)
  const k = look ? Math.max(0, Math.min(1, lookAmount / 100)) : 0
  const v = (key: AdjustKey) => {
    const def = ADJUSTMENTS.find((d) => d.key === key)!
    const raw = (adj[key] ?? 0) + (look?.adjust[key] ?? 0) * k
    return Math.max(def.min, Math.min(def.max, raw)) / 100
  }
  return {
    exposure: v('exposure') * 2, // ±2 EV
    brightness: v('brightness'),
    contrast: v('contrast'),
    highlights: v('highlights'),
    shadows: v('shadows'),
    temperature: v('temperature'),
    tint: v('tint'),
    hue: v('hue'),
    saturation: v('saturation'),
    vibrance: v('vibrance'),
    clarity: v('clarity'),
    sharpen: v('sharpen'),
    blur: v('blur'),
    vignette: v('vignette'),
    grain: v('grain'),
    fade: v('fade'),
    mono: (look?.mono ?? 0) * k,
    splitAmount: (look?.split?.amount ?? 0) * k,
    splitShadow: look?.split ? hexToRgb(look.split.shadow) : [0.5, 0.5, 0.5],
    splitHighlight: look?.split ? hexToRgb(look.split.highlight) : [0.5, 0.5, 0.5]
  }
}

export function isNeutral(e: EffectParams): boolean {
  return (
    e.exposure === 0 &&
    e.brightness === 0 &&
    e.contrast === 0 &&
    e.highlights === 0 &&
    e.shadows === 0 &&
    e.temperature === 0 &&
    e.tint === 0 &&
    e.hue === 0 &&
    e.saturation === 0 &&
    e.vibrance === 0 &&
    e.clarity === 0 &&
    e.sharpen === 0 &&
    e.blur === 0 &&
    e.vignette === 0 &&
    e.grain === 0 &&
    e.fade === 0 &&
    e.mono === 0 &&
    e.splitAmount === 0
  )
}

/**
 * "Auto" button: derive adjustments from a small RGBA (straight alpha) sample of the image.
 * Stretches levels towards a healthy exposure, adds a touch of contrast and neutralises casts.
 */
export function autoEnhance(pixels: Uint8ClampedArray | Uint8Array): AdjustValues {
  const hist = new Array<number>(256).fill(0)
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue
    const L = Math.round(0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2])
    hist[L]++
    r += pixels[i]
    g += pixels[i + 1]
    b += pixels[i + 2]
    n++
  }
  if (!n) return {}
  const pct = (p: number) => {
    let acc = 0
    for (let i = 0; i < 256; i++) {
      acc += hist[i]
      if (acc >= n * p) return i / 255
    }
    return 1
  }
  const lo = pct(0.01)
  const mid = pct(0.5)
  const hi = pct(0.99)
  const round = (x: number, lim = 60) => Math.round(Math.max(-lim, Math.min(lim, x)))

  const out: AdjustValues = {}
  // Aim the median at ~0.47 (exposure is ±2 EV over ±100).
  if (mid > 0.01) out.exposure = round((Math.log2(0.47 / mid) / 2) * 100 * 0.6, 45)
  const spread = hi - lo
  if (spread < 0.85) out.contrast = round((0.85 - spread) * 90, 40)
  if (hi < 0.9) out.highlights = round((0.9 - hi) * 80, 30)
  if (lo > 0.08) out.shadows = round(-(lo - 0.08) * 80, 30)
  else if (lo < 0.01) out.shadows = 12
  // Grey-world white balance: warm/cool from the red/blue balance.
  const avgR = r / n
  const avgB = b / n
  const avgG = g / n
  const cast = (avgB - avgR) / Math.max(1, (avgR + avgG + avgB) / 3)
  out.temperature = round(cast * 90, 25)
  out.vibrance = 12
  for (const k of Object.keys(out) as AdjustKey[]) if (!out[k]) delete out[k]
  return out
}
