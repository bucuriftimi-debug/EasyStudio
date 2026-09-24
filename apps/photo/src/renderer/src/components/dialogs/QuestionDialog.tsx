import { useTranslation } from 'react-i18next'
import { Button, Modal } from '@easystudio/ui'
import { useEditor } from '../../state/store'

/** In-app yes/no question (see `ask` in the store). */
export function QuestionDialog() {
  const { t } = useTranslation()
  const q = useEditor((s) => s.question)
  if (!q) return null
  return (
    <Modal
      title={t('app.name')}
      onClose={() => q.resolve(false)}
      width={420}
      footer={
        <>
          <Button onClick={() => q.resolve(false)}>{q.no}</Button>
          <Button variant="primary" autoFocus onClick={() => q.resolve(true)}>
            {q.yes}
          </Button>
        </>
      }
    >
      <p className="dialog-hint">{q.text}</p>
    </Modal>
  )
}
