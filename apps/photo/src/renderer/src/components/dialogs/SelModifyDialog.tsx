import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal, Segmented } from '@easystudio/ui'
import * as A from '../../state/actions'
import { setBusy } from '../../state/store'
import { NumberField } from './NumberField'

type Kind = 'feather' | 'expand' | 'contract'

export function SelModifyDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<Kind>('feather')
  const [px, setPx] = useState(10)
  const ok = () => {
    onClose()
    setBusy('…')
    // Let the dialog close before the (possibly heavy) mask work.
    setTimeout(() => {
      A.modifySelection(kind, px)
      setBusy(null)
    }, 30)
  }
  return (
    <Modal
      title={t('dialog.selTitle')}
      onClose={onClose}
      width={420}
      footer={
        <>
          <Button onClick={onClose}>{t('dialog.cancel')}</Button>
          <Button variant="primary" onClick={ok}>
            {t('dialog.ok')}
          </Button>
        </>
      }
    >
      <p className="dialog-hint">{t('dialog.selHint')}</p>
      <Segmented<Kind>
        accent
        value={kind}
        onChange={setKind}
        options={[
          { value: 'feather', label: t('dialog.feather') },
          { value: 'expand', label: t('dialog.expand') },
          { value: 'contract', label: t('dialog.contract') }
        ]}
      />
      <div className="form-row" style={{ marginTop: 14 }}>
        <NumberField label={t('dialog.selAmount')} value={px} min={1} max={250} suffix={t('dialog.px')} onChange={setPx} />
      </div>
    </Modal>
  )
}
