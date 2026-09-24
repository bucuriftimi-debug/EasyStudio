import i18next from 'i18next'
import { buildScene, getRenderer, maxImageSize, syncSources } from '../gpuHost'
import { cleanError, desktop } from '../platform'
import { openBytes } from './actions'
import { readProject, writeProject } from './project'
import { getDoc, isDirty, openDocument, setBusy, toast, useEditor } from './store'
import type { PhotoDoc } from './types'

/**
 * Recent files, crash recovery (autosave) and files handed over by Windows. All of it is
 * desktop-only; in a plain browser these functions simply do nothing.
 */

const t = (k: string, o?: Record<string, unknown>) => i18next.t(k, o) as string
const set = useEditor.setState

/* ------------------------------ recent files ------------------------------ */

/** Small JPEG of the document (with all edits) for the Recent list. */
export async function docThumbnail(doc: PhotoDoc, maxSide = 240): Promise<string | undefined> {
  const r = getRenderer()
  if (!r) return undefined
  syncSources(r, doc)
  const k = Math.min(1, maxSide / Math.max(doc.width, doc.height))
  const w = Math.max(1, Math.round(doc.width * k))
  const h = Math.max(1, Math.round(doc.height * k))
  const px = r.exportPixels(buildScene(doc), w, h, [0.12, 0.13, 0.15])
  const c = new OffscreenCanvas(w, h)
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px.data.buffer), w, h), 0, 0)
  const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.8 })
  return new Promise((resolve) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => resolve(undefined)
    fr.readAsDataURL(blob)
  })
}

export async function loadRecent(): Promise<void> {
  const d = desktop()
  if (d) set({ recent: await d.recent.list() })
}

/** Put a file on top of the Recent list (after the editor has drawn it, for the thumbnail). */
export function rememberFile(path: string | null): void {
  const d = desktop()
  if (!d || !path || !/[\\/]/.test(path)) return
  setTimeout(async () => {
    const doc = getDoc()
    let thumb: string | undefined
    try {
      thumb = doc ? await docThumbnail(doc) : undefined
    } catch {
      thumb = undefined
    }
    set({ recent: await d.recent.add(path, thumb) })
  }, 700)
}

export async function openRecent(path: string): Promise<void> {
  const d = desktop()
  if (!d) return
  let file
  try {
    file = await d.recent.read(path)
  } catch {
    toast(t('recent.missing'), 'error', 5000)
    set({ recent: await d.recent.remove(path) })
    return
  }
  await openBytes(file.name, file.data, file.path)
}

export async function forgetRecent(path: string | null): Promise<void> {
  const d = desktop()
  if (d) set({ recent: path ? await d.recent.remove(path) : await d.recent.clear() })
}

/* ------------------------------ files from Windows ------------------------------ */

async function openPending(): Promise<void> {
  const d = desktop()
  if (!d) return
  try {
    const f = await d.pendingOpen()
    if (f) await openBytes(f.name, f.data, f.path)
  } catch (e) {
    toast(cleanError(e), 'error', 5000)
  }
}

/* ------------------------------ crash recovery ------------------------------ */

const AUTOSAVE_EVERY = 60_000
const pngCache = new Map<string, Uint8Array>()
let lastAutosaved: PhotoDoc | null = null
let writing = false

/** Write the crash-recovery copy now if the document changed (runs every minute). */
export async function autosaveTick(): Promise<void> {
  const d = desktop()
  const s = useEditor.getState()
  const doc = getDoc()
  if (!d || !doc || writing || !isDirty(s) || doc === lastAutosaved || s.gestureBase || s.busy) return
  writing = true
  try {
    await d.autosave.write({ data: await writeProject(doc, pngCache), name: doc.name, filePath: s.filePath })
    lastAutosaved = doc
  } catch (e) {
    console.warn('autosave failed', e)
  } finally {
    writing = false
  }
}

function forgetAutosave(): void {
  lastAutosaved = null
  pngCache.clear()
  void desktop()?.autosave.clear()
}

export async function restoreRecovered(): Promise<void> {
  const d = desktop()
  const info = useEditor.getState().recovery
  if (!d || !info) return
  try {
    setBusy(t('recover.restoring'))
    const doc = await readProject(await d.autosave.load(), maxImageSize())
    openDocument(doc, t('recover.history'), info.filePath)
    // Still unsaved: keep the "unsaved changes" dot and the warning on close.
    set({ savedDoc: null, recovery: null })
    await d.autosave.discard()
    toast(t('recover.done'), 'success', 5000)
  } catch (e) {
    toast(t('msg.openFailed', { msg: cleanError(e) }), 'error', 6000)
  } finally {
    setBusy(null)
  }
}

export async function discardRecovered(): Promise<void> {
  set({ recovery: null })
  await desktop()?.autosave.discard()
}

/** Start everything once, when the app starts. */
export function initFiles(): void {
  const d = desktop()
  if (!d) return
  void loadRecent()
  void d.autosave.check().then((recovery) => set({ recovery }))
  void openPending()
  d.onPendingOpen(() => void openPending())
  setInterval(() => void autosaveTick(), AUTOSAVE_EVERY)
  // Saved, closed, or replaced by another document: this session's copy is not needed any more.
  useEditor.subscribe((s, prev) => {
    if (s.hist === prev.hist && s.savedDoc === prev.savedDoc) return
    if ((!s.hist && prev.hist) || (s.hist && !isDirty(s) && isDirty(prev))) forgetAutosave()
  })
}
