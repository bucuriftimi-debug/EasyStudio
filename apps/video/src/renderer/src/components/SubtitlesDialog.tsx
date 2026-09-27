import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Captions, CheckCircle2, TriangleAlert } from 'lucide-react'
import { Button, Modal, Segmented } from '@easystudio/ui'
import { ProBadge } from '@easystudio/license'
import type { AsrModel } from '../engine/asr.worker'
import { isPro } from '../state/pro'
import { closeSubtitles, FREE_SUBTITLE_SECONDS, makeSubtitles, useSubtitles, type SubtitleLook } from '../state/subtitles'

const LANGUAGES = ['auto', 'ro', 'en', 'es', 'fr', 'de', 'it', 'hu'] as const

export function SubtitlesDialog() {
  const { t } = useTranslation()
  const st = useSubtitles()
  const [language, setLanguage] = useState<string>(() => (navigator.language?.toLowerCase().startsWith('ro') ? 'ro' : 'auto'))
  const [model, setModel] = useState<AsrModel>('small')
  const [look, setLook] = useState<SubtitleLook>('classic')
  if (!st.open) return null
  const working = st.phase === 'audio' || st.phase === 'download' || st.phase === 'listen'
  const pct = st.progress === null ? null : Math.round(st.progress * 100)

  return (
    <Modal
      title={
        <span className="subs-title">
          <Captions size={18} /> {t('subs.title')}
        </span>
      }
      onClose={closeSubtitles}
      width={520}
      footer={
        st.phase === 'done' ? (
          <Button variant="primary" onClick={closeSubtitles}>
            {t('subs.close')}
          </Button>
        ) : (
          <>
            <div className="spacer" />
            <Button onClick={closeSubtitles}>{t('exp.cancel')}</Button>
            {!working && (
              <Button variant="primary" onClick={() => void makeSubtitles({ language: language === 'auto' ? null : language, model, look })}>
                <Captions size={15} /> {t('subs.start')}
              </Button>
            )}
          </>
        )
      }
    >
      {st.phase === 'done' ? (
        <div className="exp-done">
          <CheckCircle2 size={40} />
          <strong>{t('subs.done', { count: st.count })}</strong>
          <span>{t('subs.doneHint')}</span>
        </div>
      ) : working ? (
        <div className="exp-running">
          <div className="exp-bar">
            <i style={{ width: `${pct ?? 5}%` }} />
          </div>
          <div className="exp-stats">
            <strong>{t(`subs.phase_${st.phase}`)}</strong>
            <div className="spacer" />
            {pct !== null && <span>{pct}%</span>}
          </div>
          <p className="insp-hint">{st.phase === 'download' ? t('subs.downloadHint') : t('subs.workingHint')}</p>
        </div>
      ) : (
        <div className="exp-form">
          {st.phase === 'error' && (
            <div className="exp-error">
              <TriangleAlert size={16} /> {st.error}
            </div>
          )}
          <p className="insp-hint">{t('subs.intro')}</p>
          <label className="es-field">
            <span>{t('subs.language')}</span>
            <select className="es-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {t(`subs.lang_${l}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="es-field">
            <span>{t('subs.quality')}</span>
            <Segmented<AsrModel>
              value={model}
              onChange={setModel}
              options={[
                { value: 'base', label: t('subs.fast'), tip: t('subs.fastTip') },
                { value: 'small', label: t('subs.accurate'), tip: t('subs.accurateTip') }
              ]}
            />
          </label>
          <label className="es-field">
            <span>{t('subs.look')}</span>
            <Segmented<SubtitleLook>
              value={look}
              onChange={setLook}
              options={(['classic', 'box', 'yellow'] as const).map((l) => ({ value: l, label: <span className={`subs-look subs-look-${l}`}>{t(`subs.look_${l}`)}</span> }))}
            />
          </label>
          {!isPro() && (
            <p className="insp-hint">
              <ProBadge /> {t('subs.freeNote', { count: FREE_SUBTITLE_SECONDS })}
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
