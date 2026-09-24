import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { LayerTransform } from '@easystudio/core'
import * as E from '../state/editor'
import * as P from '../state/project'
import { useVideo } from '../state/store'

/**
 * Frame for the selected clip on top of the player: drag inside to move it, drag a corner to
 * make it bigger or smaller, drag the round handle to turn it. The centre snaps to the middle.
 */
export function PlayerOverlay({ width, height }: { width: number; height: number }) {
  const { t } = useTranslation()
  const project = E.useProject()
  const clipId = E.useEditor((s) => s.selectedClip)
  const mode = E.useEditor((s) => s.playerMode)
  const time = useVideo((s) => s.time)
  const playing = useVideo((s) => s.playing)
  const media = useVideo((s) => s.media)
  const drag = useRef<{ kind: 'move' | 'scale' | 'rotate'; x0: number; y0: number; tr0: LayerTransform } | null>(null)

  const found = clipId && mode === 'timeline' && !playing ? P.findClip(project, clipId) : null
  if (!found || found.track.kind === 'audio') return null
  const c = found.clip
  if (time < c.start - 1e-6 || time >= P.clipEnd(c)) return null
  const m = media.find((x) => x.id === c.mediaId)
  let bw: number
  let bh: number
  if (c.text) {
    const tt = E.titleOf(c.text)
    bw = tt.w
    bh = tt.h
  } else if (m?.hasVideo) {
    bw = m.width
    bh = m.height
  } else return null

  const W = project.width
  const H = project.height
  const zoom = Math.min(width / W, height / H)
  const panX = (width - W * zoom) / 2
  const panY = (height - H * zoom) / 2
  const tr = c.transform ?? E.defaultTransform(c, project)
  const toScreen = (x: number, y: number) => [panX + x * zoom, panY + y * zoom] as const
  const a = (tr.rot * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const hw = (bw * Math.abs(tr.sx)) / 2
  const hh = (bh * Math.abs(tr.sy)) / 2
  const corner = (sx: number, sy: number) => toScreen(tr.cx + sx * hw * cos - sy * hh * sin, tr.cy + sx * hw * sin + sy * hh * cos)
  const corners = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]
  const [cxS, cyS] = toScreen(tr.cx, tr.cy)
  const rotHandle = toScreen(tr.cx + (hh + 34 / zoom) * sin, tr.cy - (hh + 34 / zoom) * cos)
  const topMid = corner(0, -1)

  const start = (kind: 'move' | 'scale' | 'rotate') => (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    E.beginGesture()
    drag.current = { kind, x0: e.clientX, y0: e.clientY, tr0: tr }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const box = (e.currentTarget as Element).closest('.player-overlay')!.getBoundingClientRect()
    const px = e.clientX - box.left
    const py = e.clientY - box.top
    let next: LayerTransform
    if (d.kind === 'move') {
      let cx = d.tr0.cx + (e.clientX - d.x0) / zoom
      let cy = d.tr0.cy + (e.clientY - d.y0) / zoom
      if (Math.abs(cx - W / 2) * zoom < 8) cx = W / 2
      if (Math.abs(cy - H / 2) * zoom < 8) cy = H / 2
      next = { ...d.tr0, cx, cy }
    } else if (d.kind === 'scale') {
      const [c0x, c0y] = toScreen(d.tr0.cx, d.tr0.cy)
      const r0 = Math.hypot(d.x0 - box.left - c0x, d.y0 - box.top - c0y)
      const r1 = Math.hypot(px - c0x, py - c0y)
      const k = Math.max(0.02, r1 / Math.max(1, r0))
      next = { ...d.tr0, sx: d.tr0.sx * k, sy: d.tr0.sy * k }
    } else {
      const [c0x, c0y] = toScreen(d.tr0.cx, d.tr0.cy)
      let deg = (Math.atan2(py - c0y, px - c0x) * 180) / Math.PI + 90
      if (deg > 180) deg -= 360
      // Snap to straight angles.
      for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(deg - s) < 4) deg = s
      next = { ...d.tr0, rot: Math.round(deg) }
    }
    E.updateClipLive(c.id, { transform: next })
  }
  const end = () => {
    const d = drag.current
    drag.current = null
    if (d) E.endGesture(t(d.kind === 'move' ? 'hist.moveInFrame' : d.kind === 'scale' ? 'hist.zoom' : 'hist.rotate'))
  }

  const pts = corners.map(([x, y]) => `${x},${y}`).join(' ')
  return (
    <svg className="player-overlay" width={width} height={height} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <polygon points={pts} className="po-box" onPointerDown={start('move')} />
      <line x1={topMid[0]} y1={topMid[1]} x2={rotHandle[0]} y2={rotHandle[1]} className="po-line" />
      <circle cx={rotHandle[0]} cy={rotHandle[1]} r={7} className="po-rot" onPointerDown={start('rotate')} />
      {corners.map(([x, y], i) => (
        <rect key={i} x={x - 6} y={y - 6} width={12} height={12} className="po-handle" onPointerDown={start('scale')} />
      ))}
      <circle cx={cxS} cy={cyS} r={3} className="po-center" />
    </svg>
  )
}
