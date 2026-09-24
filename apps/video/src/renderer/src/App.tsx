import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, CircleHelp, Download, FilePlus2, FolderOpen, Languages, Save } from 'lucide-react'
import { Button, Menu, Modal, Segmented } from '@easystudio/ui'
import { Library } from './components/Library'
import { Player } from './components/Player'
import { Inspector } from './components/Inspector'
import { Timeline } from './components/Timeline'
import { ExportDialog } from './components/ExportDialog'
import * as X from './state/exportJob'
import * as Sn from './state/session'
import { HelpDialog, RecoveryBanner, Tour, useFirstRunTour, useHelp } from './components/Extras'
import { engine } from './engine/engine'
import * as E from './state/editor'
import * as F from './state/projectFile'
import * as L from './state/library'
import { useVideo } from './state/store'
import { setDirty, setWindowTitle } from './platform'
import { AccountButton, AccountDialog, ProButton, ProDialog } from '@easystudio/license'
import { proBenefits } from './state/pro'

function TopBar() {
  const { t, i18n } = useTranslation()
  const name = E.useEditor((s) => E.projectName(s.hist.present.state))
  const dirty = E.useEditor((s) => E.isDirty(s))
  const format = E.useEditor((s) => E.formatOf(s.hist.present.state))
  const hasClips = E.useEditor((s) => s.hist.present.state.tracks.some((tr) => tr.clips.length))
  const recent = Sn.useSession((s) => s.recent)
  const [recentMenu, setRecentMenu] = useState<HTMLElement | null>(null)
  return (
    <header className="topbar">
      <div className="logo" aria-hidden>
        <span />
      </div>
      <strong className="app-name">{t('app.name')}</strong>
      <div className="divider" />
      <Button size="sm" variant="ghost" tip={t('file.newTip')} onClick={() => void F.newProject()}>
        <FilePlus2 size={15} /> {t('file.new')}
      </Button>
      <Button size="sm" variant="ghost" tip={t('file.openTip')} onClick={() => void F.openProject()}>
        <FolderOpen size={15} /> {t('file.open')}
      </Button>
      {recent.length > 0 && (
        <Button size="sm" variant="ghost" icon tip={t('file.recent')} onClick={(e) => setRecentMenu(recentMenu ? null : e.currentTarget)}>
          <ChevronDown size={14} />
        </Button>
      )}
      {recentMenu && (
        <Menu
          anchor={recentMenu}
          onClose={() => setRecentMenu(null)}
          items={[{ label: t('file.recent'), disabled: true }, ...recent.map((r) => ({ label: r.name, kbd: new Date(r.time).toLocaleDateString(), onClick: () => void F.openProject(r.path) }))]}
        />
      )}
      <Button size="sm" variant="ghost" tip={t('file.saveTip')} onClick={() => void F.saveProject()}>
        <Save size={15} /> {t('file.save')}
      </Button>
      <div className="spacer" />
      <span className="doc-title">
        {name}
        {dirty && <i className="dirty-dot" title={t('file.unsaved')} />}
      </span>
      <div className="spacer" />
      <div className="format-switch" data-tip={t('top.formatTip')}>
        <span>{t('top.format')}</span>
        <Segmented<string>
          value={format ?? ''}
          onChange={(f) => E.setFormat(f)}
          options={E.FORMATS.map((f) => ({ value: f.id, label: f.id, tip: t(`top.format_${f.id.replace(':', '_')}`) }))}
        />
      </div>
      <ProButton />
      <AccountButton />
      <div className="lang-switch">
        <Languages size={15} />
        <Segmented<string>
          value={i18n.language}
          onChange={(l) => void i18n.changeLanguage(l)}
          options={[
            { value: 'en', label: 'EN' },
            { value: 'ro', label: 'RO' }
          ]}
        />
      </div>
      <Button icon variant="ghost" tip={t('help.title')} onClick={() => useHelp.setState({ open: true })}>
        <CircleHelp size={17} />
      </Button>
      <Button variant="primary" className="export-btn" disabled={!hasClips} tip={t('top.exportTip')} onClick={X.openExport}>
        <Download size={16} /> {t('top.export')}
      </Button>
    </header>
  )
}

