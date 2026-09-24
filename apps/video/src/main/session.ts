import { ipcMain, type BrowserWindow } from 'electron'
import { existsSync, rmSync, statSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, normalize } from 'node:path'

/**
 * Recent projects, crash recovery and projects handed over by Windows (double-click on a
 * .esv). A project file is small JSON, so the recovery copy is written every half minute.
 */

interface Recent {
  path: string
  name: string
  time: number
}

const MAX_RECENT = 10
let dir = ''
let recentFile = ''
let recent: Recent[] = []
let pending: string | null = null
const key = (p: string) => normalize(p).toLowerCase()

export function projectFromArgv(argv: string[]): string | null {
  for (let i = argv.length - 1; i > 0; i--) {
    const a = argv[i]
    if (a.startsWith('--') || !isAbsolute(a)) continue
    if (extname(a).toLowerCase() === '.esv' && existsSync(a) && statSync(a).isFile()) return a
  }
  return null
}

export function setPendingProject(path: string, win: BrowserWindow | null): void {
  pending = path
  win?.webContents.send('app:open-pending')
}

/** A normal close: this session's recovery copy is not needed. */
export function clearAutosave(): void {
  if (dir) for (const f of ['current.esv', 'current.json']) rmSync(join(dir, f), { force: true })
}

export async function registerSession(dataDir: string, startSession: boolean): Promise<void> {
  dir = join(dataDir, 'autosave')
  recentFile = join(dataDir, 'recent.json')
  try {
    recent = (JSON.parse(await readFile(recentFile, 'utf8')) as Recent[]).filter((r) => typeof r?.path === 'string').slice(0, MAX_RECENT)
  } catch {
    recent = []
  }
  // A copy left by the last session means it crashed: keep it aside as "recovered".
  if (startSession && existsSync(join(dir, 'current.esv')) && existsSync(join(dir, 'current.json'))) {
    await rename(join(dir, 'current.esv'), join(dir, 'recovered.esv'))
    await rename(join(dir, 'current.json'), join(dir, 'recovered.json'))
  }
  const saveRecent = () => writeFile(recentFile, JSON.stringify(recent, null, 1))

  ipcMain.handle('recent:list', () => recent.filter((r) => existsSync(r.path)))
  ipcMain.handle('recent:add', async (_e, path: string) => {
    if (typeof path !== 'string' || !isAbsolute(path) || !existsSync(path)) return recent
    recent = [{ path, name: basename(path).replace(/\.esv$/i, ''), time: Date.now() }, ...recent.filter((r) => key(r.path) !== key(path))].slice(0, MAX_RECENT)
    await saveRecent()
    return recent
  })
  ipcMain.handle('recent:remove', async (_e, path: string) => {
    recent = recent.filter((r) => key(r.path) !== key(String(path)))
    await saveRecent()
    return recent
  })

  ipcMain.handle('app:pending-open', () => {
    const p = pending
    pending = null
    return p
  })

  ipcMain.handle('autosave:write', async (_e, a: { text: string; name: string; filePath: string | null }) => {
    await mkdir(dir, { recursive: true })
    const f = join(dir, 'current.esv')
    await writeFile(f + '.part', a.text)
    await rename(f + '.part', f)
    await writeFile(join(dir, 'current.json'), JSON.stringify({ name: String(a.name), filePath: a.filePath ?? null, time: Date.now() }))
  })
  ipcMain.handle('autosave:check', async () => {
    try {
      if (!existsSync(join(dir, 'recovered.esv'))) return null
      return JSON.parse(await readFile(join(dir, 'recovered.json'), 'utf8')) as { name: string; filePath: string | null; time: number }
    } catch {
      return null
    }
  })
  ipcMain.handle('autosave:load', () => readFile(join(dir, 'recovered.esv'), 'utf8'))
  ipcMain.handle('autosave:discard', () => {
    for (const f of ['recovered.esv', 'recovered.json']) rmSync(join(dir, f), { force: true })
  })
  ipcMain.handle('autosave:clear', () => clearAutosave())
}
