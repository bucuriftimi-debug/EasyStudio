import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, FolderOpen, Images, Play } from 'lucide-react'
import { Button, Modal, Segmented, Slider, Switch } from '@easystudio/ui'
import { EXPORT_SIZES, IMAGE_FORMATS, type ImageFormat } from '@easystudio/core'
import { LOOKS } from '@easystudio/gpu'
import { ProBadge } from '@easystudio/license'
import { isElectron, pickFolder, pickImages, type PickedFile } from '../../platform'
import { runBatch, type BatchResult } from '../../state/batch'
import { isPro, requirePro } from '../../state/pro'

/** Free users can try batch editing on this many photos at a time. */
export const FREE_BATCH = 3

export function BatchDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [files, setFiles] = useState<PickedFile[]>([])
  const [folder, setFolder] = useState<string | null>(null)
  const [look, setLook] = useState<string>('')
  const [auto, setAuto] = useState(true)
  const [size, setSize] = useState('hd')
  const [format, setFormat] = useState<ImageFormat>('jpeg')
  const [quality, setQuality] = useState(88)
  const [suffix, setSuffix] = useState(t('batch.suffixDefault'))
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(null)
  const [result, setResult] = useState<BatchResult | null>(null)
  const abort = useRef<AbortController | null>(null)
  const running = !!progress && !result

  const start = async () => {
    if (!files.length || !folder) return
    if (files.length > FREE_BATCH && !isPro() && !requirePro(t('proFeature.batch', { count: FREE_BATCH }))) return
    if (format === 'webp' && !requirePro(t('proFeature.webp'))) return
    abort.current = new AbortController()
    setResult(null)
    setProgress({ done: 0, total: files.length, name: '' })
    const longEdge = EXPORT_SIZES.find((s) => s.id === size)?.longEdge ?? 0
    const r = await runBatch(files, folder, { look: look || null, auto, longEdge, format, quality, suffix }, (done, total, name) => setProgress({ done, total, name }), abort.current.signal)
    setResult(r)
  }

  const close = () => {
    if (running) abort.current?.abort()
    else onClose()
  }

  return (
    <Modal
      title={t('batch.title')}
      onClose={close}
      width={540}
      footer={
        result ? (
          <Button variant="primary" onClick={onClose}>
            {t('batch.close')}
          </Button>
        ) : (
          <>
            <Button onClick={close}>{running ? t('batch.stop') : t('dialog.cancel')}</Button>
            <Button variant="primary" onClick={() => void start()} disabled={running || !files.length || !folder}>
              <Play size={15} /> {t('batch.start', { count: files.length })}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="batch-done">
          <CheckCircle2 size={36} />
          <strong>{t('batch.done', { count: result.done })}</strong>
          <span className="exp-path">{folder}</span>
          {result.failed.length > 0 && <p className="exp-warn">{t('batch.failed', { names: result.failed.join(', ') })}</p>}
          {result.cancelled && <p className="field-hint">{t('batch.cancelled')}</p>}
        </div>
      ) : running ? (
        <div className="batch-running">
          <div className="busy-bar">
            <i style={{ width: `${Math.round((progress!.done / progress!.total) * 100)}%` }} />
          </div>
          <span>{t('batch.progress', { done: progress!.done, total: progress!.total, name: progress!.name })}</span>
        </div>
      ) : (
        <div className="export-form batch-form">
          {!isElectron && <p className="exp-warn">{t('batch.desktopOnly')}</p>}
          <div className="batch-row">
            <Button onClick={async () => setFiles(await pickImages())}>
              <Images size={15} /> {t('batch.choose')}
            </Button>
            <span className="field-hint">{files.length ? t('batch.chosen', { count: files.length }) : t('batch.none')}</span>
          </div>
          {!isPro() && (
            <p className="field-hint">
              <ProBadge /> {t('batch.freeLimit', { count: FREE_BATCH })}
            </p>
          )}
          <label className="es-field">
            <span>{t('batch.look')}</span>
            <select className="es-select" value={look} onChange={(e) => setLook(e.target.value)}>
              <option value="">{t('look.none')}</option>
              {LOOKS.map((l) => (
                <option key={l.id} value={l.id}>
                  {t(l.label)}
                </option>
              ))}
            </select>
          </label>
          <Switch checked={auto} onChange={setAuto} label={t('batch.auto')} />
          <label className="es-field">
            <span>{t('batch.size')}</span>
            <select className="es-select" value={size} onChange={(e) => setSize(e.target.value)}>
              {EXPORT_SIZES.map((s) => (
                <option key={s.id} value={s.id}>
                  {t(s.label)}
                </option>
              ))}
            </select>
          </label>
          <div className="es-field">
            <span>{t('export.format')}</span>
            <Segmented<ImageFormat>
              value={format}
              onChange={setFormat}
              options={IMAGE_FORMATS.map((f) => ({ value: f.id, label: f.id === 'webp' ? <>{f.label} <ProBadge /></> : f.label }))}
            />
          </div>
          {format !== 'png' && <Slider label={t('export.quality')} min={10} max={100} defaultValue={88} value={quality} unit="%" onChange={setQuality} />}
          <label className="es-field">
            <span>{t('batch.suffix')}</span>
            <input className="es-input" value={suffix} onChange={(e) => setSuffix(e.target.value)} />
          </label>
          <div className="batch-row">
            <Button onClick={async () => setFolder(await pickFolder())} disabled={!isElectron}>
              <FolderOpen size={15} /> {t('batch.folder')}
            </Button>
            <span className="field-hint batch-folder">{folder ?? t('batch.noFolder')}</span>
          </div>
        </div>
      )}
    </Modal>
  )
}
