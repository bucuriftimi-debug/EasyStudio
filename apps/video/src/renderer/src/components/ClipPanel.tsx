import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, RotateCcw, Scissors, ChevronLeft, ChevronRight, Diamond, UserRound } from 'lucide-react'
import { Button, ColorButton, Slider } from '@easystudio/ui'
import { ADJUSTMENTS, LOOKS, type AdjustKey } from '@easystudio/gpu'
import { STYLE_PRESETS, type TextStyle } from '@easystudio/draw'
import { BUNDLED_FONTS } from '@easystudio/draw/fonts'
import { fitTransform } from '../engine/engine'
import type { MediaInfo } from '../media/media'
import * as E from '../state/editor'
import * as P from '../state/project'
import { formatTime } from '../util/time'
import { PausesDialog } from './PausesDialog'
import { canUseFree, ProBadge, spendFreeUse } from '@easystudio/license'
import { removeVideoBackground, restoreVideoBackground } from '../state/bgRemoval'
import { useVideo } from '../state/store'
import { ANIM_KINDS, keyAt, type AnimKind, type ClipAnim } from '../state/motion'

function Section({ title, children, open: initial = true }: { title: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial)
  return (
    <section className={`insp-sec${open ? ' open' : ''}`}>
      <button type="button" className="insp-sec-head" onClick={() => setOpen(!open)}>
        <strong>{title}</strong>
        <ChevronDown size={14} />
      </button>
      {open && <div className="insp-sec-body">{children}</div>}
    </section>
  )
}

const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 4]
const TRANSITIONS: (P.TransitionKind | 'none')[] = ['none', 'dissolve', 'black', 'slide', 'zoom']

