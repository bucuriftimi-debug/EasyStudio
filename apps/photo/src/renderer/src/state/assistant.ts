import i18next from 'i18next'
import { CROP_RATIOS, fitRatioRect, parseHex, toHex } from '@easystudio/core'
import { ADJUSTMENTS, autoEnhance, getLook, type AdjustKey, type AdjustValues } from '@easystudio/gpu'
import { ADJUST_KEYS, CROP_SHAPES, FILTER_IDS, TEXT_STYLES, seesPicture, type AiAction, type AiReply } from '../../../shared/aiTools'
import { buildScene, getRenderer, syncSources } from '../gpuHost'
import { cloudAi, cleanError } from '../platform'
import * as AI from './ai'
import * as ops from './docOps'
import { DEFAULT_TEXT, layerSource, measureText } from './gen'
import { beginGesture, cancelGesture, commit, endGesture, getDoc, live, toast, useEditor } from './store'
import { addBitmap } from './bitmaps'
import { STYLE_PRESETS } from './textStyles'
import type { PhotoDoc, TextStyle } from './types'

/**
 * The AI assistant: describe the document to the model, validate what it asks for, preview
 * the result live on the canvas, then apply it as one undo step (or throw it away).
 */

const t = (k: string, o?: Record<string, unknown>) => i18next.t(k, o) as string

export interface Planned {
  name: string
  args: Record<string, unknown>
  /** Human readable description for the list. */
  label: string
  /** Instant edits are previewed live; slow AI jobs run after "Apply". */
  instant: boolean
  enabled: boolean
}

const clampInt = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(Math.max(lo, Math.min(hi, n))) : null
}
const oneOf = (v: unknown, list: string[]) => (typeof v === 'string' && list.includes(v) ? v : null)

/** Turn a raw tool call into a safe, fully validated action (or drop it). */
export function validate(a: AiAction): Planned | null {
  const p = (label: string, args: Record<string, unknown>, instant = true): Planned => ({ name: a.name, args, label, instant, enabled: true })
  const g = a.args ?? {}
  switch (a.name) {
    case 'adjust_photo': {
      const adj: AdjustValues = {}
      for (const k of ADJUST_KEYS) {
        const def = ADJUSTMENTS.find((d) => d.key === k)!
        const v = clampInt(g[k], def.min, def.max)
        if (v !== null) adj[k as AdjustKey] = v
      }
      const keys = Object.keys(adj) as AdjustKey[]
      if (!keys.length) return null
      return p(keys.map((k) => `${t(`adjust.${k}`)} ${adj[k]! > 0 ? '+' : ''}${adj[k]}`).join(', '), adj)
    }
    case 'apply_filter': {
      const f = oneOf(g.filter, FILTER_IDS)
      if (!f) return null
      const strength = clampInt(g.strength ?? 100, 0, 100) ?? 100
      return p(f === 'none' ? t('assist.noFilter') : `${t('panel.filters')}: ${t(getLook(f)?.label ?? f)} ${strength}%`, { filter: f, strength })
    }
    case 'crop_to_shape': {
      const s = oneOf(g.shape, CROP_SHAPES)
      return s ? p(`${t('menu.crop')}: ${s === 'a4' ? 'A4' : s}`, { shape: s }) : null
    }
    case 'rotate_image': {
      const d = oneOf(g.direction, ['left', 'right'])
      return d ? p(t(d === 'left' ? 'menu.rotateCcw' : 'menu.rotateCw'), { direction: d }) : null
    }
    case 'flip_image': {
      const ax = oneOf(g.axis, ['horizontal', 'vertical'])
      return ax ? p(t(ax === 'horizontal' ? 'menu.flipH' : 'menu.flipV'), { axis: ax }) : null
    }
    case 'resize_image': {
      const le = clampInt(g.long_edge, 16, 16384)
      return le ? p(t('assist.resize', { px: le }), { long_edge: le }) : null
    }
    case 'add_text': {
      const text = typeof g.text === 'string' ? g.text.slice(0, 500) : ''
      if (!text.trim()) return null
      const color = typeof g.color === 'string' && parseHex(g.color) ? toHex(parseHex(g.color)!) : null
      return p(t('assist.text', { text }), {
        text,
        position: oneOf(g.position, ['top', 'center', 'bottom']) ?? 'center',
        style: oneOf(g.style, TEXT_STYLES) ?? 'title',
        color
      })
    }
    case 'enhance_automatically':
      return p(t('assist.auto'), {})
    case 'remove_background':
      return p(t('ai.removeBg'), {}, false)
    case 'enlarge_image': {
      const f = oneOf(String(g.factor ?? ''), ['2', '4'])
      return f ? p(t(f === '2' ? 'ai.upscale2' : 'ai.upscale4'), { factor: f }, false) : null
    }
    default:
      return null
  }
}

