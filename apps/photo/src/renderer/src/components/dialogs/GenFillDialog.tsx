import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import { Button, Modal } from '@easystudio/ui'
import * as AS from '../../state/assistant'
import { setBusy, useEditor } from '../../state/store'

/** "Fill the selection with…" — generative fill through OpenAI or Gemini. */
export function GenFillDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const hasSel = useEditor((s) => !!s.selection)
  const go = async () => {
    if (!prompt.trim()) return
    onClose()
    setBusy(t('assist.filling'))
    try {
      await AS.generativeFill(prompt.trim())
    } catch (e) {
      AS.aiErrorToast(e)
    } finally {
      setBusy(null)
    }
  }
  return (
    <Modal
      title={t('assist.fillTitle')}
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button onClick={() => useEditor.setState({ dialog: 'aisettings' })}>{t('assist.settings')}</Button>
          <div className="spacer" />
          <Button onClick={onClose}>{t('dialog.cancel')}</Button>
          <Button variant="primary" disabled={!hasSel || !prompt.trim()} onClick={() => void go()}>
            <Sparkles size={15} /> {t('assist.generate')}
          </Button>
        </>
      }
    >
      <p className="dialog-hint">{hasSel ? t('assist.fillHint') : t('assist.needSelection')}</p>
      <input
        className="es-input"
        style={{ width: '100%', height: 36 }}
        autoFocus
        placeholder={t('assist.fillPlaceholder')}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') void go()
        }}
      />
      <p className="field-hint">{t('assist.fillNote')}</p>
    </Modal>
  )
}
