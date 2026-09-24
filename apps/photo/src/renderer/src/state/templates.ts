import i18next from 'i18next'
import { addBitmap } from './bitmaps'
import * as ops from './docOps'
import { DEFAULT_SHAPE, DEFAULT_TEXT, fontString, measureText, renderLayerCanvas } from './gen'
import { STYLE_PRESETS } from './textStyles'
import type { Layer, PhotoDoc, ShapeStyle, TextStyle } from './types'

/**
 * Ready-made designs for the start screen. They are built from normal layers (a picture for
 * the background, editable text and shapes), so everything can be changed afterwards.
 */

const t = (k: string) => i18next.t(k) as string

type Paint = (ctx: OffscreenCanvasRenderingContext2D, w: number, h: number) => void

interface TextItem {
  kind: 'text'
  /** i18n key of the text */
  text: string
  size: number
  preset?: string
  style?: Partial<TextStyle>
  cx: number
  cy: number
  rot?: number
}

interface ShapeItem {
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
  w: number
  h: number
  background: Paint
  items: (TextItem | ShapeItem)[]
}

const gradient =
  (angle: 'down' | 'diag', ...stops: string[]): Paint =>
  (ctx, w, h) => {
    const g = angle === 'down' ? ctx.createLinearGradient(0, 0, 0, h) : ctx.createLinearGradient(0, 0, w, h)
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }

