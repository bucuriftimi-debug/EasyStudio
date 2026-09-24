import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Film, ImageIcon, ListPlus, Music, Plus, Trash2, TriangleAlert, Type } from 'lucide-react'
import { DEFAULT_TEXT, STYLE_PRESETS, type TextStyle } from '@easystudio/draw'
import { Button } from '@easystudio/ui'
import * as L from '../state/library'
import * as E from '../state/editor'
import { MEDIA_DRAG_TYPE } from './Timeline'
import { useVideo } from '../state/store'
import { formatDuration } from '../util/time'

const KIND_ICON = { video: Film, audio: Music, image: ImageIcon }

/** The media library: everything imported into the project. */
export function Library() {
  const { t } = useTranslation()
  const media = useVideo((s) => s.media)
  const importing = useVideo((s) => s.importing)
  const selected = useVideo((s) => s.selectedMedia)
  const empty = !media.length && !importing.length
  const [tab, setTab] = useState<'media' | 'text'>('media')
  return (
    <aside className="library">
      <header className="panel-head tabs">
        <button type="button" className={`tab${tab === 'media' ? ' on' : ''}`} onClick={() => setTab('media')}>
          <Film size={14} /> {t('lib.title')}
        </button>
        <button type="button" className={`tab${tab === 'text' ? ' on' : ''}`} onClick={() => setTab('text')}>
          <Type size={14} /> {t('lib.text')}
        </button>
        <div className="spacer" />
        {tab === 'media' && (
          <Button size="sm" variant="primary" onClick={() => void L.importDialog()}>
            <Plus size={15} /> {t('lib.import')}
          </Button>
        )}
      </header>
      {tab === 'text' ? (
        <TextTab />
      ) : empty ? (
        <button type="button" className="lib-empty" onClick={() => void L.importDialog()}>
          <Film size={34} strokeWidth={1.4} />
          <strong>{t('lib.emptyTitle')}</strong>
          <span>{t('lib.emptyText')}</span>
        </button>
      ) : (
        <div className="lib-grid">
          {media.map((m) => {
            const Icon = KIND_ICON[m.kind]
            return (
              <div
                key={m.id}
                className={`lib-item${selected === m.id ? ' on' : ''}${m.playable ? '' : ' bad'}`}
                title={m.file.path}
                draggable={m.playable}
                onDragStart={(e) => {
                  e.dataTransfer.setData(MEDIA_DRAG_TYPE, m.id)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
              >
                <button type="button" className="lib-open" onClick={() => L.selectMedia(m.id)} onDoubleClick={() => E.addToTimeline(m.id)}>
                  <span className="lib-thumb">
                    {m.thumb ? <img src={m.thumb} alt="" /> : <Icon size={28} strokeWidth={1.4} />}
                    {m.kind !== 'image' && <em className="lib-dur">{formatDuration(m.duration)}</em>}
                    <i className="lib-kind">
                      {m.playable ? <Icon size={12} /> : <TriangleAlert size={12} />}
                    </i>
                  </span>
                  <span className="lib-name">{m.name}</span>
                </button>
                {m.playable && (
                  <button type="button" className="lib-add" aria-label={t('lib.add')} data-tip={t('lib.add')} onClick={() => E.addToTimeline(m.id)}>
                    <ListPlus size={14} />
                  </button>
                )}
                <button type="button" className="lib-remove" aria-label={t('lib.remove')} data-tip={t('lib.remove')} onClick={() => L.removeMedia(m.id)}>
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })}
          {importing.map((i) => (
            <div key={i.key} className="lib-item loading">
              <span className="lib-thumb">
                <div className="es-spinner" />
              </span>
              <span className="lib-name">{i.name}</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}


/** Title styles: click one to put a title at the red line. */
function TextTab() {
  const { t } = useTranslation()
  const project = E.useProject()
  const make = (presetId: string | null): TextStyle => {
    const size = Math.round(Math.min(project.width, project.height) * 0.09)
    const base: TextStyle = { ...DEFAULT_TEXT, text: t('text.default'), size }
    const p = STYLE_PRESETS.find((s) => s.id === presetId)
    return p ? { ...base, ...p.make(base) } : base
  }
  return (
    <div className="text-tab">
      <p className="panel-hint">{t('lib.textHint')}</p>
      <div className="title-grid">
        {STYLE_PRESETS.map((s) => {
          const st = make(s.id)
          return (
            <button key={s.id} type="button" className="title-card" onClick={() => E.addTitle(st)}>
              <span
                style={{
                  fontFamily: `"${st.font}"`,
                  fontWeight: st.weight,
                  fontStyle: st.italic ? 'italic' : undefined,
                  color: st.fill ? st.color : 'transparent',
                  WebkitTextStroke: st.strokeWidth ? `${Math.min(2, st.strokeWidth / 4)}px ${st.strokeColor}` : undefined,
                  textShadow: st.shadowBlur ? `0 0 ${Math.min(10, st.shadowBlur / 3)}px ${st.shadowColor}` : undefined,
                  background: st.bgEnabled ? st.bgColor : undefined,
                  textTransform: st.uppercase ? 'uppercase' : undefined
                }}
              >
                {t(`text.${s.id}`)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
