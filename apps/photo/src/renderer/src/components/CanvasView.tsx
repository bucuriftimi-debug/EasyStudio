import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18next from 'i18next'
import { Renderer } from '@easystudio/gpu'
import { layerContains, layerToDoc, type LayerTransform, type Rect, type Vec2 } from '@easystudio/core'
import { buildScene, setRenderer, syncSources } from '../gpuHost'
import * as A from '../state/actions'
import * as paint from '../state/paint'
import * as AI from '../state/ai'
import { activeLayer, updateLayer } from '../state/docOps'
import { beginGesture, endGesture, fitView, getDoc, live, useEditor, zoomTo } from '../state/store'
import type { PhotoDoc, SelOp } from '../state/types'
import {
  cropHandles,
  drawCrop,
  hitHandle,
  layerHandles,
  moveCrop,
  resizeCrop,
  resizeCursor,
  rotateAround,
  scaleFromHandle,
  snapMove,
  toDoc,
  toScreen,
  type Guides
} from './interact'
import { Overlay, type Draft } from './Overlay'

const BG: [number, number, number] = [0x0e / 255, 0x0f / 255, 0x12 / 255]

type Drag =
  | { kind: 'pan'; sx: number; sy: number; panX: number; panY: number }
  | { kind: 'move'; id: string; m0: Vec2; t0: LayerTransform }
  | { kind: 'scale'; id: string; hx: number; hy: number; t0: LayerTransform; w: number; h: number }
  | { kind: 'rotate'; id: string; m0: Vec2; t0: LayerTransform }
  | { kind: 'crop-move'; m0: Vec2; r0: Rect }
  | { kind: 'crop-resize'; hx: number; hy: number; r0: Rect }
  | { kind: 'crop-new'; m0: Vec2 }
  | { kind: 'paint' }
  | { kind: 'gradient'; m0: Vec2 }
  | { kind: 'pick' }
  | { kind: 'sel'; m0: Vec2; op: SelOp; pts: Vec2[] }
  | { kind: 'shape'; m0: Vec2 }
  | { kind: 'erase'; pts: Vec2[] }

const get = useEditor.getState
const set = useEditor.setState

function topLayerAt(doc: PhotoDoc, p: Vec2): string | null {
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i]
    if (l.visible && layerContains(l.transform, l.width, l.height, p)) return l.id
  }
  return null
}

const BRUSH_TOOLS = new Set(['brush', 'eraser', 'clone', 'magic'])

function selOpFrom(e: React.PointerEvent): SelOp {
  if (e.shiftKey && e.altKey) return 'int'
  if (e.shiftKey) return 'add'
  if (e.altKey) return 'sub'
  return get().settings.selectOp
}