const STYLE_BY_NAME: Record<string, string> = {
  title: 'styleTitle',
  subtitle: 'styleSubtitle',
  handwritten: 'styleHand',
  neon: 'styleNeon',
  outline: 'styleOutline',
  label: 'styleLabel',
  classic: 'styleClassic',
  meme: 'styleMeme'
}

/** Apply every enabled instant action to a document (pure: returns a new document). */
export function applyInstant(base: PhotoDoc, actions: Planned[]): PhotoDoc {
  let d = base
  for (const a of actions) {
    if (!a.enabled || !a.instant) continue
    const layer = ops.activeLayer(d)
    switch (a.name) {
      case 'adjust_photo':
        if (layer) d = ops.updateLayer(d, layer.id, (l) => ({ adjust: { ...l.adjust, ...(a.args as AdjustValues) } }))
        break
      case 'enhance_automatically': {
        const r = getRenderer()
        if (!layer || !r) break
        syncSources(r, d)
        const px = r.readSource(layerSource(layer).id, 160)
        if (px) d = ops.updateLayer(d, layer.id, (l) => ({ adjust: { ...l.adjust, ...autoEnhance(px.data) } }))
        break
      }
      case 'apply_filter':
        if (layer) d = ops.updateLayer(d, layer.id, { look: a.args.filter === 'none' ? null : { id: String(a.args.filter), amount: Number(a.args.strength) } })
        break
      case 'crop_to_shape': {
        const ratio = CROP_RATIOS.find((r) => r.id === a.args.shape)?.ratio ?? 1
        d = ops.cropDoc(d, fitRatioRect(d.width, d.height, ratio))
        break
      }
      case 'rotate_image':
        d = ops.rotateDoc90(d, a.args.direction === 'right')
        break
      case 'flip_image':
        d = ops.flipDoc(d, a.args.axis === 'horizontal' ? 'h' : 'v')
        break
      case 'resize_image': {
        const k = Number(a.args.long_edge) / Math.max(d.width, d.height)
        d = ops.resizeDoc(d, d.width * k, d.height * k)
        break
      }
      case 'add_text': {
        const size = Math.max(16, Math.round(Math.min(d.width, d.height) * 0.09))
        let style: TextStyle = { ...DEFAULT_TEXT, text: String(a.args.text), size }
        const preset = STYLE_PRESETS.find((s) => s.id === STYLE_BY_NAME[String(a.args.style)])
        if (preset) style = { ...style, ...preset.make(style) }
        if (a.args.color) style.color = String(a.args.color)
        const box = measureText(style)
        const y = a.args.position === 'top' ? d.height * 0.14 : a.args.position === 'bottom' ? d.height * 0.86 : d.height / 2
        d = ops.addLayer(d, ops.createTextLayer(style, box, d.width / 2, y, t('layers.text')))
        break
      }
    }
  }
  return d
}

/** Short text describing the document, so the model knows what it is editing. */
export function describe(doc: PhotoDoc): string {
  const act = ops.activeLayer(doc)
  const lines = [`Picture size: ${doc.width} x ${doc.height} px.`, `Layers (bottom to top):`]
  doc.layers.forEach((l, i) => {
    const kind = l.type === 'raster' ? 'picture' : l.type === 'text' ? `text "${l.style.text.slice(0, 40)}"` : `shape (${l.shape.kind})`
    lines.push(`  ${i + 1}. ${l.name} — ${kind}${l.visible ? '' : ', hidden'}${l.id === act?.id ? ' [SELECTED]' : ''}`)
  })
  if (act) {
    const adj = Object.entries(act.adjust).filter(([, v]) => v)
    lines.push(`Selected layer sliders: ${adj.length ? adj.map(([k, v]) => `${k}=${v}`).join(', ') : 'all neutral (0)'}.`)
    lines.push(`Selected layer filter: ${act.look ? `${act.look.id} ${act.look.amount}%` : 'none'}.`)
  }
  return lines.join('\n')
}

