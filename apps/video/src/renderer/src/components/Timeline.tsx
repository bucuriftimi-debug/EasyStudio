import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Film, Layers, Magnet, Music, Redo2, Scissors, Trash2, Undo2, Volume2, VolumeX, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@easystudio/ui'
import { canRedo, canUndo } from '@easystudio/core'
import { engine } from '../engine/engine'
import type { MediaInfo } from '../media/media'
import { filmStrip, onStripsChanged, waveform } from '../media/strips'
import * as E from '../state/editor'
import * as P from '../state/project'
import { useVideo } from '../state/store'
import { formatTime } from '../util/time'

const RULER_H = 26
const ZONE_H = 20
const ROW_H: Record<P.TrackKind, number> = { main: 64, overlay: 56, audio: 46 }
/** Pointer distance (px) within which edges snap. */
const SNAP_PX = 8
/** Edge grab width (px) for trimming. */
const EDGE_PX = 7
export const MEDIA_DRAG_TYPE = 'application/x-easystudio-media'

interface Row {
  track: P.Track
  top: number
  height: number
}

/** Tracks in screen order: overlays (top first), main, then sound. */
function layoutRows(p: P.Project): { rows: Row[]; height: number } {
  const visual = p.tracks.filter((t) => t.kind !== 'audio').reverse()
  const audio = p.tracks.filter((t) => t.kind === 'audio')
  const rows: Row[] = []
  let y = RULER_H + ZONE_H
  for (const t of [...visual, ...audio]) {
    rows.push({ track: t, top: y + 4, height: ROW_H[t.kind] })
    y += ROW_H[t.kind] + 4
  }
  return { rows, height: y + ZONE_H + 8 }
}

function tickStep(pps: number): number {
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800]
  return steps.find((s) => s * pps >= 70) ?? 3600
}

type Drag =
  | { kind: 'seek' }
  | { kind: 'move'; id: string; x0: number; y0: number; base: P.Project; moved: boolean; grabOffset: number }
  | { kind: 'trim'; id: string; side: 'start' | 'end'; x0: number; base: P.Project }

