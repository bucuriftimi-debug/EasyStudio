import { useTranslation } from 'react-i18next'
import { layerCorners, type Vec2 } from '@easystudio/core'
import { activeLayer } from '../state/docOps'
import { getCloneSource } from '../state/paint'
import { useDoc, useEditor } from '../state/store'
import type { Layer, View } from '../state/types'
import { cropHandles, layerHandles, toScreen, type Guides } from './interact'

export type Draft =
  | { kind: 'rect' | 'ellipse'; x: number; y: number; w: number; h: number }
  | { kind: 'lasso'; pts: Vec2[] }
  | { kind: 'line'; a: Vec2; b: Vec2 }
  | { kind: 'erase'; pts: Vec2[]; size: number }

const poly = (l: Layer, v: View) =>
  layerCorners(l.transform, l.width, l.height)
    .map((p) => toScreen(v, p))
    .map((p) => `${p.x},${p.y}`)
    .join(' ')

/** Everything drawn on top of the picture: selection box, handles, guides, crop frame, brush cursor. */
export function Overlay({ guides, hover, pointer, draft }: { guides: Guides; hover: string | null; pointer: Vec2 | null; draft: Draft | null }) {
  const { t } = useTranslation()
  const doc = useDoc()
  const view = useEditor((s) => s.view)
  const vp = useEditor((s) => s.viewport)
  const tool = useEditor((s) => s.tool)
  const crop = useEditor((s) => s.crop)
  const compare = useEditor((s) => s.compare)
  const settings = useEditor((s) => s.settings)
  const editMask = useEditor((s) => s.editMask)
  if (!doc) return null
  const act = activeLayer(doc)
  const hoverLayer = hover ? doc.layers.find((l) => l.id === hover) : undefined
  const handles = tool === 'move' && act && act.visible && !compare ? layerHandles(act, view) : []
  const topMid = handles.find((x) => x.kind === 'scale' && x.hx === 0 && x.hy === -1)

  const brushSize =
    tool === 'brush'
      ? settings.brushSize
      : tool === 'eraser'
        ? settings.eraserSize
        : tool === 'clone'
          ? settings.cloneSize
          : tool === 'magic'
            ? settings.magicSize
            : 0
  const clone = tool === 'clone' ? getCloneSource() : null

  return (
    <>
      <svg className="overlay" width={vp.w} height={vp.h}>
        {tool === 'move' && hoverLayer && <polygon points={poly(hoverLayer, view)} className="ov-hover" />}

        {handles.length > 0 && act && (
          <g>
            <polygon points={poly(act, view)} className="ov-box" />
            {handles.map((h, i) =>
              h.kind === 'rotate' ? (
                <g key={i}>
                  {topMid && <line x1={h.pos.x} y1={h.pos.y} x2={topMid.pos.x} y2={topMid.pos.y} className="ov-stem" />}
                  <circle cx={h.pos.x} cy={h.pos.y} r={6} className="ov-rotate" />
                </g>
              ) : (
                <rect key={i} x={h.pos.x - 4.5} y={h.pos.y - 4.5} width={9} height={9} rx={2} className="ov-handle" />
              )
            )}
          </g>
        )}

        {guides.x !== undefined && (
          <line x1={toScreen(view, { x: guides.x, y: 0 }).x} x2={toScreen(view, { x: guides.x, y: 0 }).x} y1={0} y2={vp.h} className="ov-guide" />
        )}
        {guides.y !== undefined && (
          <line y1={toScreen(view, { x: 0, y: guides.y }).y} y2={toScreen(view, { x: 0, y: guides.y }).y} x1={0} x2={vp.w} className="ov-guide" />
        )}

        {tool === 'crop' && crop && <CropFrame crop={crop} view={view} vw={vp.w} vh={vp.h} />}

        {draft && <DraftShape draft={draft} view={view} />}

        {clone && <Crosshair p={toScreen(view, clone)} />}

        {pointer && brushSize > 0 && (
          <g className="ov-brush">
            <circle cx={pointer.x} cy={pointer.y} r={Math.max(1, (brushSize / 2) * view.zoom)} className="ov-brush-outer" />
            <circle cx={pointer.x} cy={pointer.y} r={Math.max(1, (brushSize / 2) * view.zoom)} className="ov-brush-inner" />
            <circle cx={pointer.x} cy={pointer.y} r={1.2} className="ov-brush-dot" />
          </g>
        )}
      </svg>
      {compare && <div className="compare-badge">{t('status.before')}</div>}
      {editMask && act?.mask && !compare && <div className="compare-badge mask-badge">{t('layers.editingMask')}</div>}
    </>
  )
}