/** A few numbers about how the picture looks, so models that cannot see it can still judge it. */
export function pictureStats(doc: PhotoDoc): string {
  const r = getRenderer()
  if (!r) return ''
  syncSources(r, doc)
  const k = Math.min(1, 160 / Math.max(doc.width, doc.height))
  const w = Math.max(1, Math.round(doc.width * k))
  const h = Math.max(1, Math.round(doc.height * k))
  const px = r.exportPixels(buildScene(doc), w, h, [1, 1, 1]).data
  const n = w * h
  const hist = new Uint32Array(256)
  let sum = 0
  let sum2 = 0
  let sat = 0
  let cast = 0
  for (let i = 0; i < n * 4; i += 4) {
    const R = px[i]
    const G = px[i + 1]
    const B = px[i + 2]
    const y = 0.2126 * R + 0.7152 * G + 0.0722 * B
    hist[Math.round(y)]++
    sum += y
    sum2 += y * y
    const mx = Math.max(R, G, B)
    sat += mx ? (mx - Math.min(R, G, B)) / mx : 0
    cast += R - B
  }
  const pct = (v: number) => Math.round((v / 255) * 100)
  const tone = (q: number) => {
    let acc = 0
    for (let i = 0; i < 256; i++) if ((acc += hist[i]) >= q * n) return i
    return 255
  }
  const mean = sum / n
  const sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean))
  const c = cast / n
  const castText = Math.abs(c) < 8 ? 'neutral' : c > 0 ? `warm (red-blue ${Math.round(c)})` : `cool (red-blue ${Math.round(c)})`
  return (
    `Picture analysis (0-100%): average brightness ${pct(mean)}%, contrast ${pct(sd * 2)}%, ` +
    `darkest tones ${pct(tone(0.02))}%, brightest tones ${pct(tone(0.98))}%, ` +
    `colour saturation ${Math.round((sat / n) * 100)}%, colour cast ${castText}.`
  )
}

/** Small JPEG of what is on screen (with all edits) for vision models. */
export async function snapshot(doc: PhotoDoc, maxSide = 1024): Promise<string> {
  const r = getRenderer()!
  syncSources(r, doc)
  const k = Math.min(1, maxSide / Math.max(doc.width, doc.height))
  const w = Math.max(1, Math.round(doc.width * k))
  const h = Math.max(1, Math.round(doc.height * k))
  const px = r.exportPixels(buildScene(doc), w, h, [1, 1, 1])
  const c = new OffscreenCanvas(w, h)
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px.data.buffer), w, h), 0, 0)
  return blobToBase64(await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 }))
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/**
 * Generative fill: ask OpenAI / Gemini to repaint the selected area from a description. The
 * result becomes a new layer with the selection as its mask, so nothing else can change.
 */
