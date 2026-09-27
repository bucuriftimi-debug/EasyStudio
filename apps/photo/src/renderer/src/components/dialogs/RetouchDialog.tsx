import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import { Button, Modal, Slider } from '@easystudio/ui'
import { retouchPortrait } from '../../state/retouch'

export function RetouchDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [strength, setStrength] = useState(60)
  const apply = () => {
    onClose()
    void retouchPortrait(strength / 100)
  }
  return (
    <Modal
      title={t('retouch.title')}
      onClose={onClose}
      width={440}
      footer={
        <>
          <Button onClick={onClose}>{t('dialog.cancel')}</Button>
          <Button variant="primary" onClick={apply}>
            <Sparkles size={15} /> {t('retouch.apply')}
          </Button>
        </>
      }
    >
      <div className="export-form">
        <p className="field-hint">{t('retouch.intro')}</p>
        <Slider label={t('retouch.strength')} min={10} max={100} defaultValue={60} value={strength} unit="%" onChange={setStrength} />
        <p className="field-hint">{t('retouch.teethHint')}</p>
      </div>
    </Modal>
  )
}
