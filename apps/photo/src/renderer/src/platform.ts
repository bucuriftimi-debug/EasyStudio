/**
 * Everything that touches the computer (files, window title) goes through here, so the UI
 * also runs in a plain browser (for quick testing) with sensible fallbacks.
 */

import type { AiReply, AiRequest, AiSettings } from '../../shared/aiTools'

export interface OpenedFile {
  name: string
  path: string | null
  data: Uint8Array
}

export interface RecentEntry {
  path: string
  name: string
  time: number
  thumb?: string
}

export interface AutosaveInfo {
  name: string
  filePath: string | null
  time: number
}

export interface FileFilter {
  name: string
  extensions: string[]
}

interface ElectronBridge {
  isElectron: true
  openFile(kind: 'image' | 'project' | 'any'): Promise<OpenedFile | null>
  saveFile(opts: { data: Uint8Array; defaultName: string; filters: FileFilter[]; path?: string | null }): Promise<string | null>
  setTitle(title: string): void
  setDirty(dirty: boolean): void
  appInfo(): Promise<{ version: string; dataDir: string }>
  hasModel(file: string): Promise<boolean>
  ensureModel(file: string, url: string): Promise<string>
  onModelProgress(cb: (p: { file: string; received: number; total: number }) => void): () => void
  setLang(lang: string): void
  recent: {
    list(): Promise<RecentEntry[]>
    add(path: string, thumb?: string): Promise<RecentEntry[]>
    remove(path: string): Promise<RecentEntry[]>
    clear(): Promise<RecentEntry[]>
    read(path: string): Promise<OpenedFile>
  }
  pendingOpen(): Promise<OpenedFile | null>
  onPendingOpen(cb: () => void): () => void
  autosave: {
    write(a: { data: Uint8Array; name: string; filePath: string | null }): Promise<void>
    check(): Promise<AutosaveInfo | null>
    load(): Promise<Uint8Array>
    clear(): Promise<void>
    /** Delete the copy left by a crashed session. */
    discard(): Promise<void>
  }
  ai: {
    settings(): Promise<AiSettings>
    setSettings(patch: Partial<Omit<AiSettings, 'keys'>>): Promise<AiSettings>
    setKey(provider: 'claude' | 'openai' | 'gemini', key: string | null): Promise<AiSettings>
    ask(req: AiRequest): Promise<AiReply>
    test(): Promise<{ model: string; text: string }>
    fill(req: { prompt: string; image: string; mask: string; size: string; area: string }): Promise<string>
    ollamaModels(): Promise<string[]>
  }
}

/** Desktop-only services (recent files, crash recovery, files from Windows); null in a browser. */
export const desktop = (): Pick<ElectronBridge, 'recent' | 'pendingOpen' | 'onPendingOpen' | 'autosave' | 'setLang'> | null => bridge ?? null

/** Cloud AI bridge (desktop app only). */
export const cloudAi = (): ElectronBridge['ai'] | null => bridge?.ai ?? null

/** Electron prefixes errors thrown in the main process; keep only the useful message. */
export function cleanError(e: unknown): string {
  return String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

declare global {
  interface Window {
    easyStudio?: ElectronBridge
  }
}

const bridge = window.easyStudio

export const isElectron = !!bridge

const ACCEPT: Record<'image' | 'project' | 'any', string> = {
  image: 'image/*,.psd',
  project: '.esp',
  any: 'image/*,.esp,.psd'
}

export async function openFile(kind: 'image' | 'project' | 'any'): Promise<OpenedFile | null> {
  if (bridge) return bridge.openFile(kind)
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = ACCEPT[kind]
    input.onchange = async () => {
      const f = input.files?.[0]
      resolve(f ? { name: f.name, path: null, data: new Uint8Array(await f.arrayBuffer()) } : null)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

/** Save bytes. In Electron: native dialog (or silent overwrite if `path` is given). */
export async function saveFile(data: Uint8Array | Blob, defaultName: string, filters: FileFilter[], path?: string | null): Promise<string | null> {
  const bytes = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data
  if (bridge) return bridge.saveFile({ data: bytes, defaultName, filters, path })
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]))
  const a = document.createElement('a')
  a.href = url
  a.download = defaultName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return defaultName
}

export function setWindowTitle(title: string): void {
  if (bridge) bridge.setTitle(title)
  else document.title = title
}

export function setDirty(dirty: boolean): void {
  bridge?.setDirty(dirty)
}

/** Is an AI model already on this computer? (In a plain browser we can't know: assume not.) */
export async function hasModel(file: string): Promise<boolean> {
  return bridge ? bridge.hasModel(file) : false
}

/**
 * Make sure a model is available and return a URL to load it from. In Electron the model is
 * downloaded once into the app's data folder (on E:); in a plain browser it is fetched directly.
 */
export async function ensureModel(file: string, url: string, onProgress: (received: number, total: number) => void): Promise<string> {
  if (!bridge) return url
  const off = bridge.onModelProgress((p) => p.file === file && onProgress(p.received, p.total))
  try {
    return await bridge.ensureModel(file, url)
  } finally {
    off()
  }
}

export function fileExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i + 1).toLowerCase()
}

export function baseName(name: string): string {
  const slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'))
  const n = name.slice(slash + 1)
  const i = n.lastIndexOf('.')
  return i <= 0 ? n : n.slice(0, i)
}
