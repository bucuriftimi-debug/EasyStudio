import i18next from 'i18next'
import { engine } from '../engine/engine'
import { openProjectFile, saveFile } from '../platform'
import * as E from './editor'
import { importPaths } from './library'
import * as P from './project'
import { ask, setBusy, toast, useVideo } from './store'

/**
 * Project files (.esv): JSON with the timeline and the paths of the files it uses. The media
 * ids of a session are not stable, so clips are saved with the index of their file.
 */

const t = (k: string, o?: Record<string, unknown>) => i18next.t(k, o) as string
const FORMAT = 'easystudio-video'
const VERSION = 1

interface SavedFile {
  format: string
  version: number
  project: P.Project
  media: { key: string; path: string; name: string }[]
}

export function serialize(p: P.Project): string {
  const media = useVideo.getState().media
  // Titles have no file (mediaId '').
  const used = [...new Set(p.tracks.flatMap((tr) => tr.clips.filter((c) => c.mediaId).map((c) => c.mediaId)))]
  const list = used.map((id, i) => {
    const m = media.find((x) => x.id === id)
    return { key: `f${i}`, path: m?.file.path ?? '', name: m?.name ?? '' }
  })
  const keyOf = new Map(used.map((id, i) => [id, `f${i}`]))
  const project: P.Project = { ...p, tracks: p.tracks.map((tr) => ({ ...tr, clips: tr.clips.map((c) => ({ ...c, mediaId: c.mediaId ? keyOf.get(c.mediaId)! : '' })) })) }
  const out: SavedFile = { format: FORMAT, version: VERSION, project, media: list }
  return JSON.stringify(out, null, 1)
}

async function confirmDiscard(): Promise<boolean> {
  return !E.isDirty() || ask(t('file.discard'), t('file.discardYes'), t('file.cancel'))
}

export async function saveProject(saveAs = false): Promise<boolean> {
  const s = E.useEditor.getState()
  const p = E.getProject()
  const data = new TextEncoder().encode(serialize(p))
  const path = await saveFile(data, `${E.projectName(p)}.esv`, [{ name: t('file.projectType'), extensions: ['esv'] }], saveAs ? null : s.filePath)
  if (!path) return false
  const name = path.replace(/^.*[\\/]/, '').replace(/\.esv$/i, '')
  if (name && name !== p.name) {
    // Keep the project name in step with the file name, without an undo step.
    const h = s.hist
    const renamed = { ...h.present.state, name }
    E.useEditor.setState({ hist: { ...h, present: { ...h.present, state: renamed } } })
  }
  E.markSaved(/[\\/]/.test(path) ? path : null)
  void import('./session').then((S) => S.rememberProject(path))
  toast(t('file.saved'), 'success')
  return true
}

/** Read a saved project: register its files again and point the clips at them. */
export async function loadProjectText(text: string, path: string | null): Promise<void> {
  const saved = JSON.parse(text) as SavedFile
  if (saved.format !== FORMAT || !saved.project) throw new Error(t('file.notProject'))
  if (saved.version > VERSION) throw new Error(t('file.newer'))
  const infos = await importPaths(saved.media.map((m) => m.path).filter(Boolean))
  const byPath = new Map(infos.map((m) => [m.file.path.toLowerCase(), m.id]))
  // Files already in the library (imported earlier this session).
  for (const m of useVideo.getState().media) byPath.set(m.file.path.toLowerCase(), m.id)
  const idOf = new Map(saved.media.map((m) => [m.key, byPath.get(m.path.toLowerCase()) ?? null]))
  const missing = saved.media.filter((m) => !idOf.get(m.key))
  const project: P.Project = P.upgradeProject({
    ...saved.project,
    tracks: saved.project.tracks.map((tr) => ({ ...tr, clips: tr.clips.map((c) => ({ ...c, mediaId: c.mediaId ? (idOf.get(c.mediaId) ?? `missing:${c.mediaId}`) : '' })) }))
  })
  E.loadProject(project, path)
  if (missing.length) toast(t('file.missing', { names: missing.map((m) => m.name).join(', ') }), 'error', 8000)
}

export async function openProject(path?: string | null): Promise<void> {
  if (!(await confirmDiscard())) return
  const f = await openProjectFile(path)
  if (!f) return
  try {
    setBusy(t('file.opening'))
    await loadProjectText(f.text, f.path)
    void import('./session').then((S) => S.rememberProject(f.path))
    toast(t('file.opened', { name: f.name }))
  } catch (e) {
    toast(t('file.openFailed', { msg: (e as Error).message }), 'error', 6000)
  } finally {
    setBusy(null)
  }
}

export async function newProject(): Promise<void> {
  if (!(await confirmDiscard())) return
  E.loadProject(P.newProject(''), null)
  E.useEditor.setState({ savedProject: null })
  engine.seek(0)
}
