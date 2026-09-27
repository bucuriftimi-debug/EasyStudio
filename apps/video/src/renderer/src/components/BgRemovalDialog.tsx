import { useTranslation } from 'react-i18next'
import { CheckCircle2, TriangleAlert, UserRound } from 'lucide-react'
import { Button, Modal } from '@easystudio/ui'
import { cancelBgRemoval, closeBgRemoval, useBgRemoval } from '../state/bgRemoval'

/** Progress of "Remove background" on a video clip. */
export function BgRemovalDialog() {
  const { t } = useTranslation()
  const st = useBgRemoval()
  if (!st.clipId && st.phase !== 'error') return null
  if (st.phase === 'idle') return null
  const pct = st.progress === null ? null : Math.round(st.progress * 100)
  const working = st.phase === 'work' || st.phase === 'download'
  return (
    <Modal
      title={
        <span className="subs-title">
          <UserRound size={18} /> {t('bg.title')}
        </span>
      }
      onClose={working ? cancelBgRemoval : closeBgRemoval}
      width={460}
      footer={
        <>
          <div className="spacer" />
          {working ? <Button onClick={cancelBgRemoval}>{t('exp.cancel')}</Button> : <Button variant="primary" onClick={closeBgRemoval}>{t('subs.close')}</Button>}
        </>
      }
    >
      {st.phase === 'done' ? (
        <div className="exp-done">
          <CheckCircle2 size={40} />
          <strong>{t('bg.done')}</strong>
          <span>{t('bg.doneHint')}</span>
        </div>
      ) : st.phase === 'error' ? (
        <div className="exp-error">
          <TriangleAlert size={16} /> {st.error}
        </div>
      ) : (
        <div className="exp-running">
          <div className="exp-bar">
            <i style={{ width: `${pct ?? 5}%` }} />
          </div>
          <div className="exp-stats">
            <strong>{st.phase === 'download' ? t('bg.download') : t('bg.working')}</strong>
            <div className="spacer" />
            {pct !== null && <span>{pct}%</span>}
          </div>
          <p className="insp-hint">{t('bg.hint')}</p>
        </div>
      )}
    </Modal>
  )
}