/** Properties of the selected clip. Every control is undoable; sliders record one step per drag. */
export function ClipPanel({ clip, track, media, index }: { clip: P.Clip; track: P.Track; media: MediaInfo | undefined; index: number }) {
  const { t } = useTranslation()
  const project = E.useProject()
  const id = clip.id
  const isTitle = !!clip.text
  const visual = track.kind !== 'audio' && (isTitle || !!media?.hasVideo)
  const hasSound = !!media?.hasAudio
  const timed = !isTitle && media?.kind !== 'image'
  const base = E.defaultTransform(clip, project)
  const time = useVideo((s) => s.time)
  // With keyframes the controls show (and change) the place at the playhead.
  const now = E.clipMotion(clip, project, time)
  const tr = now.tr
  const keys = clip.keys ?? []
  const inClip = time >= clip.start - 1e-6 && time < P.clipEnd(clip)
  const keyHere = keyAt(keys, Math.round((time - clip.start) * project.fps) / project.fps)
  const anim: ClipAnim = clip.anim ?? { in: null, out: null, dur: 0.6 }
  const setAnim = (patch: Partial<ClipAnim>) => E.updateClip(id, t('hist.anim'), { anim: { ...anim, ...patch } })

  /** Slider helpers: live while dragging, one undo step at the end. */
  const slider = (label: string, get: () => number, apply: (v: number) => Partial<P.Clip>) => ({
    value: get(),
    onStart: E.beginGesture,
    onChange: (v: number) => E.updateClipLive(id, apply(v)),
    onCommit: () => E.endGesture(label)
  })

  const [pausesOpen, setPausesOpen] = useState(false)

  const zoomPct = Math.round((tr.sx / (isTitle ? 1 : base.sx)) * 100)
  const setZoom = (pct: number): Partial<P.Clip> => {
    const k = (pct / 100) * (isTitle ? 1 : base.sx)
    return { transform: { ...tr, sx: k, sy: k * Math.sign(tr.sy || 1) } }
  }

  const text = clip.text
  const setText = (patch: Partial<TextStyle>) => E.updateClip(id, t('hist.text'), { text: { ...text!, ...patch } })
  const textLive = (patch: Partial<TextStyle>) => E.updateClipLive(id, { text: { ...text!, ...patch } })

  return (
    <div className="clip-panel">
      <div className="clip-head">
        <strong>{isTitle ? t('insp.title_clip') : (media?.name ?? '—')}</strong>
        <span>
          {t(`tl.track_${track.kind}`)} · {formatTime(clip.start)} · {formatTime(P.clipDur(clip))}
        </span>
      </div>

      {isTitle && text && (
        <Section title={t('insp.text')}>
          <textarea
            className="es-input insp-text"
            value={text.text}
            rows={3}
            onFocus={E.beginGesture}
            onChange={(e) => textLive({ text: e.target.value })}
            onBlur={() => E.endGesture(t('hist.text'))}
          />
          <div className="chip-grid">
            {STYLE_PRESETS.map((s) => (
              <button key={s.id} type="button" className="chip" onClick={() => setText({ ...s.make(text) })} style={{ fontFamily: `"${s.font}"`, fontWeight: s.weight, fontStyle: s.italic ? 'italic' : undefined }}>
                {t(`text.${s.id}`)}
              </button>
            ))}
          </div>
          <label className="es-field">
            <span>{t('insp.font')}</span>
            <select className="es-select" value={text.font} onChange={(e) => setText({ font: e.target.value })}>
              {BUNDLED_FONTS.map((f) => (
                <option key={f.family} value={f.family} style={{ fontFamily: `"${f.family}"` }}>
                  {f.family}
                </option>
              ))}
            </select>
          </label>
          <Slider label={t('insp.textSize')} min={12} max={400} defaultValue={96} {...slider(t('hist.text'), () => text.size, (v) => ({ text: { ...text, size: v } }))} />
          <div className="insp-row">
            <span>{t('insp.color')}</span>
            <div className="spacer" />
            <ColorButton value={text.color} onChange={(hex, final) => (final ? setText({ color: hex, fill: true }) : textLive({ color: hex, fill: true }))} />
          </div>
          <div className="insp-row">
            <span>{t('insp.place')}</span>
            <div className="spacer" />
            {(['top', 'middle', 'bottom'] as const).map((pos) => (
              <Button
                key={pos}
                size="sm"
                variant="ghost"
                onClick={() => E.updateClip(id, t('hist.move'), { transform: { ...tr, cx: project.width / 2, cy: project.height * (pos === 'top' ? 0.15 : pos === 'middle' ? 0.5 : 0.85) } })}
              >
                {t(`insp.pos_${pos}`)}
              </Button>
            ))}
          </div>
        </Section>
      )}

      {visual && (
        <Section title={t('insp.picture')}>
          {!isTitle && media && (
            <div className="insp-row">
              <Button size="sm" onClick={() => E.updateClip(id, t('hist.fit'), { transform: null })}>
                {t('insp.fit')}
              </Button>
              <Button size="sm" onClick={() => E.updateClip(id, t('hist.fit'), { transform: fitTransform(media.width, media.height, project.width, project.height, true) })}>
                {t('insp.fill')}
              </Button>
              <div className="spacer" />
              <Button size="sm" variant="ghost" icon tip={t('insp.reset')} onClick={() => E.updateClip(id, t('hist.fit'), { transform: null, opacity: 1 })}>
                <RotateCcw size={14} />
              </Button>
            </div>
          )}
          {!isTitle && media?.kind === 'video' && (
            <button
              type="button"
              className="subs-cta bg-btn"
              onClick={async () => {
                if (clip.bgMask) return restoreVideoBackground(id)
                if (!canUseFree('bgvideo', 1, t('bg.title'))) return
                if (await removeVideoBackground(id)) spendFreeUse('bgvideo', 1)
              }}
            >
              <UserRound size={16} />
              <span>
                <strong>{clip.bgMask ? t('bg.restore') : t('bg.button')}</strong>
                <small>{clip.bgMask ? t('bg.restoreSub') : t('bg.buttonSub')}</small>
              </span>
            </button>
          )}
          <Slider label={t('insp.zoom')} min={10} max={400} defaultValue={100} unit="%" {...slider(t('hist.zoom'), () => zoomPct, setZoom)} />
          <Slider label={t('insp.rotate')} min={-180} max={180} defaultValue={0} unit="°" {...slider(t('hist.rotate'), () => Math.round(tr.rot), (v) => ({ transform: { ...tr, rot: v } }))} />
          <Slider label={t('insp.opacity')} min={0} max={100} defaultValue={100} unit="%" {...slider(t('hist.opacity'), () => Math.round(now.opacity * 100), (v) => ({ opacity: v / 100 }))} />
          <p className="insp-hint">{t('insp.dragHint')}</p>
        </Section>
      )}

      {visual && (
        <Section title={t('insp.keyframes')}>
          <div className="kf-row">
            <Button size="sm" variant="ghost" icon tip={t('insp.kfPrev')} disabled={!keys.length} onClick={() => E.jumpToKeyframe(id, -1)}>
              <ChevronLeft size={15} />
            </Button>
            <Button size="sm" className={keyHere ? 'kf-on' : ''} disabled={!inClip} onClick={() => (keyHere ? E.removeKeyframe(id) : E.addKeyframe(id))}>
              <Diamond size={13} /> {keyHere ? t('insp.kfRemove') : t('insp.kfAdd')}
            </Button>
            <Button size="sm" variant="ghost" icon tip={t('insp.kfNext')} disabled={!keys.length} onClick={() => E.jumpToKeyframe(id, 1)}>
              <ChevronRight size={15} />
            </Button>
            <ProBadge />
          </div>
          <p className="insp-hint">{keys.length ? t('insp.kfCount', { count: keys.length }) : t('insp.kfHint')}</p>
        </Section>
      )}

      {visual && track.kind !== 'main' && (
        <Section title={t('insp.animation')}>
          {(['in', 'out'] as const).map((side) => (
            <label key={side} className="es-field">
              <span>{t(`insp.anim_${side}`)}</span>
              <select className="es-select" value={anim[side] ?? ''} onChange={(e) => setAnim({ [side]: (e.target.value || null) as AnimKind | null })}>
                <option value="">{t('insp.anim_none')}</option>
                {ANIM_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`insp.anim_${k}`)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {(anim.in || anim.out) && (
            <Slider
              label={t('insp.anim_dur')}
              min={0.2}
              max={2}
              step={0.1}
              defaultValue={0.6}
              unit=" s"
              value={anim.dur}
              onStart={E.beginGesture}
              onChange={(v) => E.updateClipLive(id, { anim: { ...anim, dur: v } })}
              onCommit={() => E.endGesture(t('hist.anim'))}
            />
          )}
        </Section>
      )}

      {timed && (
        <Section title={t('insp.speed')}>
          <div className="chip-row">
            {SPEEDS.map((s) => (
              <button key={s} type="button" className={`chip${clip.speed === s ? ' on' : ''}`} onClick={() => E.updateClip(id, t('hist.speed'), { speed: s })}>
                {s}×
              </button>
            ))}
          </div>
        </Section>
      )}

      {hasSound && (
        <Section title={t('insp.sound')}>
          <Slider label={t('insp.volume')} min={0} max={200} defaultValue={100} unit="%" {...slider(t('hist.volume'), () => Math.round(clip.volume * 100), (v) => ({ volume: v / 100 }))} />
          <Slider label={t('insp.fadeIn')} min={0} max={5} step={0.1} defaultValue={0} unit=" s" {...slider(t('hist.fade'), () => clip.fadeIn, (v) => ({ fadeIn: v }))} />
          <Slider label={t('insp.fadeOut')} min={0} max={5} step={0.1} defaultValue={0} unit=" s" {...slider(t('hist.fade'), () => clip.fadeOut, (v) => ({ fadeOut: v }))} />
          {timed && (
            <button type="button" className="subs-cta pauses-btn" onClick={() => setPausesOpen(true)}>
              <Scissors size={16} />
              <span>
                <strong>{t('pauses.button')}</strong>
                <small>{t('pauses.buttonSub')}</small>
              </span>
            </button>
          )}
          {pausesOpen && <PausesDialog clip={clip} onClose={() => setPausesOpen(false)} />}
        </Section>
      )}

      {track.kind === 'main' && index > 0 && (
        <Section title={t('insp.transition')}>
          <div className="chip-row">
            {TRANSITIONS.map((k) => {
              const on = k === 'none' ? !clip.transition : clip.transition?.kind === k
              return (
                <button key={k} type="button" className={`chip${on ? ' on' : ''}`} onClick={() => E.updateClip(id, t('hist.transition'), { transition: k === 'none' ? null : { kind: k, dur: clip.transition?.dur ?? 0.8 } })}>
                  {t(`insp.tr_${k}`)}
                </button>
              )
            })}
          </div>
          {clip.transition && (
            <Slider
              label={t('insp.trDuration')}
              min={0.2}
              max={3}
              step={0.1}
              defaultValue={0.8}
              unit=" s"
              {...slider(t('hist.transition'), () => clip.transition!.dur, (v) => ({ transition: { ...clip.transition!, dur: v } }))}
            />
          )}
          <p className="insp-hint">{t('insp.trHint')}</p>
        </Section>
      )}

      {visual && !isTitle && (
        <Section title={t('insp.color_sec')} open={false}>
          <div className="chip-grid">
            <button type="button" className={`chip${!clip.look ? ' on' : ''}`} onClick={() => E.updateClip(id, t('hist.look'), { look: null })}>
              {t('look.none')}
            </button>
            {LOOKS.map((l) => (
              <button key={l.id} type="button" className={`chip${clip.look?.id === l.id ? ' on' : ''}`} onClick={() => E.updateClip(id, t('hist.look'), { look: { id: l.id, amount: clip.look?.amount ?? 100 } })}>
                {t(l.label)}
              </button>
            ))}
          </div>
          {clip.look && (
            <Slider label={t('insp.lookAmount')} min={0} max={100} defaultValue={100} unit="%" {...slider(t('hist.look'), () => clip.look!.amount, (v) => ({ look: { ...clip.look!, amount: v } }))} />
          )}
          {ADJUSTMENTS.filter((a) => a.simple).map((a) => (
            <Slider
              key={a.key}
              label={t(`adjust.${a.key}`)}
              min={a.min}
              max={a.max}
              defaultValue={0}
              {...slider(t('hist.adjust'), () => clip.adjust[a.key as AdjustKey] ?? 0, (v) => ({ adjust: { ...clip.adjust, [a.key]: v } }))}
            />
          ))}
          <Button size="sm" variant="ghost" onClick={() => E.updateClip(id, t('hist.adjust'), { adjust: {}, look: null })}>
            <RotateCcw size={14} /> {t('insp.resetColor')}
          </Button>
        </Section>
      )}
    </div>
  )
}
