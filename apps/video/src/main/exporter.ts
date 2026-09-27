import { dialog, ipcMain, shell, type BrowserWindow } from 'electron'
import { mkdir, open, rm, type FileHandle } from 'node:fs/promises'
import { join, normalize } from 'node:path'

/**
 * Export target: the page encodes the video and sends the bytes here in pieces (with their
 * position in the file), so even a long 4K export never has to fit in memory.
 */

const allowed = new Set<string>()
const files = new Map<number, { fh: FileHandle; path: string }>()
let next = 1

export function registerExporter(getWin: () => BrowserWindow | null, texts: { mp4: string; webm: string }, testMode: boolean, dataDir: string): void {
  ipcMain.handle('export:pick', async (_e, opts: { defaultName: string; format: 'mp4' | 'webm' }) => {
    const win = getWin()
    if (!win) return null
    const r = await dialog.showSaveDialog(win, {
      defaultPath: opts.defaultName,
      filters: [opts.format === 'webm' ? { name: texts.webm, extensions: ['webm'] } : { name: texts.mp4, extensions: ['mp4'] }]
    })
    if (r.canceled || !r.filePath) return null
    allowed.add(normalize(r.filePath).toLowerCase())
    return r.filePath
  })

  // A file the app makes for itself (the mask video of a clip whose background was removed).
  ipcMain.handle('export:internal', async (_e, name: string) => {
    if (!/^[\w-]+\.mp4$/.test(String(name))) throw new Error('Bad name')
    const dir = join(dataDir, 'masks')
    await mkdir(dir, { recursive: true })
    const path = join(dir, name)
    allowed.add(normalize(path).toLowerCase())
    return path
  })

  ipcMain.handle('export:open', async (_e, path: string) => {
    if (!testMode && !allowed.has(normalize(path).toLowerCase())) throw new Error('Choose where to save first')
    const fh = await open(path, 'w')
    const id = next++
    files.set(id, { fh, path })
    return id
  })

  ipcMain.handle('export:write', async (_e, id: number, position: number, data: Uint8Array) => {
    const f = files.get(id)
    if (!f) throw new Error('Export file is closed')
    let off = 0
    while (off < data.length) {
      const { bytesWritten } = await f.fh.write(data, off, data.length - off, position + off)
      off += bytesWritten
    }
  })

  ipcMain.handle('export:reveal', (_e, path: string) => shell.showItemInFolder(path))

  /** `keep` = false deletes the unfinished file (export cancelled or failed). */
  ipcMain.handle('export:close', async (_e, id: number, keep: boolean) => {
    const f = files.get(id)
    if (!f) return
    files.delete(id)
    await f.fh.close()
    if (!keep) await rm(f.path, { force: true })
  })
}
