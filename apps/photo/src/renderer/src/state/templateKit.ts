import type { ShapeStyle, TextStyle } from './types'

/** Building blocks of the ready-made designs (state/templates.ts, state/templatesMore.ts). */

export type Paint = (ctx: OffscreenCanvasRenderingContext2D, w: number, h: number) => void

export type TemplateCategory = 'social' | 'video' | 'business' | 'cards'

export interface TextItem {
  kind: 'text'
  /** i18n key of the text (or the text itself) */
  text: string
  size: number
  preset?: string
  style?: Partial<TextStyle>
  cx: number
  cy: number
  rot?: number
  /** Widest the text may be (px); longer translations shrink to fit. Default: 90% of the page. */
  maxW?: number
}

export interface ShapeItem {
  kind: 'shape'
  name: string
  shape: Partial<ShapeStyle>
  x: number
  y: number
  w: number
  h: number
  rot?: number
  opacity?: number
}

export interface Template {
  id: string
  category: TemplateCategory
  w: number
  h: number
  background: Paint
  items: (TextItem | ShapeItem)[]
}

export const gradient =
  (angle: 'down' | 'diag' | 'across', ...stops: string[]): Paint =>
  (ctx, w, h) => {
    const g = angle === 'down' ? ctx.createLinearGradient(0, 0, 0, h) : angle === 'across' ? ctx.createLinearGradient(0, 0, w, 0) : ctx.createLinearGradient(0, 0, w, h)
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }

export const solid =
  (color: string): Paint =>
  (ctx, w, h) => {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
  }

/** Several backgrounds drawn on top of each other. */
export const layered =
  (...paints: Paint[]): Paint =>
  (ctx, w, h) =>
    paints.forEach((p) => p(ctx, w, h))

/** A regular grid of small dots. */
export const dots =
  (color: string, gap: number, r: number): Paint =>
  (ctx, w, h) => {
    ctx.fillStyle = color
    for (let y = gap / 2; y < h; y += gap)
      for (let x = gap / 2; x < w; x += gap) {
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
  }

/** Soft light from a point (x, y as fractions of the page). */
export const glow =
  (x: number, y: number, radius: number, color: string): Paint =>
  (ctx, w, h) => {
    const g = ctx.createRadialGradient(w * x, h * y, 0, w * x, h * y, Math.max(w, h) * radius)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }

/** Light rays from the centre, like a comic or a burst. */
export const rays =
  (color: string, count: number, cx = 0.5, cy = 0.5): Paint =>
  (ctx, w, h) => {
    const x = w * cx
    const y = h * cy
    const r = Math.hypot(w, h)
    ctx.fillStyle = color
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      const b = a + Math.PI / count
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
      ctx.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r)
      ctx.closePath()
      ctx.fill()
    }
  }

/** Diagonal stripes. */
export const stripes =
  (color: string, gap: number, width: number): Paint =>
  (ctx, w, h) => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    for (let x = -h; x < w; x += gap) {
      ctx.beginPath()
      ctx.moveTo(x, h)
      ctx.lineTo(x + h, 0)
      ctx.stroke()
    }
  }

/** Scattered soft circles (bokeh / confetti), always in the same places. */
export const bokeh =
  (colors: string[], count: number, minR: number, maxR: number, alpha = 0.35): Paint =>
  (ctx, w, h) => {
    for (let i = 0; i < count; i++) {
      const r = minR + (((i * 53) % 97) / 97) * (maxR - minR)
      ctx.globalAlpha = alpha
      ctx.fillStyle = colors[i % colors.length]
      ctx.beginPath()
      ctx.arc((((i * 389) % 1000) / 1000) * w, (((i * 613) % 1000) / 1000) * h, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

/** A thin frame inside the page. */
export const frame =
  (color: string, inset: number, width: number): Paint =>
  (ctx, w, h) => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2)
  }