function Crosshair({ p }: { p: Vec2 }) {
  return (
    <g className="ov-cross">
      <circle cx={p.x} cy={p.y} r={7} />
      <line x1={p.x - 11} x2={p.x + 11} y1={p.y} y2={p.y} />
      <line y1={p.y - 11} y2={p.y + 11} x1={p.x} x2={p.x} />
    </g>
  )
}

function DraftShape({ draft, view }: { draft: Draft; view: View }) {
  if (draft.kind === 'erase') {
    const d = draft.pts.map((p, i) => {
      const s = toScreen(view, p)
      return `${i ? 'L' : 'M'}${s.x},${s.y}`
    })
    if (draft.pts.length === 1) {
      const s = toScreen(view, draft.pts[0])
      d.push(`L${s.x + 0.01},${s.y}`)
    }
    return <path className="ov-erase" d={d.join(' ')} strokeWidth={Math.max(2, draft.size * view.zoom)} />
  }
  if (draft.kind === 'line') {
    const a = toScreen(view, draft.a)
    const b = toScreen(view, draft.b)
    return (
      <g className="ov-draft">
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        <circle cx={a.x} cy={a.y} r={4} />
        <circle cx={b.x} cy={b.y} r={4} />
      </g>
    )
  }
  if (draft.kind === 'lasso') {
    const d = draft.pts.map((p, i) => {
      const s = toScreen(view, p)
      return `${i ? 'L' : 'M'}${s.x},${s.y}`
    })
    return <path className="ov-draft" d={d.join(' ')} />
  }
  const a = toScreen(view, { x: draft.x, y: draft.y })
  const w = draft.w * view.zoom
  const h = draft.h * view.zoom
  return draft.kind === 'ellipse' ? (
    <ellipse className="ov-draft" cx={a.x + w / 2} cy={a.y + h / 2} rx={w / 2} ry={h / 2} />
  ) : (
    <rect className="ov-draft" x={a.x} y={a.y} width={w} height={h} />
  )
}

function CropFrame({ crop, view, vw, vh }: { crop: { x: number; y: number; w: number; h: number }; view: View; vw: number; vh: number }) {
  const a = toScreen(view, { x: crop.x, y: crop.y })
  const b = toScreen(view, { x: crop.x + crop.w, y: crop.y + crop.h })
  const w = b.x - a.x
  const h = b.y - a.y
  return (
    <g>
      <path d={`M0,0H${vw}V${vh}H0Z M${a.x},${a.y}V${b.y}H${b.x}V${a.y}Z`} className="ov-crop-mask" fillRule="evenodd" />
      {[1, 2].map((i) => (
        <g key={i} className="ov-thirds">
          <line x1={a.x + (w * i) / 3} x2={a.x + (w * i) / 3} y1={a.y} y2={b.y} />
          <line y1={a.y + (h * i) / 3} y2={a.y + (h * i) / 3} x1={a.x} x2={b.x} />
        </g>
      ))}
      <rect x={a.x} y={a.y} width={w} height={h} className="ov-crop-box" />
      {cropHandles(crop, view).map((hd, i) =>
        hd.hx && hd.hy ? (
          <path
            key={i}
            className="ov-crop-corner"
            d={`M${hd.pos.x},${hd.pos.y + -hd.hy * 16}V${hd.pos.y}H${hd.pos.x + -hd.hx * 16}`}
            transform={`translate(${hd.hx * 1.5},${hd.hy * 1.5})`}
          />
        ) : (
          <rect key={i} x={hd.pos.x - (hd.hx ? 2.5 : 10)} y={hd.pos.y - (hd.hy ? 2.5 : 10)} width={hd.hx ? 5 : 20} height={hd.hy ? 5 : 20} rx={2} className="ov-crop-edge" />
        )
      )}
    </g>
  )
}
