import { useTranslation } from 'react-i18next'
import * as E from '../state/editor'
import * as P from '../state/project'
import { useVideo } from '../state/store'
import { formatBytes, formatTime } from '../util/time'
import { ClipPanel } from './ClipPanel'

/** Right panel: the selected clip's properties, or facts about the selected library file. */
export function Inspector() {
  const { t } = useTranslation()
  const project = E.useProject()
  const clipId = E.useEditor((s) => s.selectedClip)
  const mode = E.useEditor((s) => s.playerMode)
  const media = useVideo((s) => s.media)
  const selMedia = useVideo((s) => s.selectedMedia)
  const found = clipId && mode === 'timeline' ? P.findClip(project, clipId) : null
  const m = media.find((x) => x.id === (found ? found.clip.mediaId : selMedia))

  if (found) {
    return (
      <aside className="inspector">
        <header className="panel-head">
          <strong>{t('insp.clip')}</strong>
        </header>
        <div className="insp-scroll">
          <ClipPanel key={found.clip.id} clip={found.clip} track={found.track} media={m} index={found.index} />
        </div>
      </aside>
    )
  }

  return (
    <aside className="inspector">
      <header className="panel-head">
        <strong>{t('insp.title')}</strong>
      </header>
      {m ? (
        <dl className="facts">
          <dt>{t('insp.name')}</dt>
          <dd>{m.name}</dd>
          <dt>{t('insp.type')}</dt>
          <dd>{t(`insp.kind_${m.kind}`)}</dd>
          {m.kind !== 'image' && (
            <>
              <dt>{t('insp.duration')}</dt>
              <dd>{formatTime(m.duration)}</dd>
            </>
          )}
          {m.hasVideo && (
            <>
              <dt>{t('insp.size')}</dt>
              <dd>
                {m.width} × {m.height}
                {m.rotation ? ` (${t('insp.rotated', { deg: m.rotation })})` : ''}
              </dd>
            </>
          )}
          {m.kind === 'video' && (
            <>
              <dt>{t('insp.fps')}</dt>
              <dd>{m.fps}</dd>
              <dt>{t('insp.videoCodec')}</dt>
              <dd>{m.videoCodec?.toUpperCase() ?? '—'}</dd>
            </>
          )}
          {m.kind !== 'image' && (
            <>
              <dt>{t('insp.audio')}</dt>
              <dd>{m.hasAudio ? m.audioCodec?.toUpperCase() : t('insp.noAudio')}</dd>
            </>
          )}
          <dt>{t('insp.file')}</dt>
          <dd>{formatBytes(m.file.size)}</dd>
          {!m.playable && <dd className="warn">{t('lib.cantPlayShort')}</dd>}
        </dl>
      ) : (
        <p className="panel-hint">{t('insp.none')}</p>
      )}
    </aside>
  )
}