export function Timeline() {
  const { t } = useTranslation()
  const project = E.useProject()
  const pps = E.useEditor((s) => s.pps)
  const selected = E.useEditor((s) => s.selectedClip)
  const snapping = E.useEditor((s) => s.snapping)
  const hist = E.useEditor((s) => s.hist)
  const time = useVideo((s) => s.time)
  const playing = useVideo((s) => s.playing)
  const mode = E.useEditor((s) => s.playerMode)
  const media = useVideo((s) => s.media)
  const scroller = useRef<HTMLDivElement>(null)
  const heads = useRef<HTMLDivElement>(null)
  const [scroll, setScroll] = useState({ x: 0, w: 1000 })
  const [, setStripTick] = useState(0)
  const [drop, setDrop] = useState<{ row: string | 'overlay-zone' | 'audio-zone'; x: number } | null>(null)
  const drag = useRef<Drag | null>(null)

  const { rows, height } = layoutRows(project)
  const duration = P.projectDuration(project)
  const contentW = Math.max(scroll.w, (duration + 30) * pps)
  const playheadT = mode === 'timeline' ? time : 0

  useEffect(() => onStripsChanged(() => setStripTick((n) => n + 1)), [])

  useLayoutEffect(() => {
    const el = scroller.current!
    const ro = new ResizeObserver(() => setScroll({ x: el.scrollLeft, w: el.clientWidth }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Keep the playhead in view while playing.
  useEffect(() => {
    const el = scroller.current
    if (!el || !playing || mode !== 'timeline') return
    const x = time * pps
    if (x > el.scrollLeft + el.clientWidth - 60 || x < el.scrollLeft) el.scrollLeft = Math.max(0, x - 80)
  }, [time, playing, pps, mode])

  const mediaOf = useCallback((id: string) => media.find((m) => m.id === id), [media])

  /** Pointer x (client) → timeline seconds. */
  const timeAt = (clientX: number) => {
    const el = scroller.current!
    const r = el.getBoundingClientRect()
    return Math.max(0, (clientX - r.left + el.scrollLeft) / pps)
  }
  const rowAt = (clientY: number): Row | null => {
    const el = scroller.current!
    const y = clientY - el.getBoundingClientRect().top + el.scrollTop
    return rows.find((r) => y >= r.top && y < r.top + r.height) ?? null
  }
  const zoneAt = (clientY: number): 'overlay-zone' | 'audio-zone' | null => {
    const el = scroller.current!
    const y = clientY - el.getBoundingClientRect().top + el.scrollTop
    if (y >= RULER_H && y < RULER_H + ZONE_H) return 'overlay-zone'
    const last = rows[rows.length - 1]
    if (last && y >= last.top + last.height) return 'audio-zone'
    return null
  }

  const snapTime = (tm: number, base: P.Project, ignore?: string) => (snapping ? P.snap(tm, P.snapPoints(base, engine.time, ignore), SNAP_PX / pps) : tm)

  /* ---------------- pointer ---------------- */

  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    if (d.kind === 'seek') {
      engine.seek(snapTime(timeAt(e.clientX), E.getProject()))
      return
    }
    const f = P.findClip(d.base, d.id)
    if (!f) return
    const m = mediaOf(f.clip.mediaId)
    const facts = f.clip.text ? P.TEXT_FACTS : m ? E.facts(m) : null
    if (!facts) return
    if (d.kind === 'trim') {
      const edge0 = d.side === 'start' ? f.clip.start : P.clipEnd(f.clip)
      const edge = snapTime(edge0 + (e.clientX - d.x0) / pps, d.base, d.id)
      E.live((p) => P.trimClip(p, d.id, d.side, edge - edge0, facts))
      return
    }
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 4) return
    d.moved = true
    const tm = timeAt(e.clientX) - d.grabOffset
    if (f.track.kind === 'main') {
      const without = P.removeClip(d.base, d.id)
      const index = P.mainIndexAt(without, tm + P.clipDur(f.clip) / 2)
      E.live((p) => P.reorderMain(p, d.id, index))
    } else {
      const len = P.clipDur(f.clip)
      let start = snapTime(tm, d.base, d.id)
      if (start === tm) start = snapTime(tm + len, d.base, d.id) - len
      const row = rowAt(e.clientY)
      const trackId = row && row.track.kind === f.track.kind ? row.track.id : f.track.id
      E.live((p) => {
        const q = P.moveFree(p, d.id, start, trackId)
        return q === p && trackId !== f.track.id ? P.moveFree(p, d.id, start) : q
      })
    }
  }

  const onPointerUp = () => {
    const d = drag.current
    drag.current = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    document.body.classList.remove('tl-dragging')
    if (!d || d.kind === 'seek') return
    if (d.kind === 'trim') E.endGesture(t('hist.trim'))
    else if (d.moved) E.endGesture(t('hist.move'))
    else E.cancelGesture()
  }

  const startDrag = (d: Drag, cursor: string) => {
    drag.current = d
    document.body.classList.add('tl-dragging')
    document.body.style.setProperty('--tl-cursor', cursor)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    E.showTimeline()
    E.selectClip(null)
    engine.pause()
    engine.seek(snapTime(timeAt(e.clientX), E.getProject()))
    startDrag({ kind: 'seek' }, 'ew-resize')
  }

  const onClipDown = (e: React.PointerEvent, c: P.Clip) => {
    if (e.button !== 0) return
    e.stopPropagation()
    E.showTimeline()
    E.selectClip(c.id)
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - box.left
    const base = E.getProject()
    E.beginGesture()
    if (x < EDGE_PX || x > box.width - EDGE_PX) {
      startDrag({ kind: 'trim', id: c.id, side: x < EDGE_PX ? 'start' : 'end', x0: e.clientX, base }, 'ew-resize')
    } else {
      startDrag({ kind: 'move', id: c.id, x0: e.clientX, y0: e.clientY, base, moved: false, grabOffset: timeAt(e.clientX) - c.start }, 'grabbing')
    }
  }

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey) return
    e.preventDefault()
    const el = scroller.current!
    const tAt = timeAt(e.clientX)
    const next = Math.max(4, Math.min(600, pps * (e.deltaY < 0 ? 1.2 : 1 / 1.2)))
    E.setZoom(next)
    requestAnimationFrame(() => {
      el.scrollLeft = Math.max(0, tAt * next - (e.clientX - el.getBoundingClientRect().left))
    })
  }

  /* ---------------- drop from the library ---------------- */

  const dropTarget = (e: React.DragEvent) => {
    const zone = zoneAt(e.clientY)
    const row = rowAt(e.clientY)
    return { zone, row, tm: Math.max(0, timeAt(e.clientX)) }
  }

  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(MEDIA_DRAG_TYPE)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    const { zone, row, tm } = dropTarget(e)
    const mainTrack = P.mainTrack(project)
    let x = tm * pps
    if (row?.track.kind === 'main') {
      const i = P.mainIndexAt(project, tm)
      x = (i < mainTrack.clips.length ? mainTrack.clips[i].start : P.clipEnd(mainTrack.clips[mainTrack.clips.length - 1] ?? { start: 0, in: 0, out: 0, speed: 1 } as P.Clip)) * pps
    }
    setDrop({ row: zone ?? row?.track.id ?? 'overlay-zone', x })
  }

  const onDrop = (e: React.DragEvent) => {
    const id = e.dataTransfer.getData(MEDIA_DRAG_TYPE)
    setDrop(null)
    const m = id && mediaOf(id)
    if (!m) return
    e.preventDefault()
    const { zone, row, tm } = dropTarget(e)
    if (!m.hasVideo) {
      E.addToTimeline(m.id, { kind: 'audio', start: tm, trackId: row?.track.kind === 'audio' ? row.track.id : undefined })
      return
    }
    if (row?.track.kind === 'main' || (!row && !zone)) E.addToTimeline(m.id, { kind: 'main', index: P.mainIndexAt(project, tm) })
    else if (zone === 'overlay-zone' || row?.track.kind === 'overlay') E.addToTimeline(m.id, { kind: 'overlay', start: tm, trackId: row?.track.kind === 'overlay' ? row.track.id : undefined })
    else E.addToTimeline(m.id, { kind: 'main', index: P.mainIndexAt(project, tm) })
  }

  /* ---------------- render ---------------- */

  const step = tickStep(pps)
  const ticks: number[] = []
  for (let s = Math.floor(scroll.x / pps / step) * step; s * pps < scroll.x + scroll.w + 100; s += step) ticks.push(s)
  const emptyMain = !P.mainTrack(project).clips.length

  return (
    <section className="timeline" onWheel={onWheel}>
      <div className="tl-toolbar">
        <Button icon variant="ghost" tip={t('tl.undo')} disabled={!canUndo(hist)} onClick={E.undo}>
          <Undo2 size={16} />
        </Button>
        <Button icon variant="ghost" tip={t('tl.redo')} disabled={!canRedo(hist)} onClick={E.redo}>
          <Redo2 size={16} />
        </Button>
        <div className="divider" />
        <Button size="sm" variant="ghost" tip={t('tl.splitTip')} disabled={!duration} onClick={E.splitAtPlayhead}>
          <Scissors size={15} /> {t('tl.split')}
        </Button>
        <Button size="sm" variant="ghost" tip={t('tl.deleteTip')} disabled={!selected} onClick={E.deleteSelected}>
          <Trash2 size={15} /> {t('tl.delete')}
        </Button>
        <div className="spacer" />
        <span className="tl-time">
          {formatTime(playheadT)} <i>/ {formatTime(duration)}</i>
        </span>
        <div className="spacer" />
        <Button icon variant="ghost" active={snapping} tip={t('tl.snap')} onClick={() => E.useEditor.setState({ snapping: !snapping })}>
          <Magnet size={16} />
        </Button>
        <Button icon variant="ghost" tip={t('tl.zoomOut')} onClick={() => E.setZoom(pps / 1.5)}>
          <ZoomOut size={16} />
        </Button>
        <input
          className="tl-zoom"
          type="range"
          min={Math.log(4)}
          max={Math.log(600)}
          step={0.01}
          value={Math.log(pps)}
          onChange={(e) => E.setZoom(Math.exp(Number(e.target.value)))}
          aria-label={t('tl.zoom')}
        />
        <Button icon variant="ghost" tip={t('tl.zoomIn')} onClick={() => E.setZoom(pps * 1.5)}>
          <ZoomIn size={16} />
        </Button>
        <Button size="sm" variant="ghost" tip={t('tl.fitTip')} disabled={!duration} onClick={() => E.setZoom((scroll.w - 60) / Math.max(1, duration))}>
          {t('tl.fit')}
        </Button>
      </div>

      <div className="tl-body">
        <div className="tl-heads" ref={heads}>
          <div style={{ height }}>
          <div style={{ height: RULER_H + ZONE_H }} />
          {rows.map((r) => (
            <TrackHead key={r.track.id} row={r} />
          ))}
          </div>
        </div>
        <div
          className="tl-scroll"
          ref={scroller}
          onScroll={(e) => {
            setScroll({ x: e.currentTarget.scrollLeft, w: e.currentTarget.clientWidth })
            if (heads.current) heads.current.scrollTop = e.currentTarget.scrollTop
          }}
          onDragOver={onDragOver}
          onDragLeave={() => setDrop(null)}
          onDrop={onDrop}
        >
          <div className="tl-content" style={{ width: contentW, height }} onPointerDown={onBackgroundDown}>
            <div className="tl-ruler" style={{ height: RULER_H }}>
              {ticks.map((s) => (
                <span key={s} className="tl-tick" style={{ left: s * pps }}>
                  {formatTime(s).replace(/\.0$/, '')}
                </span>
              ))}
            </div>
            <div className={`tl-zone top${drop?.row === 'overlay-zone' ? ' on' : ''}`} style={{ top: RULER_H, height: ZONE_H }}>
              {drop && <span>{t('tl.dropOverlay')}</span>}
            </div>
            {rows.map((r) => (
              <div key={r.track.id} className={`tl-row ${r.track.kind}${drop?.row === r.track.id ? ' drop' : ''}`} style={{ top: r.top, height: r.height }}>
                {r.track.kind === 'main' && emptyMain && <span className="tl-hint">{t('tl.emptyMain')}</span>}
                {r.track.clips.map((c) => {
                  const m = mediaOf(c.mediaId)
                  return (
                    <ClipView
                      key={c.id}
                      clip={c}
                      track={r.track}
                      media={m}
                      pps={pps}
                      height={r.height}
                      selected={selected === c.id}
                      view={scroll}
                      onPointerDown={(e) => onClipDown(e, c)}
                    />
                  )
                })}
              </div>
            ))}
            <div className={`tl-zone bottom${drop?.row === 'audio-zone' ? ' on' : ''}`} style={{ top: height - ZONE_H - 8, height: ZONE_H }}>
              <span>{t('tl.dropAudio')}</span>
            </div>
            {drop && drop.row !== 'overlay-zone' && drop.row !== 'audio-zone' && <div className="tl-insert" style={{ left: drop.x }} />}
            {mode === 'timeline' && (
              <div className="tl-playhead" style={{ left: playheadT * pps, height }}>
                <i />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function TrackHead({ row }: { row: Row }) {
  const { t } = useTranslation()
  const tr = row.track
  const Icon = tr.kind === 'audio' ? Music : tr.kind === 'main' ? Film : Layers
  const toggle = (patch: Partial<P.Track>) => E.commit(t('hist.track'), (p) => ({ ...p, tracks: p.tracks.map((x) => (x.id === tr.id ? { ...x, ...patch } : x)) }))
  return (
    <div className={`tl-head ${tr.kind}`} style={{ height: row.height, marginTop: 4 }}>
      <Icon size={14} />
      <span>{t(`tl.track_${tr.kind}`)}</span>
      <div className="spacer" />
      {tr.kind !== 'audio' && (
        <button type="button" className="tl-head-btn" data-tip={tr.hidden ? t('tl.show') : t('tl.hide')} onClick={() => toggle({ hidden: !tr.hidden })}>
          {tr.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      )}
      <button type="button" className="tl-head-btn" data-tip={tr.muted ? t('tl.unmute') : t('tl.mute')} onClick={() => toggle({ muted: !tr.muted })}>
        {tr.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
      </button>
    </div>
  )
}

interface ClipProps {
  clip: P.Clip
  track: P.Track
  media: MediaInfo | undefined
  pps: number
  height: number
  selected: boolean
  view: { x: number; w: number }
  onPointerDown: (e: React.PointerEvent) => void
}

/** One clip: film strip (pictures) or waveform (sound), drawn only where it is visible. */
function ClipView({ clip, track, media, pps, height, selected, view, onPointerDown }: ClipProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const left = clip.start * pps
  const width = Math.max(2, P.clipDur(clip) * pps)
  // Visible part of the clip, in clip pixels (plus a margin so small scrolls need no redraw).
  const v0 = Math.max(0, view.x - left - 200)
  const v1 = Math.min(width, view.x + view.w - left + 200)
  const visW = Math.max(0, v1 - v0)
  const audioOnly = track.kind === 'audio' || (media && !media.hasVideo)
  const title = clip.text

  useEffect(() => {
    const c = canvas.current
    if (!c || !media || title || visW <= 0) return
    const dpr = devicePixelRatio
    c.width = Math.ceil(visW * dpr)
    c.height = Math.ceil((height - 2) * dpr)
    const g = c.getContext('2d')!
    g.scale(dpr, dpr)
    g.clearRect(0, 0, visW, height)
    const h = height - 2
    const src = (x: number) => clip.in + ((v0 + x) / pps) * clip.speed
    if (!audioOnly) {
      const strip = filmStrip(media)
      if (strip) {
        const tileW = (strip.width / strip.height) * h
        const first = Math.floor(v0 / tileW) * tileW - v0
        for (let x = first; x < visW; x += tileW) {
          const s = media.kind === 'image' ? 0 : src(x + tileW / 2)
          const i = media.kind === 'image' ? 0 : Math.min(strip.frames.length - 1, Math.max(0, Math.floor(s / strip.step)))
          const f = strip.frames[i]
          if (f) g.drawImage(f, x, 0, tileW, h)
        }
      }
    }
    if (media.hasAudio && (audioOnly || h > 50)) {
      const wave = waveform(media)
      if (wave) {
        const band = audioOnly ? h - 16 : 16
        const base = h - 2
        g.fillStyle = audioOnly ? 'rgba(180,255,230,0.85)' : 'rgba(255,255,255,0.55)'
        for (let x = 0; x < visW; x++) {
          const a = Math.floor(src(x) * wave.rate)
          const b = Math.max(a + 1, Math.floor(src(x + 1) * wave.rate))
          let peak = 0
          for (let k = a; k < b && k < wave.ready; k++) peak = Math.max(peak, wave.peaks[k])
          const bh = Math.min(1, peak * clip.volume * 1.4) * band
          if (audioOnly) g.fillRect(x, 16 + (band - bh) / 2, 1, Math.max(1, bh))
          else g.fillRect(x, base - bh, 1, Math.max(1, bh))
        }
      }
    }
  })

  const name = title ? title.text.replace(/s+/g, ' ') : (media?.name ?? '?')
  return (
    <div
      className={`tl-clip ${title ? 'title' : audioOnly ? 'audio' : track.kind}${selected ? ' selected' : ''}${media || title ? '' : ' missing'}`}
      style={{ left, width }}
      onPointerDown={onPointerDown}
      title={name}
    >
      <canvas ref={canvas} style={{ left: v0, width: visW, height: height - 2 }} />
      <span className="tl-clip-label">
        {name}
        {clip.speed !== 1 && <b> {clip.speed}×</b>}
      </span>
      <i className="tl-edge l" />
      <i className="tl-edge r" />
    </div>
  )
}
