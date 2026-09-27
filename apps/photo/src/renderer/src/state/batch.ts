import i18next from 'i18next'
import { allHistoryStates, IMAGE_FORMATS, scaleToLongEdge, type ImageFormat } from '@easystudio/core'
import { autoEnhance, Renderer } from '@easystudio/gpu'
import { buildScene, maxImageSize, uploadBitmap } from '../gpuHost'
import { baseName, saveFile, type PickedFile } from '../platform'
import { addBitmap, collectBitmaps, decodeImage, getBitmap } from './bitmaps'
import * as ops from './docOps'
import { useEditor } from './store'

/**
 * Batch editing: the same look, auto-fix and size applied to many photos, saved into a folder.
 * It uses its own GPU renderer, so the open document is not touched.
 */

const t = (k: string, o?: Record<string, unknown>) => i18next.t(k, o) as string

export interface BatchSettings {
  /** One-click filter id, or null. */
  look: string | null
  /** Auto-fix light and colour of every photo. */
  auto: boolean
  /** Longest side of the result (0 = keep the size). */
  longEdge: number
  format: ImageFormat
  quality: number
  /** Added to every file name, e.g. "-edited". */
  suffix: string
}

export interface BatchResult {
  done: number
  failed: string[]
  cancelled: boolean
}

/** Light / colour correction measured on a small copy of the photo. */
function autoValues(img: ImageBitmap) {
  const k = 160 / Math.max(img.width, img.height)
  const c = new OffscreenCanvas(Math.max(1, Math.round(img.width * k)), Math.max(1, Math.round(img.height * k)))
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, c.width, c.height)
  return autoEnhance(ctx.getImageData(0, 0, c.width, c.height).data)
}

/** Free the pictures of this batch that no open document uses. */
function freeTemporary(): void {
  const used = new Set<string>()
  const h = useEditor.getState().hist
  if (h) for (const d of allHistoryStates(h)) for (const id of ops.usedBitmapIds(d)) used.add(id)
  collectBitmaps(used)
}

export async function runBatch(
  files: PickedFile[],
  folder: string,
  s: BatchSettings,
  onProgress: (done: number, total: number, name: string) => void,
  signal?: AbortSignal
): Promise<BatchResult> {
  const fmt = IMAGE_FORMATS.find((f) => f.id === s.format)!
  const r = new Renderer(new OffscreenCanvas(16, 16))
  const res: BatchResult = { done: 0, failed: [], cancelled: false }
  const sep = folder.includes('\\') ? '\\' : '/'
  try {
    for (let i = 0; i < files.length; i++) {
      if (signal?.aborted) {
        res.cancelled = true
        break
      }
      const f = files[i]
      onProgress(i, files.length, f.name)
      try {
        const img = await decodeImage(new Blob([(await f.read()) as BlobPart]), Math.min(maxImageSize(), r.maxTextureSize))
        const bm = addBitmap(img)
        let layer = ops.createLayer(bm.id, bm.width, bm.height, f.name)
        layer = { ...layer, adjust: s.auto ? autoValues(img) : {}, look: s.look ? { id: s.look, amount: 100 } : null }
        const doc = ops.createDoc(f.name, bm.width, bm.height, layer)
        uploadBitmap(r, getBitmap(bm.id)!)
        const dims = scaleToLongEdge(bm.width, bm.height, s.longEdge)
        const px = r.exportPixels(buildScene(doc), dims.w, dims.h, s.format === 'jpeg' ? [1, 1, 1] : null)
        const canvas = new OffscreenCanvas(px.w, px.h)
        canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px.data.buffer), px.w, px.h), 0, 0)
        const blob = await canvas.convertToBlob({ type: fmt.mime, quality: fmt.lossy ? s.quality / 100 : undefined })
        const name = `${baseName(f.name)}${s.suffix}.${fmt.ext}`
        const saved = await saveFile(blob, name, [{ name: fmt.label, extensions: [fmt.ext] }], folder + sep + name)
        if (!saved) throw new Error(t('batch.notSaved'))
        r.retain(new Set(), new Set())
        res.done++
      } catch (e) {
        console.error(e)
        res.failed.push(f.name)
      } finally {
        freeTemporary()
      }
    }
    onProgress(files.length, files.length, '')
  } finally {
    r.dispose()
  }
  return res
}
