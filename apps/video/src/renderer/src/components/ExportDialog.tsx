import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Download, FolderOpen, TriangleAlert } from 'lucide-react'
import { Button, Modal, Segmented } from '@easystudio/ui'
import { checkEncoders, estimateBytes, hasSound, type ExportFormat, type ExportQuality } from '../engine/exporter'
import * as E from '../state/editor'
import * as X from '../state/exportJob'
import * as P from '../state/project'
import { exportFile } from '../platform'
import { formatBytes, formatTime } from '../util/time'
import { ProBadge, useLicense } from '@easystudio/license'
import { formatLocked, fpsLocked, needsWatermark, qualityLocked, requirePro, sizeLocked } from '../state/pro'

const FPS = [24, 25, 30, 50, 60]
const SIZE_LABEL: Record<string, string> = { '720': '720p', '1080': '1080p · Full HD', '1440': '1440p · 2K', '2160': '4K' }

export function ExportDialog() {
  const { t } = useTranslation()
  const st = X.useExport()
  useLicense((s) => s.status.pro)
  const project = E.useProject()
  const sizes = X.sizesFor(project)
  const [size, setSize] = useState('1080')
  const [fps, setFps] = useState(FPS.includes(project.fps) && !fpsLocked(project.fps) ? project.fps : 30)
  const [quality, setQuality] = useState<ExportQuality>('medium')
  const [format, setFormat] = useState<ExportFormat>('mp4')
  const [support, setSupport] = useState<{ video: boolean; audio: string | null } | null>(null)
  const sz = sizes.find((s) => s.id === size) ?? sizes[1]
  const guard =
    <T,>(locked: (v: T) => boolean, feature: string, set: (v: T) => void) =>
    (v: T) =>
      (!locked(v) || requirePro(feature)) && set(v)
  const pickSize = guard((id: string) => sizeLocked(Number(id)), t('proFeature.size'), setSize)
  const pickFps = guard((v: string) => fpsLocked(Number(v)), t('proFeature.fps'), (v: string) => setFps(Number(v)))
  const pickQuality = guard<ExportQuality>(qualityLocked, t('proFeature.quality'), setQuality)
  const pickFormat = guard<ExportFormat>(formatLocked, t('proFeature.webm'), setFormat)
  const badge = (locked: boolean, label: string) => (locked ? <>{label} <ProBadge /></> : label)
  const settings = useMemo(() => ({ format, width: sz.w, height: sz.h, fps, quality }), [format, sz.w, sz.h, fps, quality])
  const duration = P.projectDuration(project)
  const withSound = hasSound(E.compose(project))

  useEffect(() => {
    let alive = true
    setSupport(null)
    void checkEncoders(settings).then((r) => alive && setSupport(r))
    return () => {
      alive = false
    }
  }, [settings])

  if (!st.open) return null
  const running = st.status === 'running'
  const pr = st.progress
  const frac = pr ? pr.frame / pr.frames : 0
  const remaining = pr && pr.frame > 5 ? (pr.elapsed / pr.frame) * (pr.frames - pr.frame) : null

  return (
    <Modal
      title={t('exp.title')}
      onClose={X.closeExport}
      width={560}
      footer={
        st.status === 'done' ? (
          <>
            {exportFile() && st.path && (
              <Button onClick={() => void exportFile()!.reveal(st.path!)}>
                <FolderOpen size={15} /> {t('exp.showFolder')}
              </Button>
            )}
            <div className="spacer" />
            <Button variant="primary" onClick={X.closeExport}>
              {t('exp.close')}
            </Button>
          </>
        ) : running ? (
          <>
            <div className="spacer" />
            <Button onClick={X.cancelExport}>{t('exp.cancel')}</Button>
          </>
        ) : (
          <>
            <div className="spacer" />
            <Button onClick={X.closeExport}>{t('exp.cancel')}</Button>
            <Button variant="primary" disabled={!duration || support?.video === false} onClick={() => void X.runExport(settings)}>
              <Download size={15} /> {t('exp.start')}
            </Button>
          </>
        )
      }
    >
      {st.status === 'done' ? (
        <div className="exp-done">
          <CheckCircle2 size={40} />
          <strong>{t('exp.done')}</strong>
          <span className="exp-path">{st.path}</span>
          {pr && <span>{t('exp.took', { time: formatTime(pr.elapsed) })}</span>}
        </div>
      ) : running ? (
        <div className="exp-running">
          <div className="exp-bar">
            <i style={{ width: `${Math.round(frac * 100)}%` }} />
          </div>
          <div className="exp-stats">
            <strong>{Math.round(frac * 100)}%</strong>
            <span>{pr ? t('exp.frames', { n: pr.frame, total: pr.frames }) : t('exp.starting')}</span>
            <div className="spacer" />
            {remaining !== null && <span>{t('exp.remaining', { time: formatTime(remaining) })}</span>}
          </div>
          <p className="insp-hint">{t('exp.runningHint')}</p>
        </div>
      ) : (
        <div className="exp-form">
          {st.status === 'error' && (
            <div className="exp-error">
              <TriangleAlert size={16} /> {st.error}
            </div>
          )}
          <label className="es-field">
            <span>{t('exp.size')}</span>
            <Segmented<string> value={size} onChange={pickSize} options={sizes.map((s) => ({ value: s.id, label: badge(sizeLocked(Number(s.id)), SIZE_LABEL[s.id]), tip: `${s.w} × ${s.h}` }))} />
          </label>
          <label className="es-field">
            <span>{t('exp.fps')}</span>
            <Segmented<string> value={String(fps)} onChange={pickFps} options={FPS.map((f) => ({ value: String(f), label: badge(fpsLocked(f), String(f)) }))} />
          </label>
          <label className="es-field">
            <span>{t('exp.quality')}</span>
            <Segmented<ExportQuality>
              value={quality}
              onChange={pickQuality}
              options={(['small', 'medium', 'high'] as const).map((q) => ({ value: q, label: badge(qualityLocked(q), t(`exp.q_${q}`)), tip: t(`exp.q_${q}Tip`) }))}
            />
          </label>
          <label className="es-field">
            <span>{t('exp.format')}</span>
            <Segmented<ExportFormat>
              value={format}
              onChange={pickFormat}
              options={[
                { value: 'mp4', label: 'MP4', tip: t('exp.mp4Tip') },
                { value: 'webm', label: badge(formatLocked('webm'), 'WebM'), tip: t('exp.webmTip') }
              ]}
            />
          </label>
          <div className="exp-summary">
            <span>
              {sz.w} × {sz.h} · {fps} fps · {formatTime(duration)}
            </span>
            <strong>≈ {formatBytes(estimateBytes(settings, duration, withSound))}</strong>
          </div>
          {needsWatermark(settings) && <p className="exp-mark">{t('exp.watermarkNote')}</p>}
          {support?.video === false && <p className="exp-warn">{t('exp.noEncoder')}</p>}
          {support && withSound && !support.audio && <p className="exp-warn">{t('exp.noAudioEncoder')}</p>}
          <p className="insp-hint">{format === 'mp4' ? t('exp.mp4Tip') : t('exp.webmTip')}</p>
        </div>
      )}
    </Modal>
  )
}
