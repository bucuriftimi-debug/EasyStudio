import { dialog, ipcMain, type BrowserWindow } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import { basename, extname, isAbsolute } from 'node:path'

/**
 * Media files the user added (videos, music, pictures). The page never gets the whole file:
 * Mediabunny asks for byte ranges (`media:read`), so a 4 GB video does not fill the memory.
 */

export const VIDEO_EXT = ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'ts', 'mts']
export const AUDIO_EXT = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac']
export const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif']
const ALL_EXT = [...VIDEO_EXT, ...AUDIO_EXT, ...IMAGE_EXT]

export interface MediaFile {
  id: string
  path: string
  name: string
  size: number
  kind: 'video' | 'audio' | 'image'
}

interface Entry extends MediaFile {
  fh: Promise<FileHandle> | null
}

const files = new Map<string, Entry>()
const byPath = new Map<string, string>()
let nextId = 1

const kindOf = (ext: string): MediaFile['kind'] => (AUDIO_EXT.includes(ext) ? 'audio' : IMAGE_EXT.includes(ext) ? 'image' : 'video')

function register(path: string): MediaFile | null {
  if (typeof path !== 'string' || !isAbsolute(path) || !existsSync(path)) return null
  const ext = extname(path).slice(1).toLowerCase()
  if (!ALL_EXT.includes(ext)) return null
  const known = byPath.get(path.toLowerCase())
  if (known) return strip(files.get(known)!)
  const st = statSync(path)
  if (!st.isFile()) return null
  const e: Entry = { id: `m${nextId++}`, path, name: basename(path), size: st.size, kind: kindOf(ext), fh: null }
  files.set(e.id, e)
  byPath.set(path.toLowerCase(), e.id)
  return strip(e)
}

const strip = ({ fh: _fh, ...m }: Entry): MediaFile => m

async function handle(id: string): Promise<{ e: Entry; fh: FileHandle }> {
  const e = files.get(id)
  if (!e) throw new Error('Unknown media')
  if (!e.fh) e.fh = open(e.path, 'r')
  return { e, fh: await e.fh }
}

export function registerMedia(getWin: () => BrowserWindow | null, texts: { media: string; video: string; audio: string; images: string }): void {
  ipcMain.handle('media:pick', async () => {
    const win = getWin()
    if (!win) return []
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: texts.media, extensions: ALL_EXT },
        { name: texts.video, extensions: VIDEO_EXT },
        { name: texts.audio, extensions: AUDIO_EXT },
        { name: texts.images, extensions: IMAGE_EXT }
      ]
    })
    if (r.canceled) return []
    return r.filePaths.map(register).filter(Boolean)
  })

  /** Files dropped on the window or referenced by a project. */
  ipcMain.handle('media:register', (_e, paths: string[]) => (Array.isArray(paths) ? paths.map(register).filter(Boolean) : []))

  ipcMain.handle('media:read', async (_e, id: string, start: number, end: number) => {
    const { e, fh } = await handle(id)
    const s = Math.max(0, Math.floor(start))
    const len = Math.max(0, Math.min(e.size, Math.floor(end)) - s)
    const buf = new Uint8Array(len)
    let off = 0
    while (off < len) {
      const { bytesRead } = await fh.read(buf, off, len - off, s + off)
      if (!bytesRead) break
      off += bytesRead
    }
    return off === len ? buf : buf.subarray(0, off)
  })
}

export async function closeMedia(): Promise<void> {
  for (const e of files.values()) if (e.fh) (await e.fh).close().catch(() => undefined)
}
