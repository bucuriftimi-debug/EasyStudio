/**
 * Text drawn to a canvas: shared by EasyStudio Photo (text layers) and Video (titles).
 * Text is stored as settings (editable forever) and rendered on demand at any scale.
 */

export interface TextStyle {
  text: string
  font: string
  /** px (document pixels at scale 1) */
  size: number
  weight: number
  italic: boolean
  color: string
  fill: boolean
  align: 'left' | 'center' | 'right'
  lineHeight: number
  letterSpacing: number
  uppercase: boolean
  strokeColor: string
  strokeWidth: number
  shadowColor: string
  shadowBlur: number
  shadowX: number
  shadowY: number
  bgColor: string
  bgEnabled: boolean
  bgRadius: number
  bgPadding: number
}

export const DEFAULT_TEXT: TextStyle = {
  text: 'Your text',
  font: 'Montserrat',
  size: 96,
  weight: 700,
  italic: false,
  color: '#ffffff',
  fill: true,
  align: 'center',
  lineHeight: 1.15,
  letterSpacing: 0,
  uppercase: false,
  strokeColor: '#000000',
  strokeWidth: 0,
  shadowColor: '#000000',
  shadowBlur: 0,
  shadowX: 0,
  shadowY: 0,
  bgColor: '#7b6bff',
  bgEnabled: false,
  bgRadius: 16,
  bgPadding: 24
}

let epoch = 0
const pendingFonts = new Set<string>()
let onFontLoaded: (() => void) | null = null

/** Bumped every time a web font finishes loading (part of cache keys, so text is redrawn). */
export const fontEpoch = () => epoch

/** Called when a web font finishes loading, so text can be redrawn with the right typeface. */
export function setFontLoadedListener(fn: () => void): void {
  onFontLoaded = fn
}

export function fontString(s: TextStyle, scale = 1): string {
  return `${s.italic ? 'italic ' : ''}${s.weight} ${s.size * scale}px "${s.font}", "Inter Variable", sans-serif`
}

function ensureFont(s: TextStyle): void {
  if (typeof document === 'undefined' || !document.fonts) return
  const f = fontString(s)
  if (document.fonts.check(f) || pendingFonts.has(f)) return
  pendingFonts.add(f)
  document.fonts
    .load(f)
    .then(() => {
      epoch++
      onFontLoaded?.()
    })
    .catch(() => undefined)
}

const scratch = new OffscreenCanvas(1, 1).getContext('2d')!

interface TextLayout {
  lines: string[]
  lh: number
  contentW: number
  contentH: number
  pad: number
  bgPad: number
  w: number
  h: number
}

function layoutText(s: TextStyle): TextLayout {
  scratch.font = fontString(s)
  scratch.letterSpacing = `${s.letterSpacing}px`
  const raw = s.uppercase ? s.text.toUpperCase() : s.text
  const lines = (raw.length ? raw : ' ').split('\n')
  const widths = lines.map((l) => scratch.measureText(l.length ? l : ' ').width)
  const lh = s.size * s.lineHeight
  const contentW = Math.max(s.size * 0.3, ...widths)
  const contentH = lh * lines.length
  const bgPad = s.bgEnabled ? s.bgPadding : 0
  const shadow = s.shadowBlur > 0 || s.shadowX || s.shadowY ? s.shadowBlur * 1.5 + Math.max(Math.abs(s.shadowX), Math.abs(s.shadowY)) : 0
  const pad = Math.ceil(bgPad + Math.max(s.strokeWidth, 0) + shadow + 4)
  return { lines, lh, contentW, contentH, pad, bgPad, w: Math.ceil(contentW + pad * 2), h: Math.ceil(contentH + pad * 2) }
}

/** Logical size of a text layer (document px at scale 1). */
export function measureText(s: TextStyle): { w: number; h: number } {
  ensureFont(s)
  const l = layoutText(s)
  return { w: l.w, h: l.h }
}

/** Draw the text at `scale` (1 = its size in document pixels). */
export function renderText(s: TextStyle, scale: number): OffscreenCanvas {
  ensureFont(s)
  const L = layoutText(s)
  const c = new OffscreenCanvas(Math.max(1, Math.ceil(L.w * scale)), Math.max(1, Math.ceil(L.h * scale)))
  const ctx = c.getContext('2d')!
  ctx.scale(scale, scale)
  if (s.bgEnabled) {
    ctx.fillStyle = s.bgColor
    ctx.beginPath()
    ctx.roundRect(L.pad - L.bgPad, L.pad - L.bgPad, L.contentW + L.bgPad * 2, L.contentH + L.bgPad * 2, s.bgRadius)
    ctx.fill()
  }
  ctx.font = fontString(s)
  ctx.letterSpacing = `${s.letterSpacing}px`
  ctx.textBaseline = 'middle'
  ctx.textAlign = s.align
  const x = s.align === 'left' ? L.pad : s.align === 'center' ? L.pad + L.contentW / 2 : L.pad + L.contentW
  const hasShadow = s.shadowBlur > 0 || s.shadowX !== 0 || s.shadowY !== 0
  const setShadow = (on: boolean) => {
    ctx.shadowColor = on ? s.shadowColor : 'transparent'
    ctx.shadowBlur = on ? s.shadowBlur * scale : 0
    ctx.shadowOffsetX = on ? s.shadowX * scale : 0
    ctx.shadowOffsetY = on ? s.shadowY * scale : 0
  }
  L.lines.forEach((line, i) => {
    const y = L.pad + L.lh * i + L.lh / 2
    if (s.strokeWidth > 0) {
      setShadow(hasShadow)
      ctx.lineJoin = 'round'
      ctx.miterLimit = 2
      ctx.lineWidth = s.strokeWidth * (s.fill ? 2 : 1)
      ctx.strokeStyle = s.strokeColor
      ctx.strokeText(line, x, y)
      setShadow(false)
    } else setShadow(hasShadow)
    if (s.fill) {
      ctx.fillStyle = s.color
      ctx.fillText(line, x, y)
    }
    setShadow(false)
  })
  return c
}
