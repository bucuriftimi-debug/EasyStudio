import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import * as A from './state/actions'
import * as paint from './state/paint'
import { fitView, isDirty, redo, resetColors, setSettings, setTool, swapColors, undo, useEditor, zoomStep, zoomTo } from './state/store'
import { setDirty, setWindowTitle } from './platform'

const set = useEditor.setState
const get = useEditor.getState

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return (tag === 'INPUT' && (el as HTMLInputElement).type !== 'range') || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/** Keyboard shortcuts (Photoshop-compatible where it makes sense). */
function onKeyDown(e: KeyboardEvent): void {
  const s = get()
  const ctrl = e.ctrlKey || e.metaKey
  const k = e.key.toLowerCase()
  const hasDoc = !!s.hist

  // File shortcuts work everywhere, even while typing.
  if (ctrl && k === 'o') return e.preventDefault(), void A.openDialog()
  if (ctrl && k === 'n') return e.preventDefault(), set({ dialog: 'new' })
  if (ctrl && k === 's' && hasDoc) return e.preventDefault(), void A.saveProject(e.shiftKey)
  if (ctrl && e.shiftKey && k === 'e' && hasDoc) return e.preventDefault(), set({ dialog: 'export' })

  if (isTyping(e) || s.dialog || !hasDoc) return
  // Ignore shortcuts while a stroke is being painted.
  if (paint.isStroking()) return

  if (ctrl && k === 'k') return e.preventDefault(), set({ assistantOpen: 'ask' })
  // The AI bar is open: only viewing shortcuts, so its preview can't be mixed with other edits.
  if (s.assistantOpen && !(ctrl && ['0', '1', '=', '+', '-'].includes(k))) return

  if (ctrl && k === 'z') return e.preventDefault(), e.shiftKey ? redo() : undo()
  if (ctrl && k === 'y') return e.preventDefault(), redo()
  if (ctrl && k === 'j') return e.preventDefault(), void (e.shiftKey ? paint.layerFromSelection(true) : A.duplicateActive())
  if (ctrl && k === 'a') return e.preventDefault(), A.selectAll()
  if (ctrl && k === 'd') return e.preventDefault(), A.deselect()
  if (ctrl && e.shiftKey && k === 'i') return e.preventDefault(), A.invertSelection()
  if (ctrl && k === 'c') return e.preventDefault(), void A.copyToClipboard()
  if (ctrl && k === '0') return e.preventDefault(), fitView(true)
  if (ctrl && k === '1') return e.preventDefault(), zoomTo(1)
  if (ctrl && (k === '=' || k === '+')) return e.preventDefault(), zoomStep(1)
  if (ctrl && k === '-') return e.preventDefault(), zoomStep(-1)
  if (ctrl) return

  if (s.tool === 'crop') {
    if (e.key === 'Enter') return e.preventDefault(), A.applyCrop()
    if (e.key === 'Escape') return e.preventDefault(), A.cancelCrop()
  }
  if (e.key === 'Escape' && s.selection) return A.deselect()
  if (e.shiftKey && e.key === 'F5') return e.preventDefault(), void paint.fillSelected(s.fg)

  // Tools (same letters as Photoshop).
  const toolKeys: Record<string, () => void> = {
    v: () => setTool('move'),
    m: () => (setTool('select'), setSettings({ selectShape: s.tool === 'select' && s.settings.selectShape === 'rect' ? 'ellipse' : 'rect' })),
    l: () => (setTool('select'), setSettings({ selectShape: 'lasso' })),
    w: () => (setTool('select'), setSettings({ selectShape: 'wand' })),
    b: () => setTool('brush'),
    e: () => setTool('eraser'),
    s: () => setTool('clone'),
    r: () => setTool('magic'),
    g: () => (s.tool === 'fill' ? setSettings({ fillKind: s.settings.fillKind === 'bucket' ? 'gradient' : 'bucket' }) : setTool('fill')),
    t: () => setTool('text'),
    u: () => setTool('shape'),
    i: () => setTool('eyedropper'),
    h: () => setTool('hand'),
    c: () => (s.tool === 'crop' ? undefined : A.startCrop()),
    x: () => swapColors(),
    d: () => resetColors()
  }
  if (!e.altKey && toolKeys[k]) return toolKeys[k]()

  // [ and ] change the brush size of the current painting tool.
  if ((e.key === '[' || e.key === ']') && (s.tool === 'brush' || s.tool === 'eraser' || s.tool === 'clone')) {
    const key = `${s.tool}Size` as 'brushSize' | 'eraserSize' | 'cloneSize'
    const cur = s.settings[key]
    const step = Math.max(1, Math.round(cur * 0.15))
    setSettings({ [key]: Math.max(1, Math.min(500, cur + (e.key === ']' ? step : -step))) })
    return
  }
  if (e.key === '\\' && !e.repeat) return set({ compare: true })
  if ((e.key === 'Delete' || e.key === 'Backspace') && (s.selection || s.tool === 'move')) return e.preventDefault(), A.deleteKey()
  if (s.tool === 'move' && e.key.startsWith('Arrow')) {
    e.preventDefault()
    const step = e.shiftKey ? 10 : 1
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
    A.nudgeActive(dx, dy)
  }
}

function onKeyUp(e: KeyboardEvent): void {
  if (e.key === '\\') set({ compare: false })
}

function useDirtyTitle(): string {
  const { t } = useTranslation()
  const name = useEditor((s) => s.hist?.present.state.name)
  const dirty = useEditor((s) => isDirty(s))
  return name ? `${name}${dirty ? ' •' : ''} — ${t('app.name')}` : t('app.name')
}

export function useAppEffects(): void {
  const title = useDirtyTitle()
  const dirty = useEditor((s) => isDirty(s))

  useEffect(() => setWindowTitle(title), [title])
  useEffect(() => setDirty(dirty), [dirty])

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    // Drag & drop files anywhere on the window.
    const over = (e: DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
      document.body.classList.add('dropping')
    }
    const leave = (e: DragEvent) => {
      if (!e.relatedTarget) document.body.classList.remove('dropping')
    }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      document.body.classList.remove('dropping')
      const f = e.dataTransfer?.files?.[0]
      if (!f) return
      if (get().hist && !/\.(esp|psd)$/i.test(f.name)) void A.addImageLayer(f.name, f)
      else void A.openBytes(f.name, f)
    }
    // Paste an image from the clipboard (screenshots, copied pictures).
    const paste = (e: ClipboardEvent) => {
      if (isTyping(e as unknown as KeyboardEvent)) return
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
      const blob = item?.getAsFile()
      if (blob) {
        e.preventDefault()
        void A.pasteImage(blob)
      }
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    window.addEventListener('paste', paste)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
      window.removeEventListener('paste', paste)
    }
  }, [])
}
