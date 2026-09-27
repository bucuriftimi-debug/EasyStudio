import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus } from 'lucide-react'
import { Button, ColorButton, Modal, Segmented, Slider } from '@easystudio/ui'
import { ProBadge } from '@easystudio/license'
import { cellRects, COLLAGE_LAYOUTS, FREE_COLLAGE_CELLS, type CollageLayout } from '../../state/collage'
import * as A from '../../state/actions'
import { isPro, requirePro } from '../../state/pro'
import { useEditor } from '../../state/store'

const SIZES = [
  { id: 'square', w: 2160, h: 2160 },
  { id: 'portrait', w: 2160, h: 2700 },
  { id: 'story', w: 1080, h: 1920 },
  { id: 'wide', w: 1920, h: 1080 }
] as const

const locked = (l: CollageLayout) => !isPro() && l.cells.length > FREE_COLLAGE_CELLS

/** Small drawing of a layout (the real gaps, scaled down). */
function LayoutIcon({ layout, w, h }: { layout: CollageLayout; w: number; h: number }) {
  const k = 44 / Math.max(w, h)
  const rects = cellRects({ layout, width: w * k, height: h * k, gap: 3, radius: 0, background: '' })
  return (
    <svg width={w * k} height={h * k} className="collage-icon">
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={2} />
      ))}
    </svg>
  )
}

export function CollageDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const recent = useEditor((s) => s.recentColors)
  const [layout, setLayout] = useState<CollageLayout>(COLLAGE_LAYOUTS[4])
  const [size, setSize] = useState<(typeof SIZES)[number]['id']>('square')
  const [gap, setGap] = useState(24)
  const [radius, setRadius] = useState(16)
  const [bg, setBg] = useState('#ffffff')
  const [busy, setBusy] = useState(false)
  const sz = SIZES.find((s) => s.id === size)!
  const scale = sz.w / 1080

  const pick = (l: CollageLayout) => (!locked(l) || requirePro(t('proFeature.collage'))) && setLayout(l)

  const create = async () => {
    setBusy(true)
    const ok = await A.createCollage({ layout, width: sz.w, height: sz.h, gap: Math.round(gap * scale), radius: Math.round(radius * scale), background: bg })
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Modal
      title={t('collage.title')}
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button onClick={onClose}>{t('dialog.cancel')}</Button>
          <Button variant="primary" onClick={() => void create()} disabled={busy}>
            <ImagePlus size={15} /> {t('collage.choose', { count: layout.cells.length })}
          </Button>
        </>
      }
    >
      <div className="collage-form">
        <div className="collage-layouts">
          {COLLAGE_LAYOUTS.map((l) => (
            <button key={l.id} type="button" className={`collage-layout${layout.id === l.id ? ' on' : ''}`} onClick={() => pick(l)} data-tip={t('collage.photos', { count: l.cells.length })}>
              <LayoutIcon layout={l} w={sz.w} h={sz.h} />
              {locked(l) && <ProBadge className="collage-pro" />}
            </button>
          ))}
        </div>
        <label className="es-field">
          <span>{t('collage.shape')}</span>
          <Segmented value={size} onChange={setSize} options={SIZES.map((s) => ({ value: s.id, label: t(`collage.size_${s.id}`), tip: `${s.w} × ${s.h}` }))} />
        </label>
        <Slider label={t('collage.gap')} min={0} max={80} defaultValue={24} value={gap} unit=" px" onChange={setGap} />
        <Slider label={t('collage.radius')} min={0} max={80} defaultValue={16} value={radius} unit=" px" onChange={setRadius} />
        <div className="es-field collage-bg">
          <span>{t('collage.background')}</span>
          <ColorButton value={bg} recent={recent} tip={t('collage.background')} onChange={(hex) => setBg(hex)} />
        </div>
        <p className="field-hint">{t('collage.hint')}</p>
      </div>
    </Modal>
  )
}