export const TEMPLATES: Template[] = [
  {
    id: 'quote',
    w: 1080,
    h: 1080,
    background: gradient('diag', '#ffecd2', '#fcb69f'),
    items: [
      { kind: 'text', text: '“', size: 360, style: { font: 'Playfair Display', weight: 700, color: '#ffffff', italic: false }, cx: 540, cy: 360 },
      { kind: 'text', text: 'tpl.quoteText', size: 70, preset: 'styleClassic', style: { color: '#4a2c2a', shadowBlur: 0, shadowY: 0 }, cx: 540, cy: 560 },
      { kind: 'shape', name: 'Line', shape: { kind: 'rect', fill: '#4a2c2a' }, x: 480, y: 760, w: 120, h: 4 },
      { kind: 'text', text: 'tpl.quoteAuthor', size: 34, preset: 'styleSubtitle', style: { color: '#4a2c2a', shadowBlur: 0, shadowY: 0 }, cx: 540, cy: 830 }
    ]
  },
  {
    id: 'youtube',
    w: 1280,
    h: 720,
    background: (ctx, w, h) => {
      gradient('diag', '#1e1b4b', '#6d28d9', '#db2777')(ctx, w, h)
      const g = ctx.createRadialGradient(w * 0.78, h * 0.5, 0, w * 0.78, h * 0.5, h * 0.7)
      g.addColorStop(0, 'rgba(255,255,255,0.35)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    },
    items: [
      { kind: 'shape', name: 'Circle', shape: { kind: 'ellipse', fill: '#ffd400' }, x: 820, y: 150, w: 420, h: 420, opacity: 90 },
      { kind: 'text', text: 'tpl.ytTitle', size: 150, preset: 'styleMeme', style: { color: '#ffd400', align: 'left' }, cx: 400, cy: 380, rot: -4 },
      { kind: 'text', text: 'tpl.ytBadge', size: 46, preset: 'styleLabel', style: { bgColor: '#ef4444' }, cx: 190, cy: 110 },
      { kind: 'shape', name: 'Arrow', shape: { kind: 'arrow', fill: '#ffffff', stroke: '#ffffff', strokeWidth: 14 }, x: 760, y: 470, w: 180, h: 110, rot: -20 }
    ]
  },
  {
    id: 'story',
    w: 1080,
    h: 1920,
    background: gradient('down', '#43cea2', '#185a9d'),
    items: [
      { kind: 'shape', name: 'Card', shape: { kind: 'rect', fill: '#ffffff', radius: 48 }, x: 110, y: 560, w: 860, h: 800, opacity: 18 },
      { kind: 'text', text: 'tpl.storyTitle', size: 150, preset: 'styleHand', cx: 540, cy: 820 },
      { kind: 'text', text: 'tpl.storySub', size: 44, preset: 'styleSubtitle', cx: 540, cy: 1040 },
      { kind: 'text', text: 'tpl.storyDate', size: 52, preset: 'styleLabel', style: { bgColor: '#ffffff', color: '#185a9d' }, cx: 540, cy: 1210 }
    ]
  },
  {
    id: 'sale',
    w: 1080,
    h: 1080,
    background: (ctx, w, h) => {
      ctx.fillStyle = '#111111'
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = 'rgba(255,212,0,0.12)'
      ctx.lineWidth = 26
      for (let x = -h; x < w; x += 90) {
        ctx.beginPath()
        ctx.moveTo(x, h)
        ctx.lineTo(x + h, 0)
        ctx.stroke()
      }
    },
    items: [
      { kind: 'shape', name: 'Badge', shape: { kind: 'ellipse', fill: '#ffd400' }, x: 650, y: 90, w: 340, h: 340 },
      { kind: 'text', text: '-50%', size: 104, style: { font: 'Montserrat', weight: 900, color: '#111111' }, cx: 820, cy: 262, rot: -8 },
      { kind: 'text', text: 'tpl.saleTitle', size: 300, style: { font: 'Anton', weight: 400, color: '#ffffff', uppercase: true }, cx: 480, cy: 610 },
      { kind: 'text', text: 'tpl.saleSub', size: 48, preset: 'styleSubtitle', style: { color: '#ffd400', shadowBlur: 0, shadowY: 0 }, cx: 540, cy: 850 }
    ]
  },
  {
    id: 'birthday',
    w: 1500,
    h: 1050,
    background: gradient('diag', '#fdfbfb', '#fde2f3', '#e0f2fe'),
    items: [
      ...(
        [
          [140, 140, 70, '#f472b6'],
          [1320, 180, 90, '#60a5fa'],
          [230, 860, 110, '#facc15'],
          [1260, 860, 70, '#34d399'],
          [720, 110, 40, '#a78bfa'],
          [1400, 560, 36, '#f472b6'],
          [110, 520, 30, '#60a5fa']
        ] as const
      ).map(([x, y, r, c]) => ({ kind: 'shape' as const, name: 'Confetti', shape: { kind: 'ellipse' as const, fill: c }, x: x - r, y: y - r, w: r * 2, h: r * 2, opacity: 85 })),
      { kind: 'text', text: 'tpl.bdayTitle', size: 170, preset: 'styleHand', style: { color: '#db2777', shadowColor: '#ffffff', shadowBlur: 0, shadowY: 6 }, cx: 750, cy: 450 },
      { kind: 'text', text: 'tpl.bdaySub', size: 50, preset: 'styleSubtitle', style: { color: '#6b21a8', shadowBlur: 0, shadowY: 0 }, cx: 750, cy: 650 }
    ]
  },
  {
    id: 'event',
    w: 1240,
    h: 1754,
    background: (ctx, w, h) => {
      gradient('down', '#0f172a', '#1e1b4b')(ctx, w, h)
      for (let i = 0; i < 160; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.2 + ((i * 37) % 60) / 100})`
        const r = ((i * 13) % 3) + 1
        ctx.beginPath()
        ctx.arc((i * 431) % w, (i * 197) % (h * 0.6), r, 0, Math.PI * 2)
        ctx.fill()
      }
    },
    items: [
      { kind: 'text', text: 'tpl.eventTitle', size: 170, preset: 'styleNeon', cx: 620, cy: 640 },
      { kind: 'shape', name: 'Line', shape: { kind: 'rect', fill: '#ff2fd0' }, x: 370, y: 860, w: 500, h: 6 },
      { kind: 'text', text: 'tpl.eventSub', size: 56, preset: 'styleSubtitle', cx: 620, cy: 980 },
      { kind: 'text', text: 'tpl.eventWhen', size: 60, preset: 'styleLabel', style: { bgColor: '#ff2fd0' }, cx: 620, cy: 1300 }
    ]
  }
]

function textStyle(item: TextItem, size = item.size): TextStyle {
  let s: TextStyle = { ...DEFAULT_TEXT, text: item.text.startsWith('tpl.') ? t(item.text) : item.text, size }
  const preset = STYLE_PRESETS.find((p) => p.id === item.preset)
  if (preset) s = { ...s, ...preset.make(s) }
  return { ...s, ...item.style }
}

/** The editable (text / shape) layers of a template, in document pixels. */
function designLayers(tpl: Template): Layer[] {
  return tpl.items.map((it) => {
    if (it.kind === 'text') {
      let style = textStyle(it)
      let box = measureText(style)
      // Translations can be longer than the English text: shrink to fit the page.
      const maxW = tpl.w * 0.9
      if (box.w > maxW) {
        style = textStyle(it, Math.floor((it.size * maxW) / box.w))
        box = measureText(style)
      }
      const l = ops.createTextLayer(style, box, it.cx, it.cy, style.text.split('\n')[0].slice(0, 30))
      return it.rot ? { ...l, transform: { ...l.transform, rot: it.rot } } : l
    }
    const l = ops.createShapeLayer({ ...DEFAULT_SHAPE, ...it.shape }, it.w, it.h, { cx: it.x + it.w / 2, cy: it.y + it.h / 2, sx: 1, sy: 1, rot: it.rot ?? 0 }, it.name)
    return it.opacity !== undefined ? { ...l, opacity: it.opacity } : l
  })
}

/** Wait for the web fonts a template uses, so text is measured with the right typeface. */
async function loadFonts(tpl: Template): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  const fonts = tpl.items.filter((i): i is TextItem => i.kind === 'text').map((i) => fontString(textStyle(i)))
  await Promise.all([...new Set(fonts)].map((f) => document.fonts.load(f).catch(() => [])))
}

export async function buildTemplate(tpl: Template): Promise<PhotoDoc> {
  await loadFonts(tpl)
  const bg = new OffscreenCanvas(tpl.w, tpl.h)
  tpl.background(bg.getContext('2d')!, tpl.w, tpl.h)
  const base = ops.createLayer(addBitmap(bg).id, tpl.w, tpl.h, t('layers.background'))
  const layers = [base, ...designLayers(tpl)]
  return { name: t(`tpl.${tpl.id}`), width: tpl.w, height: tpl.h, layers, activeLayerId: layers[layers.length - 1].id }
}

/** Small picture of a template for the start screen (drawn without the GPU). */
export async function templatePreview(tpl: Template, maxSide = 300): Promise<string> {
  await loadFonts(tpl)
  const k = maxSide / Math.max(tpl.w, tpl.h)
  const c = new OffscreenCanvas(Math.round(tpl.w * k), Math.round(tpl.h * k))
  const ctx = c.getContext('2d')!
  ctx.save()
  ctx.scale(k, k)
  tpl.background(ctx, tpl.w, tpl.h)
  for (const l of designLayers(tpl)) {
    const px = renderLayerCanvas(l)
    if (!px) continue
    ctx.save()
    ctx.globalAlpha = l.opacity / 100
    ctx.translate(l.transform.cx, l.transform.cy)
    ctx.rotate((l.transform.rot * Math.PI) / 180)
    ctx.drawImage(px, -l.width / 2, -l.height / 2, l.width, l.height)
    ctx.restore()
  }
  ctx.restore()
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
  return URL.createObjectURL(blob)
}
