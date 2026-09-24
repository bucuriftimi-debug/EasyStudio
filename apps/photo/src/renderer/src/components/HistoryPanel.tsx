import { useTranslation } from 'react-i18next'
import { historyTimeline } from '@easystudio/core'
import { jumpHistory, useEditor } from '../state/store'

export function HistoryPanel() {
  const { t } = useTranslation()
  const hist = useEditor((s) => s.hist)
  if (!hist) return null
  const { entries, current } = historyTimeline(hist)
  return (
    <div className="history">
      <ol className="history-list">
        {entries.map((e, i) => (
          <li key={i}>
            <button
              type="button"
              className={`history-item${i === current ? ' on' : ''}${i > current ? ' future' : ''}`}
              onClick={() => jumpHistory(i)}
            >
              <span className="history-n">{i + 1}</span>
              {e.label}
            </button>
          </li>
        ))}
      </ol>
      {entries.length <= 1 && <p className="hint-box">{t('history.empty')}</p>}
    </div>
  )
}
