import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Unlink } from 'lucide-react'
import { Button, Modal } from '@easystudio/ui'
import * as A from '../../state/actions'
import { getDoc } from '../../state/store'
import { NumberField } from './NumberField'

function SizeFields({ w, h, setW, setH, lock, setLock, ratio }: {
  w: number
  h: number
  setW: (v: number) => void
  setH: (v: number) => void
  lock: boolean
  setLock: (v: boolean) => void
  ratio: number
}) {
  const { t } = useTranslation()
  return (
    <div className="form-row">
      <NumberField label={t('dialog.width')} value={w} min={1} max={16384} suffix={t('dialog.px')} onChange={(v) => (setW(v), lock && setH(Math.max(1, Math.round(v / ratio))))} />
      <Button icon variant="ghost" className="lock-btn" active={lock} tip={t('dialog.lock')} onClick={() => setLock(!lock)}>
        {lock ? <Link size={15} /> : <Unlink size={15} />}
      </Button>
      <NumberField label={t('dialog.height')} value={h} min={1} max={16384} suffix={t('dialog.px')} onChange={(v) => (setH(v), lock && setW(Math.max(1, Math.round(v * ratio))))} />
    </div>
  )
}

export function ResizeDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const doc = getDoc()!
  const ratio = doc.width / doc.height
  const [w, setW] = useState(doc.width)
  const [h, setH] = useState(doc.height)
  const [lock, setLock] = useState(true)
  const ok = () => {
    A.resizeImage(w, h)
    onClose()
  }
  return (
    <Modal
      title={t('dialog.resizeTitle')}
      onClose={onClose}
      width={440}
      footer={
        <>
          <Button onClick={onClose}>{t('dialog.cancel')}</Button>
          <Button variant="primary" onClick={ok} disabled={w === doc.width && h === doc.height}>
            {t('dialog.ok')}
          </Button>
        </>
      }
    >
      <p className="dialog-hint">{t('dialog.resizeHint')}</p>
      <SizeFields w={w} h={h} setW={setW} setH={setH} lock={lock} setLock={setLock} ratio={ratio} />
      <div className="es-field" style={{ marginTop: 14 }}>
        <span>{t('dialog.percent')}</span>
        <div className="chips">
          {[25, 50, 75, 150, 200].map((p) => (
            <button
              key={p}
              type="button"
              className="chip"
              onClick={() => {
                setLock(true)
                setW(Math.max(1, Math.round((doc.width * p) / 100)))
                setH(Math.max(1, Math.round((doc.height * p) / 100)))
              }}
            >
              {p}%
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

export function CanvasSizeDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const doc = getDoc()!
  const ratio = doc.width / doc.height
  const [w, setW] = useState(doc.width)
  const [h, setH] = useState(doc.height)
  const [lock, setLock] = useState(false)
  const [anchor, setAnchor] = useState<[number, number]>([0.5, 0.5])
  const ok = () => {
    A.resizeCanvas(w, h, anchor[0], anchor[1])
    onClose()
  }
  return (
    <Modal
      title={t('dialog.canvasTitle')}
      onClose={onClose}
      width={440}
      footer={
        <>
          <Button onClick={onClose}>{t('dialog.cancel')}</Button>
          <Button variant="primary" onClick={ok} disabled={w === doc.width && h === doc.height}>
            {t('dialog.ok')}
          </Button>
        </>
      }
    >
      <p className="dialog-hint">{t('dialog.canvasHint')}</p>
      <SizeFields w={w} h={h} setW={setW} setH={setH} lock={lock} setLock={setLock} ratio={ratio} />
      <div className="es-field" style={{ marginTop: 14 }}>
        <span>{t('dialog.anchor')}</span>
        <div className="anchor-grid">
          {[0, 0.5, 1].map((ay) =>
            [0, 0.5, 1].map((ax) => (
              <button
                key={`${ax}-${ay}`}
                type="button"
                className={anchor[0] === ax && anchor[1] === ay ? 'on' : ''}
                onClick={() => setAnchor([ax, ay])}
                aria-label={`${ax},${ay}`}
              />
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}
