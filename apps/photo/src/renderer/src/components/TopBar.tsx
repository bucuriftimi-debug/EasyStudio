import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Eraser, ImagePlus, Info, Lightbulb, Maximize2, MessageSquareText, MousePointerClick, Redo2, Scissors, Settings2, Sparkles, Undo2, UserRound, WandSparkles } from 'lucide-react'
import { Button, Menu, Segmented, type MenuItem } from '@easystudio/ui'
import { canRedo, canUndo } from '@easystudio/core'
import * as A from '../state/actions'
import * as paint from '../state/paint'
import * as AI from '../state/ai'
import * as F from '../state/files'
import { LANGUAGES } from './LanguageSwitch'
import { activeLayer } from '../state/docOps'
import { fitView, isDirty, redo, setMode, setSettings, setTool, undo, useDoc, useEditor, zoomStep, zoomTo } from '../state/store'
import type { Mode } from '../state/types'

const set = useEditor.setState

export function TopBar() {
  const { t } = useTranslation()
  const hasDoc = useEditor((s) => !!s.hist)
  const name = useEditor((s) => s.hist?.present.state.name)
  const dirty = useEditor((s) => isDirty(s))
  const mode = useEditor((s) => s.mode)
  const undoOk = useEditor((s) => !!s.hist && canUndo(s.hist))
  const redoOk = useEditor((s) => !!s.hist && canRedo(s.hist))

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="logo" aria-hidden>
          <span />
        </div>
        <MenuBar hasDoc={hasDoc} />
      </div>
      <div className="topbar-center">
        {name && (
          <span className="doc-title">
            {name}
            {dirty && <i className="dirty-dot" title={t('top.unsaved')} />}
          </span>
        )}
      </div>
      <div className="topbar-right">
        {hasDoc && (
          <>
            <AiMenu />
            <Segmented<Mode>
              value={mode}
              onChange={setMode}
              options={[
                { value: 'simple', label: t('mode.simple'), tip: t('mode.simpleTip') },
                { value: 'pro', label: t('mode.pro'), tip: t('mode.proTip') }
              ]}
            />
            <div className="divider" />
            <Button icon variant="ghost" tip={t('top.undo')} disabled={!undoOk} onClick={undo}>
              <Undo2 size={17} />
            </Button>
            <Button icon variant="ghost" tip={t('top.redo')} disabled={!redoOk} onClick={redo}>
              <Redo2 size={17} />
            </Button>
            <Button variant="primary" onClick={() => set({ dialog: 'export' })}>
              <Download size={16} />
              {t('top.export')}
            </Button>
          </>
        )}
      </div>
    </header>
  )
}

/** The "AI" button: every smart tool in one easy place. */
function AiMenu() {
  const { t } = useTranslation()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const hasSel = useEditor((s) => !!s.selection)
  const doc = useDoc()
  const act = doc ? activeLayer(doc) : undefined
  const raster = act?.type === 'raster'
  const items: MenuItem[] = [
    { label: t('assist.askMenu'), icon: <MessageSquareText />, kbd: 'Ctrl+K', onClick: () => set({ assistantOpen: 'ask' }) },
    { label: t('assist.suggestMenu'), icon: <Lightbulb />, onClick: () => set({ assistantOpen: 'suggest' }) },
    { label: t('assist.fillMenu'), icon: <ImagePlus />, disabled: !hasSel, onClick: () => set({ dialog: 'genfill' }) },
    { separator: true },
    { label: t('ai.removeBg'), icon: <Scissors />, disabled: !raster, onClick: () => void AI.removeBackground() },
    { label: t('ai.selectSubject'), icon: <UserRound />, onClick: () => void AI.selectSubject() },
    {
      label: t('ai.selectObject'),
      icon: <MousePointerClick />,
      onClick: () => {
        setSettings({ selectShape: 'object' })
        setTool('select')
      }
    },
    { separator: true },
    { label: t('ai.eraseObject'), icon: <WandSparkles />, kbd: 'R', disabled: !raster, onClick: () => setTool('magic') },
    { label: t('ai.eraseSelection'), icon: <Eraser />, disabled: !raster || !hasSel, onClick: () => void AI.eraseObject([], 0) },
    { separator: true },
    { label: t('ai.upscale2'), icon: <Maximize2 />, disabled: !raster || !AI.canUpscale(2), onClick: () => void AI.upscale(2) },
    { label: t('ai.upscale4'), icon: <Maximize2 />, disabled: !raster || !AI.canUpscale(4), onClick: () => void AI.upscale(4) },
    { separator: true },
    { label: t('assist.settingsMenu'), icon: <Settings2 />, onClick: () => set({ dialog: 'aisettings' }) },
    { label: t('ai.about'), icon: <Info />, onClick: () => set({ dialog: 'about' }) }
  ]
  return (
    <>
      <Button variant="outline" className="ai-btn" tip={t('ai.menuTip')} onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}>
        <Sparkles size={15} /> {t('ai.menu')}
      </Button>
      {anchor && <Menu anchor={anchor} items={items} onClose={() => setAnchor(null)} />}
    </>
  )
}

