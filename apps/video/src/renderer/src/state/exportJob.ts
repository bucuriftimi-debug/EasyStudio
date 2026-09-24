import i18next from 'i18next'
import { create } from 'zustand'
import { engine } from '../engine/engine'
import { ExportCancelled, exportVideo, type ExportProgress, type ExportSettings } from '../engine/exporter'
import { exportFile } from '../platform'
import { compose, getProject, projectName } from './editor'
import * as P from './project'
import { lockedReason, needsWatermark, requirePro } from './pro'

/** The export window and the running export. */
export interface ExportState {
  open: boolean
  status: 'setup' | 'running' | 'done' | 'error'
  progress: ExportProgress | null
  path: string | null
  error: string | null
}

export const useExport = create<ExportState>(() => ({ open: false, status: 'setup', progress: null, path: null, error: null }))
const set = useExport.setState

let abort: AbortController | null = null

export function openExport(): void {
  engine.pause()
  set({ open: true, status: 'setup', progress: null, path: null, error: null })
}

export function closeExport(): void {
  if (useExport.getState().status === 'running') return
  set({ open: false })
}

/** Frame sizes for the project's shape: the short side is 720, 1080, 1440 or 2160 pixels. */
export function sizesFor(p: P.Project): { id: string; w: number; h: number }[] {
  const even = (v: number) => Math.round(v / 2) * 2
  return [720, 1080, 1440, 2160].map((short) => {
    const k = short / Math.min(p.width, p.height)
    return { id: String(short), w: even(p.width * k), h: even(p.height * k) }
  })
}

/**
 * Run an export to `path` (the desktop app asks where first). Resolves when done;
 * the UI follows `useExport`.
 */
export async function runExport(settings: ExportSettings, path?: string | null): Promise<boolean> {
  const io = exportFile()
  if (!io) {
    set({ status: 'error', error: i18next.t('exp.desktopOnly') })
    return false
  }
  const locked = lockedReason(settings)
  if (locked && !requirePro(locked)) return false
  const p = getProject()
  const target = path ?? (await io.pick(`${projectName(p)}.${settings.format}`, settings.format))
  if (!target) return false
  const k = Math.min(settings.width / p.width, settings.height / p.height)
  const comp = compose(p, Math.max(1, k))
  abort = new AbortController()
  set({ status: 'running', progress: null, path: target, error: null })
  let id: number | null = null
  try {
    id = await io.open(target)
    const fid = id
    let last = 0
    await exportVideo(
      comp,
      settings,
      { write: (pos, data) => io.write(fid, pos, data) },
      (pr) => {
        const now = performance.now()
        if (now - last > 100 || pr.frame === pr.frames) {
          last = now
          set({ progress: pr })
        }
      },
      abort.signal,
      needsWatermark(settings)
    )
    await io.close(fid, true)
    set({ status: 'done' })
    return true
  } catch (e) {
    if (id !== null) await io.close(id, false).catch(() => undefined)
    if (e instanceof ExportCancelled) {
      set({ status: 'setup', progress: null })
      return false
    }
    console.error(e)
    const msg = (e as Error).message === 'video-encoder' ? i18next.t('exp.noEncoder') : String((e as Error).message ?? e)
    set({ status: 'error', error: msg })
    return false
  } finally {
    abort = null
  }
}

export function cancelExport(): void {
  abort?.abort()
}
