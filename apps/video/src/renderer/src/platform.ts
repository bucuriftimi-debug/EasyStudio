/**
 * Everything that touches the computer goes through here, so the UI also runs in a plain
 * browser (for quick testing) with sensible fallbacks.
 */

export interface MediaFile {
  id: string
  path: string
  name: string
  size: number
  kind: 'video' | 'audio' | 'image'
}

export interface RecentProject {
  path: string
  name: string
  time: number
}

export interface FileFilter {
  name: string
  extensions: string[]
}

interface ElectronBridge {
  isElectron: true
  setTitle(title: string): void
  setDirty(dirty: boolean): void
  setLang(lang: string): void
  appInfo(): Promise<{ version: string; dataDir: string }>
  saveFile(opts: { data: Uint8Array; defaultName: string; filters: FileFilter[]; path?: string | null }): Promise<string | null>
  openProject(path?: string | null): Promise<{ path: string; name: string; text: string } | null>
  exportFile: {
    pick(defaultName: string, format: 'mp4' | 'webm'): Promise<string | null>
    open(path: string): Promise<number>
    write(id: number, position: number, data: Uint8Array): Promise<void>
    close(id: number, keep: boolean): Promise<void>
    reveal(path: string): Promise<void>
  }
  recent: {
    list(): Promise<RecentProject[]>
    add(path: string): Promise<RecentProject[]>
    remove(path: string): Promise<RecentProject[]>
  }
  pendingOpen(): Promise<string | null>
  onPendingOpen(cb: () => void): () => void
  autosave: {
    write(a: { text: string; name: string; filePath: string | null }): Promise<void>
    check(): Promise<{ name: string; filePath: string | null; time: number } | null>
    load(): Promise<string>
    discard(): Promise<void>
    clear(): Promise<void>
  }
  media: {
    pick(): Promise<MediaFile[]>
    register(paths: string[]): Promise<MediaFile[]>
    read(id: string, start: number, end: number): Promise<Uint8Array>
    pathOf(file: File): string
  }
}

declare global {
  interface Window {
    easyStudio?: ElectronBridge
  }
}

const bridge = window.easyStudio
export const isElectron = !!bridge

/* Browser fallback: files picked with <input> are read straight from the File object. */
const browserFiles = new Map<string, File>()
let browserId = 1

function browserKind(f: File): MediaFile['kind'] {
  if (f.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|opus|flac)$/i.test(f.name)) return 'audio'
  if (f.type.startsWith('image/')) return 'image'
  return 'video'
}

function fromBrowserFile(f: File): MediaFile {
  const id = `b${browserId++}`
  browserFiles.set(id, f)
  return { id, path: f.name, name: f.name, size: f.size, kind: browserKind(f) }
}

export async function pickMedia(): Promise<MediaFile[]> {
  if (bridge) return bridge.media.pick()
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = 'video/*,audio/*,image/*'
    input.onchange = () => resolve([...(input.files ?? [])].map(fromBrowserFile))
    input.oncancel = () => resolve([])
    input.click()
  })
}

/** Files dropped on the window. */
export async function registerDropped(files: File[]): Promise<MediaFile[]> {
  if (!bridge) return files.map(fromBrowserFile)
  const paths = files.map((f) => bridge.media.pathOf(f)).filter(Boolean)
  return bridge.media.register(paths)
}

/** Files referenced by path (projects, tests). Desktop only. */
export async function registerPaths(paths: string[]): Promise<MediaFile[]> {
  return bridge ? bridge.media.register(paths) : []
}

/** Bytes [start, end) of a media file. */
export async function readMedia(file: MediaFile, start: number, end: number): Promise<Uint8Array> {
  if (bridge && !browserFiles.has(file.id)) return bridge.media.read(file.id, start, end)
  const f = browserFiles.get(file.id)
  if (!f) throw new Error('File is not available')
  return new Uint8Array(await f.slice(start, end).arrayBuffer())
}

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

export function setLang(lang: string): void {
  bridge?.setLang(lang)
}

/** Pick and read a project file (.esv). Browser: a file input (media paths then cannot be reopened). */
export async function openProjectFile(path?: string | null): Promise<{ path: string | null; name: string; text: string } | null> {
  if (bridge) return bridge.openProject(path)
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.esv'
    input.onchange = async () => {
      const f = input.files?.[0]
      resolve(f ? { path: null, name: f.name, text: await f.text() } : null)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

/** Writing an export to disk piece by piece (desktop app only). */
export const exportFile = () => bridge?.exportFile ?? null

/** Recent projects, crash recovery, files from Windows (desktop app only). */
export const session = () => (bridge ? { recent: bridge.recent, pendingOpen: bridge.pendingOpen, onPendingOpen: bridge.onPendingOpen, autosave: bridge.autosave } : null)

export const appInfo = () => bridge?.appInfo() ?? Promise.resolve({ version: 'web', dataDir: '' })