function MenuBar({ hasDoc }: { hasDoc: boolean }) {
  const { t, i18n } = useTranslation()
  const recent = useEditor((s) => s.recent)
  const [open, setOpen] = useState<{ id: string; el: HTMLElement } | null>(null)
  const nd = !hasDoc
  const hasSel = useEditor((s) => !!s.selection)
  const doc = useDoc()
  const act = doc ? activeLayer(doc) : undefined

  const menus: { id: string; label: string; items: MenuItem[] }[] = [
    {
      id: 'file',
      label: t('menu.file'),
      items: [
        { label: t('menu.new'), kbd: 'Ctrl+N', onClick: () => set({ dialog: 'new' }) },
        { label: t('menu.open'), kbd: 'Ctrl+O', onClick: () => void A.openDialog() },
        ...(recent.length
          ? [
              { separator: true },
              { label: t('recent.title'), disabled: true },
              ...recent.slice(0, 6).map((r) => ({ label: `   ${r.name}`, onClick: () => void F.openRecent(r.path) }))
            ]
          : []),
        { separator: true },
        { label: t('menu.save'), kbd: 'Ctrl+S', disabled: nd, onClick: () => void A.saveProject() },
        { label: t('menu.saveAs'), kbd: 'Ctrl+Shift+S', disabled: nd, onClick: () => void A.saveProject(true) },
        { label: t('menu.export'), kbd: 'Ctrl+Shift+E', disabled: nd, onClick: () => set({ dialog: 'export' }) },
        { separator: true },
        { label: t('menu.close'), disabled: nd, onClick: A.closeDoc }
      ]
    },
    {
      id: 'edit',
      label: t('menu.edit'),
      items: [
        { label: t('menu.undo'), kbd: 'Ctrl+Z', disabled: nd, onClick: undo },
        { label: t('menu.redo'), kbd: 'Ctrl+Shift+Z', disabled: nd, onClick: redo },
        { separator: true },
        { label: t('menu.copy'), kbd: 'Ctrl+C', disabled: nd, onClick: () => void A.copyToClipboard() },
        {
          label: t('menu.paste'),
          kbd: 'Ctrl+V',
          onClick: async () => {
            try {
              for (const item of await navigator.clipboard.read()) {
                const type = item.types.find((ty) => ty.startsWith('image/'))
                if (type) return void A.pasteImage(await item.getType(type))
              }
            } catch {
              /* clipboard permission denied — Ctrl+V still works */
            }
          }
        },
        { separator: true },
        { label: t('menu.clear'), kbd: 'Del', disabled: nd || !hasSel, onClick: A.deleteKey },
        { label: t('menu.fillFg'), kbd: 'Shift+F5', disabled: nd || !hasSel, onClick: () => paint.fillSelected(useEditor.getState().fg) },
        { label: t('menu.copyLayer'), kbd: 'Ctrl+J', disabled: nd || !hasSel, onClick: () => paint.layerFromSelection(false) },
        { label: t('menu.cutLayer'), kbd: 'Ctrl+Shift+J', disabled: nd || !hasSel, onClick: () => paint.layerFromSelection(true) }
      ]
    },
    {
      id: 'select',
      label: t('menu.select'),
      items: [
        { label: t('menu.selectAll'), kbd: 'Ctrl+A', disabled: nd, onClick: A.selectAll },
        { label: t('menu.deselect'), kbd: 'Ctrl+D', disabled: nd || !hasSel, onClick: A.deselect },
        { label: t('menu.invert'), kbd: 'Ctrl+Shift+I', disabled: nd, onClick: A.invertSelection },
        { separator: true },
        { label: t('menu.feather'), disabled: nd || !hasSel, onClick: () => set({ dialog: 'selmodify' }) },
        { separator: true },
        { label: t('menu.cropToSel'), disabled: nd || !hasSel, onClick: A.cropToSelection }
      ]
    },
    {
      id: 'image',
      label: t('menu.image'),
      items: [
        { label: t('menu.resize'), disabled: nd, onClick: () => set({ dialog: 'resize' }) },
        { label: t('menu.canvasSize'), disabled: nd, onClick: () => set({ dialog: 'canvas' }) },
        { label: t('menu.crop'), kbd: 'C', disabled: nd, onClick: () => A.startCrop() },
        { separator: true },
        { label: t('menu.rotateCw'), disabled: nd, onClick: () => A.rotateImage(true) },
        { label: t('menu.rotateCcw'), disabled: nd, onClick: () => A.rotateImage(false) },
        { label: t('menu.flipH'), disabled: nd, onClick: () => A.flipImage('h') },
        { label: t('menu.flipV'), disabled: nd, onClick: () => A.flipImage('v') }
      ]
    },
    {
      id: 'layer',
      label: t('menu.layer'),
      items: [
        { label: t('menu.addImage'), disabled: nd, onClick: () => void A.addImageLayerDialog() },
        { label: t('menu.addText'), kbd: 'T', disabled: nd, onClick: () => A.addText() },
        { label: t('menu.newLayer'), disabled: nd, onClick: A.newEmptyLayer },
        { label: t('menu.duplicate'), kbd: 'Ctrl+J', disabled: nd, onClick: A.duplicateActive },
        { label: t('menu.delete'), disabled: nd, onClick: A.deleteActive },
        { separator: true },
        { label: t('menu.moveUp'), disabled: nd, onClick: () => A.moveActive(1) },
        { label: t('menu.moveDown'), disabled: nd, onClick: () => A.moveActive(-1) },
        { separator: true },
        { label: t('menu.rasterize'), disabled: nd || !act || act.type === 'raster', onClick: A.rasterizeActive },
        { label: t('menu.addMask'), disabled: nd || !act || !!act.mask, onClick: A.addMask },
        { label: t('menu.toggleMask'), disabled: nd || !act?.mask, onClick: A.toggleMask },
        { label: t('menu.applyMask'), disabled: nd || !act?.mask || act.type !== 'raster', onClick: A.applyMask },
        { label: t('menu.deleteMask'), disabled: nd || !act?.mask, onClick: A.deleteMask }
      ]
    },
    {
      id: 'view',
      label: t('menu.view'),
      items: [
        { label: t('menu.zoomIn'), kbd: 'Ctrl++', disabled: nd, onClick: () => zoomStep(1) },
        { label: t('menu.zoomOut'), kbd: 'Ctrl+-', disabled: nd, onClick: () => zoomStep(-1) },
        { label: t('menu.fit'), kbd: 'Ctrl+0', disabled: nd, onClick: () => fitView(true) },
        { label: t('menu.actual'), kbd: 'Ctrl+1', disabled: nd, onClick: () => zoomTo(1) },
        { separator: true },
        { label: t('menu.compare'), kbd: '\\', disabled: nd, onClick: () => set((s) => ({ compare: !s.compare })) }
      ]
    },
    {
      id: 'help',
      label: t('menu.help'),
      items: [
        { label: t('menu.tips'), disabled: nd, onClick: () => set({ tour: 0 }) },
        { label: t('menu.shortcuts'), onClick: () => set({ dialog: 'about' }) },
        { separator: true },
        ...LANGUAGES.map((l) => ({ label: l.label, kbd: i18n.language === l.value ? '✓' : undefined, onClick: () => void i18n.changeLanguage(l.value) })),
        { separator: true },
        { label: t('menu.about'), onClick: () => set({ dialog: 'about' }) }
      ]
    }
  ]

  return (
    <nav className="menubar">
      {menus.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`menubar-item${open?.id === m.id ? ' open' : ''}`}
          onClick={(e) => setOpen(open?.id === m.id ? null : { id: m.id, el: e.currentTarget })}
          onPointerEnter={(e) => open && open.id !== m.id && setOpen({ id: m.id, el: e.currentTarget })}
        >
          {m.label}
        </button>
      ))}
      {open && <Menu anchor={open.el} items={menus.find((m) => m.id === open.id)!.items} onClose={() => setOpen(null)} />}
    </nav>
  )
}
