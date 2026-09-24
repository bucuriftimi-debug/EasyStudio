import { ipcMain, type BrowserWindow } from 'electron'
import { existsSync, rmSync, statSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, normalize } from 'node:path'
import { tr } from './lang'

/**
 * Files the app remembers: the "Recent" list (with small thumbnails), the automatic
 * crash-recovery copy of the open document, and files handed over by Windows
 * (double-click on a .esp / picture, "Open with…").
 */

export const OPENABLE = ['esp', 'psd', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'avif']

export interface RecentEntry {
  path: string
  name: string
  time: number
  /** Small JPEG as a data: URL. */
  thumb?: string
}

const MAX_RECENT = 12
const MAX_THUMB = 200_000

let recentFile = ''
let autosaveDir = ''
let recent: RecentEntry[] = []
/** Paths the page may read without a dialog: recent files and files given on the command line. */
const allowed = new Set<string>()
let pending: string | null = null

const key = (p: string) => normalize(p).toLowerCase()

async function saveRecent(): Promise<void> {
  await writeFile(recentFile, JSON.stringify(recent, null, 1))
}

/** A path from the command line (or a second launch) that the app can open, if any. */
export function fileFromArgv(argv: string[]): string | null {
  for (let i = argv.length - 1; i > 0; i--) {
    const a = argv[i]
    if (a.startsWith('--') || !isAbsolute(a)) continue
    if (OPENABLE.includes(extname(a).slice(1).toLowerCase()) && existsSync(a) && statSync(a).isFile()) return a
  }
  return null
}

/** Remember a file handed over by Windows; the page picks it up with `app:pending-open`. */
export function setPendingOpen(path: string, win: BrowserWindow | null): void {
  allowed.add(key(path))
  pending = path
  win?.webContents.send('app:open-pending')
}

const CURRENT = ['current.esp', 'current.json']
const RECOVERED = ['recovered.esp', 'recovered.json']

/** Forget this session's recovery copy (the document was saved, closed or deliberately discarded). */
export function clearAutosave(): void {
  // Synchronous: this also runs while the window is closing.
  if (autosaveDir) for (const f of CURRENT) rmSync(join(autosaveDir, f), { force: true })
}

async function readAllowed(path: string) {
  if (!allowed.has(key(path)) && !recent.some((r) => key(r.path) === key(path))) throw new Error(tr('openWithDialog'))
  const data = await readFile(path)
  return { path, name: basename(path), data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) }
}

/**
 * `startSession`: a copy left by the previous session means it crashed; keep it aside as
 * "recovered" so this session's own autosaves can never overwrite it.
 */
export async function registerFiles(dataDir: string, startSession: boolean): Promise<void> {
  recentFile = join(dataDir, 'recent.json')
  autosaveDir = join(dataDir, 'autosave')
  if (startSession && existsSync(join(autosaveDir, CURRENT[0])) && existsSync(join(autosaveDir, CURRENT[1]))) {
    await rename(join(autosaveDir, CURRENT[0]), join(autosaveDir, RECOVERED[0]))
    await rename(join(autosaveDir, CURRENT[1]), join(autosaveDir, RECOVERED[1]))
  }
  try {
    const list = JSON.parse(await readFile(recentFile, 'utf8')) as RecentEntry[]
    recent = Array.isArray(list) ? list.filter((r) => typeof r?.path === 'string').slice(0, MAX_RECENT) : []
  } catch {
    recent = []
  }

  ipcMain.handle('recent:list', () => recent.filter((r) => existsSync(r.path)))

  ipcMain.handle('recent:add', async (_e, entry: { path: string; thumb?: string }) => {
    if (typeof entry?.path !== 'string' || !isAbsolute(entry.path) || !existsSync(entry.path)) return recent
    if (!OPENABLE.includes(extname(entry.path).slice(1).toLowerCase())) return recent
    const thumb = typeof entry.thumb === 'string' && entry.thumb.startsWith('data:image/jpeg;base64,') && entry.thumb.length < MAX_THUMB ? entry.thumb : undefined
    const old = recent.find((r) => key(r.path) === key(entry.path))
    recent = [{ path: entry.path, name: basename(entry.path), time: Date.now(), thumb: thumb ?? old?.thumb }, ...recent.filter((r) => r !== old)].slice(0, MAX_RECENT)
    await saveRecent()
    return recent
  })

  ipcMain.handle('recent:remove', async (_e, path: string) => {
    recent = recent.filter((r) => key(r.path) !== key(String(path)))
    await saveRecent()
    return recent
  })

  ipcMain.handle('recent:clear', async () => {
    recent = []
    await saveRecent()
    return recent
  })

  ipcMain.handle('file:read', (_e, path: string) => readAllowed(String(path)))

  ipcMain.handle('app:pending-open', async () => {
    const p = pending
    pending = null
    return p ? readAllowed(p) : null
  })

  /* ---------------- crash recovery ---------------- */

  ipcMain.handle('autosave:write', async (_e, a: { data: Uint8Array; name: string; filePath: string | null }) => {
    await mkdir(autosaveDir, { recursive: true })
    const file = join(autosaveDir, CURRENT[0])
    // Write-then-rename (replaces the old copy) so a crash during the write never leaves a broken file.
    await writeFile(file + '.part', a.data)
    await rename(file + '.part', file)
    await writeFile(join(autosaveDir, CURRENT[1]), JSON.stringify({ name: String(a.name), filePath: a.filePath ?? null, time: Date.now() }))
  })

  ipcMain.handle('autosave:check', async () => {
    try {
      if (!existsSync(join(autosaveDir, RECOVERED[0]))) return null
      return JSON.parse(await readFile(join(autosaveDir, RECOVERED[1]), 'utf8')) as { name: string; filePath: string | null; time: number }
    } catch {
      return null
    }
  })

  ipcMain.handle('autosave:load', async () => {
    const data = await readFile(join(autosaveDir, RECOVERED[0]))
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  })

  ipcMain.handle('autosave:discard', () => {
    for (const f of RECOVERED) rmSync(join(autosaveDir, f), { force: true })
  })

  ipcMain.handle('autosave:clear', () => clearAutosave())
}