export async function generativeFill(prompt: string): Promise<void> {
  const bridge = cloudAi()
  const doc = getDoc()
  const sel = useEditor.getState().selection
  if (!bridge) throw new Error(t('assist.desktopOnly'))
  if (!doc || !sel) throw new Error(t('assist.needSelection'))
  const aspect = doc.width / doc.height
  const [W, H, size] = aspect > 1.2 ? [1536, 1024, '1536x1024'] : aspect < 0.83 ? [1024, 1536, '1024x1536'] : [1024, 1024, '1024x1024']
  const r = getRenderer()!
  syncSources(r, doc, sel)
  const px = r.exportPixels(buildScene(doc), W, H, null)
  const img = new OffscreenCanvas(W, H)
  img.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px.data.buffer), W, H), 0, 0)
  // Mask: opaque everywhere except the selected area (transparent = "paint here").
  const mask = new OffscreenCanvas(W, H)
  const mctx = mask.getContext('2d')!
  mctx.fillStyle = '#000'
  mctx.fillRect(0, 0, W, H)
  mctx.globalCompositeOperation = 'destination-out'
  mctx.drawImage(sel.canvas, 0, 0, W, H)
  const b = sel.bounds
  const pct = (v: number, of: number) => Math.round((v / of) * 100)
  const area = `from ${pct(b.x, doc.width)}% to ${pct(b.x + b.w, doc.width)}% of the width and from ${pct(b.y, doc.height)}% to ${pct(b.y + b.h, doc.height)}% of the height`
  let out: string
  try {
    out = await bridge.fill({
      prompt,
      image: await blobToBase64(await img.convertToBlob({ type: 'image/png' })),
      mask: await blobToBase64(await mask.convertToBlob({ type: 'image/png' })),
      size,
      area
    })
  } catch (e) {
    throw new Error(cleanError(e))
  }
  const bin = Uint8Array.from(atob(out), (ch) => ch.charCodeAt(0))
  const bmp = await createImageBitmap(new Blob([bin]))
  const full = new OffscreenCanvas(doc.width, doc.height)
  const fctx = full.getContext('2d')!
  fctx.imageSmoothingQuality = 'high'
  fctx.drawImage(bmp, 0, 0, doc.width, doc.height)
  bmp.close()
  const pixels = addBitmap(full)
  const maskBm = addBitmap(sel.canvas)
  const layer = { ...ops.createLayer(pixels.id, doc.width, doc.height, `AI: ${prompt.slice(0, 30)}`), mask: { bitmapId: maskBm.id, enabled: true } }
  commit(t('assist.fillHistory'), (d) => ops.addLayer(d, layer))
  useEditor.setState({ selection: null })
  toast(t('assist.fillDone'), 'success', 5000)
}

/* ------------------------------ session ------------------------------ */

export interface AssistantResult {
  reply: AiReply
  actions: Planned[]
}

/** Ask the configured AI and start a live preview of its instant actions. */
export async function ask(mode: 'command' | 'suggest', prompt: string): Promise<AssistantResult> {
  const bridge = cloudAi()
  const doc = getDoc()
  if (!bridge) throw new Error(t('assist.desktopOnly'))
  if (!doc) throw new Error(t('ai.needPicture'))
  const settings = await bridge.settings()
  if (settings.provider === 'off') throw new Error(t('assist.noProvider'))
  const image = seesPicture(settings) ? await snapshot(doc) : undefined
  let reply: AiReply
  try {
    reply = await bridge.ask({ mode, prompt, context: `${describe(doc)}\n${pictureStats(doc)}`, image })
  } catch (e) {
    throw new Error(cleanError(e))
  }
  const actions = reply.actions.map(validate).filter((a): a is Planned => !!a)
  preview(actions)
  return { reply, actions }
}

/** (Re)compute the live preview from the state before the assistant touched anything. */
export function preview(actions: Planned[]): void {
  beginGesture()
  const base = useEditor.getState().gestureBase
  if (!base) return
  live(t('assist.history'), () => applyInstant(base, actions))
}

/** Keep the preview as one undo step, then run the slow AI jobs (each its own step). */
export async function apply(actions: Planned[], prompt: string): Promise<void> {
  if (actions.some((a) => a.instant && a.enabled)) {
    if (actions.some((a) => a.enabled && ['crop_to_shape', 'rotate_image', 'resize_image'].includes(a.name))) useEditor.setState({ selection: null })
    endGesture(prompt ? `AI: ${prompt.slice(0, 40)}` : t('assist.history'))
  } else cancelGesture()
  for (const a of actions) {
    if (!a.enabled || a.instant) continue
    if (a.name === 'remove_background') await AI.removeBackground()
    if (a.name === 'enlarge_image') await AI.upscale(a.args.factor === '4' ? 4 : 2)
  }
}

export function discard(): void {
  cancelGesture()
}

export function aiErrorToast(e: unknown): void {
  toast(cleanError(e), 'error', 7000)
}
