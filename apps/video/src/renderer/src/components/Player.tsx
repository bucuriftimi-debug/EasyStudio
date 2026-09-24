import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ListPlus, Pause, Play, SkipBack, SkipForward, StepBack, StepForward } from 'lucide-react'
import { Button } from '@easystudio/ui'
import { engine } from '../engine/engine'
import { useVideo } from '../state/store'
import * as E from '../state/editor'
import { PlayerOverlay } from './PlayerOverlay'
import { formatTime } from '../util/time'

/** The preview: the GPU canvas plus play / pause, time and a scrub bar. */
export function Player() {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const time = useVideo((s) => s.time)
  const playing = useVideo((s) => s.playing)
  const mode = E.useEditor((s) => s.playerMode)
  const preview = useVideo((s) => (mode === 'media' ? s.media.find((m) => m.id === s.selectedMedia) : undefined))
  const hasContent = E.useEditor((s) => s.hist.present.state.tracks.some((tr) => tr.clips.length))
  const duration = engine.duration

  useEffect(() => {
    const canvas = canvasRef.current!
    try {
      engine.attach(canvas)
    } catch (e) {
      console.error(e)
    }
    const ro = new ResizeObserver(() => {
      const r = boxRef.current!.getBoundingClientRect()
      engine.resize(r.width * devicePixelRatio, r.height * devicePixelRatio)
      setSize({ w: r.width, h: r.height })
    })
    ro.observe(boxRef.current!)
    const off = engine.onChange((tm, pl) => useVideo.setState({ time: tm, playing: pl }))
    return () => {
      ro.disconnect()
      off()
      engine.detach()
    }
  }, [])

  return (
    <section className="player">
      {preview && (
        <div className="player-mode">
          <span>{t('player.previewing', { name: preview.name })}</span>
          <div className="spacer" />
          <Button size="sm" variant="primary" onClick={() => E.addToTimeline(preview.id)}>
            <ListPlus size={14} /> {t('lib.add')}
          </Button>
          <Button size="sm" onClick={() => E.showTimeline()}>
            <ArrowLeft size={14} /> {t('player.backToProject')}
          </Button>
        </div>
      )}
      <div className="player-view" ref={boxRef}>
        <canvas ref={canvasRef} className="player-canvas" onClick={() => engine.toggle()} />
        {size.w > 0 && <PlayerOverlay width={size.w} height={size.h} />}
        {mode === 'timeline' && !hasContent && <div className="player-empty">{t('player.empty')}</div>}
      </div>
      <div className="player-bar">
        <input
          className="scrub"
          type="range"
          min={0}
          max={Math.max(0.001, duration)}
          step={0.001}
          value={Math.min(time, duration)}
          disabled={!duration}
          onChange={(e) => engine.seek(Number(e.target.value))}
          aria-label={t('player.position')}
        />
        <div className="player-controls">
          <span className="timecode">
            {formatTime(time)} <i>/ {formatTime(duration)}</i>
          </span>
          <div className="spacer" />
          <Button icon variant="ghost" tip={t('player.start')} disabled={!duration} onClick={() => engine.seek(0)}>
            <SkipBack size={16} />
          </Button>
          <Button icon variant="ghost" tip={t('player.prevFrame')} disabled={!duration} onClick={() => engine.step(-1)}>
            <StepBack size={16} />
          </Button>
          <Button icon variant="primary" className="play-btn" tip={playing ? t('player.pause') : t('player.play')} disabled={!duration} onClick={() => engine.toggle()}>
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </Button>
          <Button icon variant="ghost" tip={t('player.nextFrame')} disabled={!duration} onClick={() => engine.step(1)}>
            <StepForward size={16} />
          </Button>
          <Button icon variant="ghost" tip={t('player.end')} disabled={!duration} onClick={() => engine.seek(duration)}>
            <SkipForward size={16} />
          </Button>
        </div>
      </div>
    </section>
  )
}
