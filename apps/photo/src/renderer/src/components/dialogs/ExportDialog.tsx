import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { Button, Modal, Segmented, Slider } from '@easystudio/ui'
import { EXPORT_SIZES, formatBytes, IMAGE_FORMATS, scaleToLongEdge, type ImageFormat } from '@easystudio/core'
import * as A from '../../state/actions'
import { getDoc } from '../../state/store'
import { ProBadge, useLicense } from '@easystudio/license'
import { exportLocked, FREE_EXPORT_EDGE, requirePro } from '../../state/pro'

const PREF_KEY = 'easystudio.photo.export'

function loadPrefs(): { format: ImageFormat; quality: number; size: string } {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}')
    return { format: p.format ?? 'jpeg', quality: p.quality ?? 90, size: p.size ?? 'original' }
  } catch {
    return { format: 'jpeg', quality: 90, size: 'original' }
  }
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const doc = getDoc()!
  const pro = useLicense((s) => s.status.pro)
  const prefs = useMemo(loadPrefs, [])
  // A cut-out (e.g. after "Remove background") should keep its transparency: suggest PNG.
  const cutout = doc.layers.some((l) => l.mask?.enabled)
  const [format, setFormatRaw] = useState<ImageFormat>(cutout && prefs.format === 'jpeg' ? 'png' : prefs.format === 'webp' && !pro ? 'jpeg' : prefs.format)
  const [quality, setQuality] = useState(prefs.quality)
  const [sizeId, setSizeId] = useState(prefs.size)
  const [estimate, setEstimate] = useState<{ key: string; blob: Blob } | null>(null)
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)

  const long = Math.max(doc.width, doc.height)
  const sizes = EXPORT_SIZES.filter((s) => s.longEdge === 0 || s.longEdge < long)
  // Free: pictures up to FREE_EXPORT_EDGE px on the long side; bigger sizes are Pro.
  const edgeOf = (s: (typeof sizes)[number]) => (s.longEdge === 0 ? long : s.longEdge)
  const locked = (s: (typeof sizes)[number]) => exportLocked(edgeOf(s))
  const firstFree = sizes.find((s) => !locked(s)) ?? sizes[sizes.length - 1]
  const picked = sizes.find((s) => s.id === sizeId) ?? sizes[0]
  const size = locked(picked) ? firstFree : picked
  const setFormat = (f: ImageFormat) => (f !== 'webp' || requirePro(t('proFeature.webp'))) && setFormatRaw(f)
  const pickSize = (id: string) => {
    const s = sizes.find((x) => x.id === id)!
    if (!locked(s) || requirePro(t('proFeature.export', { px: FREE_EXPORT_EDGE }))) setSizeId(id)
  }
  const dims = scaleToLongEdge(doc.width, doc.height, size.longEdge)
  const fmt = IMAGE_FORMATS.find((f) => f.id === format)!
  const settings = { format, quality, width: dims.w, height: dims.h }
  const key = JSON.stringify(settings)

  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ format, quality, size: size.id }))
    } catch {
      /* ignore */
    }
    const my = ++seq.current
    const id = setTimeout(async () => {
      try {
        const blob = await A.renderExport(doc, settings)
        if (seq.current === my) setEstimate({ key, blob })
      } catch (e) {
        console.error(e)
      }
    }, 300)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const ready = estimate?.key === key
  const doExport = async () => {
    setBusy(true)
    const ok = await A.exportImage(settings, ready ? estimate!.blob : undefined)
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Modal
      title={t('export.title')}
      onClose={onClose}
      width={460}
      footer={
        <>
          <Button onClick={onClose}>{t('dialog.cancel')}</Button>
          <Button variant="primary" onClick={doExport} disabled={busy}>
            <Download size={15} /> {t('export.button')}
          </Button>
        </>
      }
    >
      <div className="export-form">
        <div className="es-field">
          <span>{t('export.format')}</span>
          <Segmented<ImageFormat> accent value={format} onChange={setFormat} options={IMAGE_FORMATS.map((f) => ({ value: f.id, label: f.id === 'webp' ? <>{f.label} <ProBadge /></> : f.label }))} />
          <small className="field-hint">{t(`export.${format === 'jpeg' ? 'jpg' : format}Hint`)}</small>
        </div>

        {fmt.lossy && <Slider label={t('export.quality')} min={10} max={100} defaultValue={90} value={quality} unit="%" onChange={setQuality} />}

        <label className="es-field">
          <span>{t('export.size')}</span>
          <select className="es-select" value={size.id} onChange={(e) => pickSize(e.target.value)}>
            {sizes.map((s) => (
              <option key={s.id} value={s.id}>
                {t(s.label)}
                {locked(s) ? `${s.longEdge === 0 ? ` (${long} px)` : ''} · PRO` : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="export-result">
          <span>{t('export.result')}</span>
          <strong>
            {dims.w} × {dims.h} px · {fmt.label}
          </strong>
          <em>{ready ? t('export.fileSize', { size: formatBytes(estimate!.blob.size) }) : t('export.estimating')}</em>
        </div>
      </div>
    </Modal>
  )
}
