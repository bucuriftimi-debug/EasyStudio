import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal, Segmented } from '@easystudio/ui'
import { NEW_DOC_PRESETS } from '@easystudio/core'
import * as A from '../../state/actions'
import { NumberField } from './NumberField'

type Bg = 'white' | 'transparent' | 'custom'

export function NewDocDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [w, setW] = useState(1080)
  const [h, setH] = useState(1080)
  const [preset, setPreset] = useState<string | null>('ig-post')
  const [bg, setBg] = useState<Bg>('white')
  const [color, setColor] = useState('#7b6bff')

  const create = () => {
    A.newDocument(w, h, bg === 'white' ? '#ffffff' : bg === 'custom' ? color : null, preset ? t(NEW_DOC_PRESETS.find((p) => p.id === preset)!.label) : undefined)
    onClose()
  }

  return (
    <Modal
      title={t('dialog.newTitle')}
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button onClick={onClose}>{t('dialog.cancel')}</Button>
          <Button variant="primary" onClick={create}>
            {t('dialog.create')}
          </Button>
        </>
      }
    >
      <div className="preset-grid compact">
        {NEW_DOC_PRESETS.map((p) => {
          const k = 30 / Math.max(p.w, p.h)
          return (
            <button
              key={p.id}
              type="button"
              className={`preset${preset === p.id ? ' on' : ''}`}
              onClick={() => {
                setPreset(p.id)
                setW(p.w)
                setH(p.h)
              }}
            >
              <span className="preset-shape small">
                <i style={{ width: p.w * k, height: p.h * k }} />
              </span>
              <span className="preset-text">
                <strong>{t(p.label)}</strong>
                <small>
                  {p.w} × {p.h}
                </small>
              </span>
            </button>
          )
        })}
      </div>
      <div className="form-row">
        <NumberField label={t('dialog.width')} value={w} min={1} max={16384} suffix={t('dialog.px')} onChange={(v) => (setW(v), setPreset(null))} />
        <NumberField label={t('dialog.height')} value={h} min={1} max={16384} suffix={t('dialog.px')} onChange={(v) => (setH(v), setPreset(null))} />
      </div>
      <div className="es-field" style={{ marginTop: 14 }}>
        <span>{t('dialog.background')}</span>
        <div className="form-inline">
          <Segmented<Bg>
            value={bg}
            onChange={setBg}
            options={[
              { value: 'white', label: t('dialog.white') },
              { value: 'transparent', label: t('dialog.transparent') },
              { value: 'custom', label: t('dialog.custom') }
            ]}
          />
          {bg === 'custom' && <input type="color" className="color-input" value={color} onChange={(e) => setColor(e.target.value)} />}
        </div>
      </div>
    </Modal>
  )
}