function Toasts() {
  const toasts = useVideo((s) => s.toasts)
  return (
    <div className="es-toasts" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={`es-toast ${x.kind}`}>
          {x.text}
        </div>
      ))}
    </div>
  )
}

function QuestionDialog() {
  const q = useVideo((s) => s.question)
  if (!q) return null
  return (
    <Modal
      title=""
      onClose={() => q.resolve(false)}
      width={420}
      footer={
        <>
          <div className="spacer" />
          <Button onClick={() => q.resolve(false)}>{q.no}</Button>
          <Button variant="primary" onClick={() => q.resolve(true)}>
            {q.yes}
          </Button>
        </>
      }
    >
      <p className="question-text">{q.text}</p>
    </Modal>
  )
}

const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null
  return !!el && ((el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'range') || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

/** Keyboard shortcuts, window title, and drag & drop of files anywhere on the window. */
function useAppEffects(): void {
  const { t } = useTranslation()
  const name = E.useEditor((s) => E.projectName(s.hist.present.state))
  const dirty = E.useEditor((s) => E.isDirty(s))
  useEffect(() => setWindowTitle(`${name}${dirty ? ' •' : ''} — ${t('app.name')}`), [name, dirty, t])
  useEffect(() => setDirty(dirty), [dirty])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (ctrl && k === 's') return e.preventDefault(), void F.saveProject(e.shiftKey)
      if (ctrl && k === 'o') return e.preventDefault(), void F.openProject()
      if (ctrl && k === 'n') return e.preventDefault(), void F.newProject()
      if (ctrl && k === 'i') return e.preventDefault(), void L.importDialog()
      if (X.useExport.getState().open || useHelp.getState().open) return
      if (ctrl && k === 'e') return e.preventDefault(), X.openExport()
      if (isTyping(e) || useVideo.getState().question) return
      if (ctrl && k === 'z') return e.preventDefault(), e.shiftKey ? E.redo() : E.undo()
      if (ctrl && k === 'y') return e.preventDefault(), E.redo()
      if (ctrl) return
      if (e.code === 'Space') return e.preventDefault(), engine.toggle()
      if (e.key === 'ArrowLeft') return e.preventDefault(), engine.step(e.shiftKey ? -10 : -1)
      if (e.key === 'ArrowRight') return e.preventDefault(), engine.step(e.shiftKey ? 10 : 1)
      if (e.key === 'Home') return e.preventDefault(), engine.seek(0)
      if (e.key === 'End') return e.preventDefault(), engine.seek(engine.duration)
      if (k === 's') return e.preventDefault(), E.splitAtPlayhead()
      if (e.key === 'Delete' || e.key === 'Backspace') return e.preventDefault(), E.deleteSelected()
      if (e.key === '+' || e.key === '=') return E.setZoom(E.useEditor.getState().pps * 1.5)
      if (e.key === '-') return E.setZoom(E.useEditor.getState().pps / 1.5)
      if (e.key === 'Escape') return E.selectClip(null)
    }
    const files = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')
    const over = (e: DragEvent) => {
      if (!files(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
      document.body.classList.add('dropping')
    }
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) document.body.classList.remove('dropping')
    }
    const drop = (e: DragEvent) => {
      document.body.classList.remove('dropping')
      if (!files(e)) return
      e.preventDefault()
      const list = [...(e.dataTransfer?.files ?? [])]
      const project = list.find((f) => f.name.toLowerCase().endsWith('.esv'))
      if (project) {
        const path = window.easyStudio?.media.pathOf(project)
        if (path) void F.openProject(path)
        return
      }
      if (list.length) void L.importDropped(list)
    }
    window.addEventListener('keydown', key)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [])
}

export function App() {
  const busy = useVideo((s) => s.busy)
  useAppEffects()
  useFirstRunTour()
  return (
    <div className="app">
      <TopBar />
      <main className="workspace">
        <Library />
        <Player />
        <Inspector />
        <Timeline />
      </main>
      <Toasts />
      <QuestionDialog />
      <ExportDialog />
      <HelpDialog />
      <ProDialog app="EasyStudio Video" benefits={proBenefits()} />
      <AccountDialog app="EasyStudio Video" />
      <RecoveryBanner />
      <Tour />
      {busy && (
        <div className="busy">
          <div className="busy-box">
            <div className="es-spinner" />
            {busy}
          </div>
        </div>
      )}
    </div>
  )
}