export function CanvasView() {
  const { t } = useTranslation()
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drag = useRef<Drag | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cursor, setCursor] = useState('default')
  const [space, setSpace] = useState(false)
  const [guides, setGuides] = useState<Guides>({})
  const [hover, setHover] = useState<string | null>(null)
  const [pointer, setPointer] = useState<Vec2 | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const tool = useEditor((s) => s.tool)

  /* ---------------- renderer lifecycle + render loop ---------------- */
  useEffect(() => {
    const canvas = canvasRef.current!
    const wrap = wrapRef.current!
    let r: Renderer
    try {
      r = new Renderer(canvas)
    } catch (e) {
      console.error(e)
      setError(i18next.t('msg.noWebgl'))
      return
    }
    setRenderer(r)
    let raf = 0
    const t0 = performance.now()
    const draw = () => {
      raf = 0
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(1, Math.round(wrap.clientWidth * dpr))
      const h = Math.max(1, Math.round(wrap.clientHeight * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      const s = get()
      const doc = s.hist?.present.state
      if (!doc) return r.clear(BG)
      syncSources(r, doc, s.selection)
      r.present(buildScene(doc, s.compare), {
        ...s.view,
        dpr,
        bg: BG,
        selectionId: s.selection && !s.compare ? s.selection.id : null,
        time: (performance.now() - t0) / 1000
      })
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(draw)
    }
    ;(window as unknown as { __esRender?: () => void }).__esRender = schedule
    const unsub = useEditor.subscribe((s, p) => {
      if (s.hist !== p.hist || s.view !== p.view || s.compare !== p.compare || s.viewport !== p.viewport || s.selection !== p.selection || s.fontEpoch !== p.fontEpoch)
        schedule()
    })
    // Marching ants: redraw a few times per second while there is a selection.
    const ants = setInterval(() => get().selection && schedule(), 120)
    let first = true
    const ro = new ResizeObserver(() => {
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      const prev = get().viewport
      set({ viewport: { w, h } })
      if (first) {
        first = false
        fitView()
      } else {
        const v = get().view
        set({ view: { ...v, panX: v.panX + (w - prev.w) / 2, panY: v.panY + (h - prev.h) / 2 } })
      }
      schedule()
    })
    ro.observe(wrap)
    schedule()
    return () => {
      unsub()
      clearInterval(ants)
      ro.disconnect()
      cancelAnimationFrame(raf)
      setRenderer(null)
      r.dispose()
    }
  }, [])

  /** Live painting changes GPU textures without touching the store: ask for a redraw. */
  const redraw = () => (window as unknown as { __esRender?: () => void }).__esRender?.()

  /* ---------------- wheel zoom (non-passive) ---------------- */
  useEffect(() => {
    const wrap = wrapRef.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = wrap.getBoundingClientRect()
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      zoomTo(get().view.zoom * Math.exp(-dy * 0.0016), e.clientX - rect.left, e.clientY - rect.top)
    }
    wrap.addEventListener('wheel', onWheel, { passive: false })
    return () => wrap.removeEventListener('wheel', onWheel)
  }, [])

  /* ---------------- space = temporary hand ---------------- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (e.code === 'Space' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault()
        setSpace(true)
      }
    }
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const local = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = wrapRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const pressureOf = (e: PointerEvent | React.PointerEvent) => (e.pointerType === 'pen' ? 0.15 + 0.85 * (e.pressure || 0.5) : 1)

  /* ---------------- pointer interactions ---------------- */
  const onPointerDown = (e: React.PointerEvent) => {
    const s = get()
    const doc = s.hist?.present.state
    if (!doc) return
    const sp = local(e)
    const m = toDoc(s.view, sp)
    wrapRef.current!.setPointerCapture(e.pointerId)

    if (e.button === 1 || space || s.tool === 'hand') {
      drag.current = { kind: 'pan', sx: sp.x, sy: sp.y, panX: s.view.panX, panY: s.view.panY }
      setCursor('grabbing')
      return
    }
    if (e.button !== 0) return
    // While an AI preview is waiting for "Apply", the picture can only be looked at.
    if (s.assistantOpen && s.gestureBase) return

    switch (s.tool) {
      case 'crop': {
        if (!s.crop) return
        const h = hitHandle(cropHandles(s.crop, s.view), sp, 10)
        if (h) drag.current = { kind: 'crop-resize', hx: h.hx, hy: h.hy, r0: { ...s.crop } }
        else if (m.x >= s.crop.x && m.y >= s.crop.y && m.x <= s.crop.x + s.crop.w && m.y <= s.crop.y + s.crop.h)
          drag.current = { kind: 'crop-move', m0: m, r0: { ...s.crop } }
        else drag.current = { kind: 'crop-new', m0: m }
        return
      }
      case 'brush':
      case 'eraser':
      case 'clone': {
        if (e.altKey) {
          if (s.tool === 'clone') paint.setCloneSource(m)
          else paint.pickColor(m)
          return
        }
        if (paint.beginStroke(s.tool, m, pressureOf(e), e.shiftKey)) {
          drag.current = { kind: 'paint' }
          redraw()
        }
        return
      }
      case 'magic':
        drag.current = { kind: 'erase', pts: [m] }
        setDraft({ kind: 'erase', pts: [m], size: s.settings.magicSize })
        return
      case 'fill':
        if (s.settings.fillKind === 'bucket') paint.bucketFill(m)
        else if (paint.beginGradient(m)) {
          drag.current = { kind: 'gradient', m0: m }
          setDraft({ kind: 'line', a: m, b: m })
        }
        return
      case 'eyedropper':
        paint.pickColor(m)
        drag.current = { kind: 'pick' }
        return
      case 'select': {
        const op = selOpFrom(e)
        if (s.settings.selectShape === 'wand') {
          A.magicWand(m, op)
          return
        }
        if (s.settings.selectShape === 'object') {
          void AI.selectObjectAt(m, op)
          return
        }
        drag.current = { kind: 'sel', m0: m, op, pts: [m] }
        return
      }
      case 'shape':
        drag.current = { kind: 'shape', m0: m }
        return
      case 'text': {
        const id = topLayerAt(doc, m)
        const l = id ? doc.layers.find((x) => x.id === id) : undefined
        if (l?.type === 'text') {
          A.selectLayer(l.id)
          set({ panel: 'props', focusText: l.id })
        } else A.addText(m)
        return
      }
      case 'move': {
        const act = activeLayer(doc)
        if (act && act.visible) {
          const h = hitHandle(layerHandles(act, s.view), sp, 10)
          if (h) {
            beginGesture()
            drag.current =
              h.kind === 'rotate'
                ? { kind: 'rotate', id: act.id, m0: m, t0: act.transform }
                : { kind: 'scale', id: act.id, hx: h.hx, hy: h.hy, t0: act.transform, w: act.width, h: act.height }
            return
          }
        }
        // Prefer the active layer if the click is inside it, otherwise the topmost layer under the cursor.
        const id = act && act.visible && layerContains(act.transform, act.width, act.height, m) ? act.id : topLayerAt(doc, m)
        if (id) {
          A.selectLayer(id)
          const l = getDoc()!.layers.find((x) => x.id === id)!
          beginGesture()
          drag.current = { kind: 'move', id, m0: m, t0: l.transform }
          setCursor('move')
        }
      }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const s = get()
    const doc = s.hist?.present.state
    if (!doc) return
    const sp = local(e)
    const m = toDoc(s.view, sp)
    const d = drag.current
    setPointer(sp)

    if (!d) return updateHover(sp, m, doc)

    switch (d.kind) {
      case 'pan':
        set({ view: { ...s.view, panX: d.panX + sp.x - d.sx, panY: d.panY + sp.y - d.sy } })
        break
      case 'paint': {
        // Use every intermediate mouse/pen position for smooth strokes.
        const events = e.nativeEvent.getCoalescedEvents?.() ?? []
        const list = events.length ? events : [e.nativeEvent]
        for (const ev of list) paint.continueStroke(toDoc(s.view, local(ev)), pressureOf(ev))
        redraw()
        break
      }
      case 'gradient':
        paint.updateGradient(m)
        setDraft({ kind: 'line', a: d.m0, b: m })
        redraw()
        break
      case 'pick':
        paint.pickColor(m)
        break
      case 'erase': {
        const last = d.pts[d.pts.length - 1]
        if (Math.hypot(last.x - m.x, last.y - m.y) * s.view.zoom > 2) {
          d.pts.push(m)
          setDraft({ kind: 'erase', pts: [...d.pts], size: s.settings.magicSize })
        }
        break
      }
      case 'sel':
        if (s.settings.selectShape === 'lasso') {
          const last = d.pts[d.pts.length - 1]
          if (Math.hypot(last.x - m.x, last.y - m.y) * s.view.zoom > 2) d.pts.push(m)
          setDraft({ kind: 'lasso', pts: [...d.pts] })
        } else setDraft({ kind: s.settings.selectShape === 'ellipse' ? 'ellipse' : 'rect', ...boxFrom(d.m0, m, e.shiftKey && d.op !== 'add') })
        break
      case 'shape': {
        const k = s.settings.shapeKind
        if (k === 'line' || k === 'arrow') setDraft({ kind: 'line', a: d.m0, b: m })
        else setDraft({ kind: k === 'ellipse' ? 'ellipse' : 'rect', ...boxFrom(d.m0, m, e.shiftKey) })
        break
      }
      case 'move': {
        const moved = { ...d.t0, cx: d.t0.cx + m.x - d.m0.x, cy: d.t0.cy + m.y - d.m0.y }
        const l = doc.layers.find((x) => x.id === d.id)!
        const snapped = e.ctrlKey ? { t: moved, guides: {} } : snapMove(moved, l.width, l.height, doc.width, doc.height, 7 / s.view.zoom)
        setGuides(snapped.guides)
        live(t('history.move'), (dd) => updateLayer(dd, d.id, { transform: snapped.t }))
        break
      }
      case 'scale': {
        const tr = scaleFromHandle(d.t0, d.w, d.h, d.hx, d.hy, m, e.shiftKey)
        live(t('history.scale'), (dd) => updateLayer(dd, d.id, { transform: tr }))
        break
      }
      case 'rotate': {
        const tr = rotateAround(d.t0, d.m0, m, e.shiftKey)
        live(t('history.rotate'), (dd) => updateLayer(dd, d.id, { transform: tr }))
        break
      }
      case 'crop-move':
        set({ crop: { ...s.crop!, ...moveCrop(d.r0, m.x - d.m0.x, m.y - d.m0.y, doc.width, doc.height) } })
        break
      case 'crop-resize': {
        const ratio = s.crop!.ratioId === 'free' ? 0 : d.r0.w / d.r0.h
        set({ crop: { ...s.crop!, ...resizeCrop(d.r0, d.hx, d.hy, m, ratio, doc.width, doc.height) } })
        break
      }
      case 'crop-new': {
        if (Math.hypot(m.x - d.m0.x, m.y - d.m0.y) * s.view.zoom < 4) break
        const ratio = s.crop!.ratioId === 'free' ? 0 : s.crop!.w / s.crop!.h
        set({ crop: { ...s.crop!, ...drawCrop(d.m0, m, ratio, doc.width, doc.height) } })
        break
      }
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    wrapRef.current?.releasePointerCapture(e.pointerId)
    setGuides({})
    setDraft(null)
    if (!d) return
    const s = get()
    const m = toDoc(s.view, local(e))
    switch (d.kind) {
      case 'move':
        endGesture(t('history.move'))
        break
      case 'scale':
        // Text and shapes: turn the stretch into a real font size / box size (stays crisp).
        live(t('history.scale'), (dd) => A.bakeScale(dd, d.id))
        endGesture(t('history.scale'))
        break
      case 'rotate':
        endGesture(t('history.rotate'))
        break
      case 'paint':
        paint.endStroke()
        break
      case 'erase':
        void AI.eraseObject(d.pts, s.settings.magicSize)
        break
      case 'gradient':
        paint.endGradient()
        break
      case 'sel': {
        const tiny = Math.hypot(m.x - d.m0.x, m.y - d.m0.y) * s.view.zoom < 3
        if (tiny && d.op === 'replace') A.deselect()
        else if (!tiny) {
          if (s.settings.selectShape === 'lasso') {
            if (d.pts.length > 2) A.selectShape({ kind: 'lasso', pts: d.pts }, d.op)
          } else {
            const b = boxFrom(d.m0, m, e.shiftKey && d.op !== 'add')
            A.selectShape({ kind: s.settings.selectShape === 'ellipse' ? 'ellipse' : 'rect', ...b }, d.op)
          }
        }
        break
      }
      case 'shape':
        A.addShape(s.settings.shapeKind, d.m0, m, e.shiftKey)
        set({ tool: 'move' })
        break
    }
    const doc = getDoc()
    if (doc) updateHover(local(e), m, doc)
  }

  const updateHover = (sp: Vec2, m: Vec2, doc: PhotoDoc) => {
    const s = get()
    if (space || s.tool === 'hand') {
      setHover(null)
      return setCursor('grab')
    }
    if (BRUSH_TOOLS.has(s.tool)) return setCursor('none')
    if (s.tool === 'crop' && s.crop) {
      const h = hitHandle(cropHandles(s.crop, s.view), sp, 10)
      const c = toScreen(s.view, { x: s.crop.x + s.crop.w / 2, y: s.crop.y + s.crop.h / 2 })
      const inside = m.x >= s.crop.x && m.y >= s.crop.y && m.x <= s.crop.x + s.crop.w && m.y <= s.crop.y + s.crop.h
      return setCursor(h ? resizeCursor(c, h.pos) : inside ? 'move' : 'crosshair')
    }
    if (s.tool === 'text') return setCursor('text')
    if (s.tool === 'select' || s.tool === 'shape' || s.tool === 'fill' || s.tool === 'eyedropper') return setCursor('crosshair')
    if (s.tool === 'move') {
      const act = activeLayer(doc)
      if (act && act.visible) {
        const h = hitHandle(layerHandles(act, s.view), sp, 10)
        if (h) {
          setHover(null)
          const c = toScreen(s.view, layerToDoc(act.transform, act.width, act.height, { x: act.width / 2, y: act.height / 2 }))
          return setCursor(h.kind === 'rotate' ? 'alias' : resizeCursor(c, h.pos))
        }
      }
      const id = topLayerAt(doc, m)
      setHover(id && id !== act?.id ? id : null)
      return setCursor(id ? 'move' : 'default')
    }
    setCursor('default')
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    const s = get()
    if (s.tool === 'crop') return A.applyCrop()
    const doc = getDoc()
    if (s.tool !== 'move' || !doc) return
    const id = topLayerAt(doc, toDoc(s.view, local(e)))
    const l = id ? doc.layers.find((x) => x.id === id) : undefined
    if (l && (l.type === 'text' || l.type === 'shape')) {
      A.selectLayer(l.id)
      set({ panel: 'props', focusText: l.type === 'text' ? l.id : null })
    }
  }

  const effCursor = space ? (drag.current?.kind === 'pan' ? 'grabbing' : 'grab') : tool === 'hand' && !drag.current ? 'grab' : cursor

  return (
    <div
      ref={wrapRef}
      className="canvas-wrap"
      style={{ cursor: effCursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => {
        if (!drag.current) {
          setHover(null)
          setPointer(null)
        }
      }}
      onDoubleClick={onDoubleClick}
    >
      <canvas ref={canvasRef} className="canvas" />
      <Overlay guides={guides} hover={hover} pointer={space ? null : pointer} draft={draft} />
      {error && <div className="canvas-error">{error}</div>}
    </div>
  )
}

/** Rectangle from two corners (optionally a square). */
function boxFrom(a: Vec2, b: Vec2, square: boolean) {
  let w = b.x - a.x
  let h = b.y - a.y
  if (square) {
    const s = Math.max(Math.abs(w), Math.abs(h))
    w = Math.sign(w || 1) * s
    h = Math.sign(h || 1) * s
  }
  return { x: Math.min(a.x, a.x + w), y: Math.min(a.y, a.y + h), w: Math.abs(w), h: Math.abs(h) }
}
