import { net } from 'electron'
import { createWriteStream, existsSync, statSync } from 'node:fs'
import { mkdir, open, rename, rm } from 'node:fs/promises'
import { dirname, join, normalize, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { pathToFileURL } from 'node:url'

/*
 * AI model files (speech recognition for subtitles, video background removal), served to the
 * page at app://video/hf/<repo>/resolve/<revision>/<file>. The first request downloads the file
 * from huggingface.co (the only host allowed) into DATA/hf; later requests read it from disk.
 * The page's security policy does not allow it to reach the internet itself.
 */

// owner/model/resolve/revision/path/to/file.ext
const HF_PATH = /^[\w.-]+\/[\w.-]+\/resolve\/[\w.-]+\/[\w./-]+$/

let root = ''
/** Downloads in progress: a second request for the same file waits for the first one. */
const inFlight = new Map<string, Promise<void>>()

export function setModelsDir(dir: string): void {
  root = dir
}

function localFile(rel: string): string | null {
  const file = normalize(join(root, rel))
  return file.startsWith(normalize(root + sep)) ? file : null
}

const cors = (h: Headers) => (h.set('Access-Control-Allow-Origin', '*'), h)

function fromDisk(file: string): Promise<Response> {
  return net.fetch(pathToFileURL(file).toString()).then((r) => {
    const headers = cors(new Headers(r.headers))
    headers.set('Content-Length', String(statSync(file).size))
    return new Response(r.body, { status: 200, headers })
  })
}

/** "bytes=0-0" style probes (the page asks for the size before downloading). */
async function firstBytes(file: string, range: string): Promise<Response | null> {
  const m = /^bytes=(\d+)-(\d+)$/.exec(range)
  if (!m) return null
  const size = statSync(file).size
  const a = Math.min(Number(m[1]), size - 1)
  const b = Math.min(Number(m[2]), size - 1)
  const fh = await open(file, 'r')
  try {
    const buf = Buffer.alloc(b - a + 1)
    await fh.read(buf, 0, buf.length, a)
    const headers = cors(new Headers({ 'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': String(buf.length) }))
    return new Response(buf, { status: 206, headers })
  } finally {
    await fh.close()
  }
}

/** Handle app://video/hf/… (`rel` is the part after /hf/). */
export async function serveModel(rel: string, req: Request): Promise<Response> {
  if (!root || !HF_PATH.test(rel) || rel.includes('..')) return new Response('Bad model path', { status: 400 })
  const file = localFile(rel)
  if (!file) return new Response('Forbidden', { status: 403 })
  const range = req.headers.get('range')
  const busy = inFlight.get(file)
  if (existsSync(file)) return (range && (await firstBytes(file, range))) || fromDisk(file)
  if (range) {
    // Only the size is wanted: ask huggingface.co for the same few bytes, save nothing.
    const r = await net.fetch(`https://huggingface.co/${rel}`, { headers: { Range: range }, redirect: 'follow' })
    return new Response(r.body, { status: r.status, headers: cors(new Headers(r.headers)) })
  }
  if (busy) {
    await busy.catch(() => undefined)
    return existsSync(file) ? fromDisk(file) : new Response('Download failed', { status: 502 })
  }
  const res = await net.fetch(`https://huggingface.co/${rel}`, { redirect: 'follow' })
  if (!res.ok || !res.body) return new Response('Not found', { status: res.status === 404 ? 404 : 502 })
  await mkdir(dirname(file), { recursive: true })
  const part = `${file}.part`
  // Save while the page reads it: one copy goes to the disk, the other to the page.
  const [toDisk, toPage] = res.body.tee()
  const done = pipeline(Readable.fromWeb(toDisk as never), createWriteStream(part))
    .then(() => rename(part, file))
    .catch(async (e) => {
      await rm(part, { force: true })
      throw e
    })
    .finally(() => inFlight.delete(file))
  inFlight.set(file, done)
  done.catch((e) => console.warn(`[models] download failed: ${rel}`, e))
  const headers = cors(new Headers({ 'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream' }))
  const len = res.headers.get('content-length')
  if (len) headers.set('Content-Length', len)
  return new Response(toPage, { status: 200, headers })
}
