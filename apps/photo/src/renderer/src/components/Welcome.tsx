import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, FolderOpen, History, ImagePlus, LayoutTemplate, Scissors, Sparkles, X } from 'lucide-react'
import { Button } from '@easystudio/ui'
import { NEW_DOC_PRESETS } from '@easystudio/core'
import * as A from '../state/actions'
import * as AI from '../state/ai'
import * as F from '../state/files'
import { getDoc, useEditor } from '../state/store'
import { TEMPLATES, templatePreview } from '../state/templates'
import { LanguageSwitch } from './LanguageSwitch'

export function Welcome() {
  const { t } = useTranslation()
  const recent = useEditor((s) => s.recent)
  const recovery = useEditor((s) => s.recovery)
  return (
    <main className="welcome">
      <div className="welcome-inner">
        {recovery && (
          <div className="recover-banner">
            <History size={22} />
            <div>
              <strong>{t('recover.title')}</strong>
              <span>{t('recover.text', { name: recovery.name, time: new Date(recovery.time).toLocaleString() })}</span>
            </div>
            <div className="spacer" />
            <Button onClick={() => void F.discardRecovered()}>{t('recover.discard')}</Button>
            <Button variant="primary" onClick={() => void F.restoreRecovered()}>
              {t('recover.restore')}
            </Button>
          </div>
        )}

        <h1>{t('welcome.title')}</h1>
        <p className="welcome-sub">{t('welcome.subtitle')}</p>

        <div className="welcome-cards">
          <button className="welcome-card primary" onClick={() => void A.openDialog('image')}>
            <ImagePlus size={30} strokeWidth={1.6} />
            <strong>{t('welcome.open')}</strong>
            <span>{t('welcome.openDesc')}</span>
          </button>
          <button className="welcome-card" onClick={() => useEditor.setState({ dialog: 'new' })}>
            <Sparkles size={30} strokeWidth={1.6} />
            <strong>{t('welcome.blank')}</strong>
            <span>{t('welcome.blankDesc')}</span>
          </button>
          <button
            className="welcome-card ai"
            onClick={async () => {
              await A.openDialog('image')
              if (getDoc()) await AI.removeBackground()
            }}
          >
            <Scissors size={30} strokeWidth={1.6} />
            <strong>{t('welcome.removeBg')}</strong>
            <span>{t('welcome.removeBgDesc')}</span>
          </button>
          <button className="welcome-card" onClick={() => void A.openDialog('project')}>
            <FolderOpen size={30} strokeWidth={1.6} />
            <strong>{t('welcome.project')}</strong>
            <span>{t('welcome.projectDesc')}</span>
          </button>
        </div>

        {recent.length > 0 && (
          <>
            <h3 className="welcome-h3">
              <Clock size={15} /> {t('recent.title')}
              <button type="button" className="link small" onClick={() => void F.forgetRecent(null)}>
                {t('recent.clear')}
              </button>
            </h3>
            <div className="recent-grid">
              {recent.slice(0, 8).map((r) => (
                <div key={r.path} className="recent-item" title={r.path}>
                  <button type="button" className="recent-open" onClick={() => void F.openRecent(r.path)}>
                    <span className="recent-thumb">{r.thumb ? <img src={r.thumb} alt="" /> : <ImagePlus size={26} strokeWidth={1.4} />}</span>
                    <strong>{r.name}</strong>
                    <small>{new Date(r.time).toLocaleDateString()}</small>
                  </button>
                  <button type="button" className="recent-remove" aria-label={t('recent.remove')} data-tip={t('recent.remove')} onClick={() => void F.forgetRecent(r.path)}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <h3 className="welcome-h3">
          <LayoutTemplate size={15} /> {t('tpl.title')}
        </h3>
        <TemplateGrid />

        <h3 className="welcome-h3">{t('welcome.sizes')}</h3>
        <div className="preset-grid">
          {NEW_DOC_PRESETS.map((p) => {
            const k = 38 / Math.max(p.w, p.h)
            return (
              <button key={p.id} className="preset" onClick={() => A.newDocument(p.w, p.h, '#ffffff', t(p.label))}>
                <span className="preset-shape">
                  <i style={{ width: p.w * k, height: p.h * k }} />
                </span>
                <span className="preset-text">
                  <strong>{t(p.label)}</strong>
                  <small>
                    {p.w} × {p.h}
                  </small>
                </span>
              </button>
            )
          })}
        </div>

        <footer className="welcome-foot">
          <LanguageSwitch />
        </footer>
      </div>
    </main>
  )
}

/** Template cards with previews drawn from the real layers (redrawn when the language changes). */
function TemplateGrid() {
  const { t, i18n } = useTranslation()
  const [previews, setPreviews] = useState<Record<string, string>>({})
  useEffect(() => {
    let alive = true
    const urls: string[] = []
    void (async () => {
      for (const tpl of TEMPLATES) {
        const url = await templatePreview(tpl)
        urls.push(url)
        if (!alive) return
        setPreviews((p) => ({ ...p, [tpl.id]: url }))
      }
    })()
    return () => {
      alive = false
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [i18n.language])
  return (
    <div className="template-grid">
      {TEMPLATES.map((tpl) => (
        <button key={tpl.id} type="button" className="template" onClick={() => void A.openTemplate(tpl)}>
          <span className="template-thumb">
            {previews[tpl.id] && <img src={previews[tpl.id]} alt="" />}
          </span>
          <strong>{t(`tpl.${tpl.id}`)}</strong>
          <small>
            {tpl.w} × {tpl.h}
          </small>
        </button>
      ))}
    </div>
  )
}
