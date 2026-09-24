import i18next from 'i18next'
import { create } from 'zustand'
import { session, type RecentProject } from '../platform'
import * as E from './editor'
import { loadProjectText, openProject, serialize } from './projectFile'
import { setBusy, toast } from './store'

/** Recent projects and crash recovery (desktop app). */
export interface SessionState {
  recent: RecentProject[]
  recovery: { name: string; filePath: string | null; time: number } | null
}

export const useSession = create<SessionState>(() => ({ recent: [], recovery: null }))
const set = useSession.setState
const t = (k: string, o?: Record<string, unknown>) => i18next.t(k, o) as string

export async function rememberProject(path: string | null): Promise<void> {
  const s = session()
  if (s && path && /[\\/]/.test(path)) set({ recent: await s.recent.add(path) })
}

export async function forgetProject(path: string): Promise<void> {
  const s = session()
  if (s) set({ recent: await s.recent.remove(path) })
}

let lastSaved: unknown = null

/** Write the recovery copy now if the project changed (runs every 30 s). */
export async function autosave(): Promise<void> {
  const s = session()
  const st = E.useEditor.getState()
  const p = st.hist.present.state
  if (!s || !E.isDirty(st) || p === lastSaved || st.gestureBase) return
  lastSaved = p
  await s.autosave.write({ text: serialize(p), name: E.projectName(p), filePath: st.filePath }).catch((e) => console.warn('autosave', e))
}

export async function restoreRecovered(): Promise<void> {
  const s = session()
  const info = useSession.getState().recovery
  if (!s || !info) return
  try {
    setBusy(t('rec.restoring'))
    await loadProjectText(await s.autosave.load(), info.filePath)
    // Still unsaved: keep the warning on close.
    E.useEditor.setState({ savedProject: null })
    set({ recovery: null })
    await s.autosave.discard()
    toast(t('rec.done'), 'success', 5000)
  } catch (e) {
    toast(t('file.openFailed', { msg: (e as Error).message }), 'error', 6000)
  } finally {
    setBusy(null)
  }
}

export async function discardRecovered(): Promise<void> {
  set({ recovery: null })
  await session()?.autosave.discard()
}

async function openPending(): Promise<void> {
  const s = session()
  const path = await s?.pendingOpen()
  if (path) await openProject(path)
}

export function initSession(): void {
  const s = session()
  if (!s) return
  void s.recent.list().then((recent) => set({ recent }))
  void s.autosave.check().then((recovery) => set({ recovery }))
  void openPending()
  s.onPendingOpen(() => void openPending())
  setInterval(() => void autosave(), 30_000)
  // Saved or replaced by another project: this session's copy is not needed any more.
  E.useEditor.subscribe((st, prev) => {
    if (st.savedProject !== prev.savedProject && !E.isDirty(st)) {
      lastSaved = null
      void s.autosave.clear()
    }
  })
}
