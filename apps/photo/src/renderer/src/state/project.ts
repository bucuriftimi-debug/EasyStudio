import i18next from 'i18next'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { addBitmap, bitmapToPng, decodeImage, getBitmap } from './bitmaps'
import { usedBitmapIds } from './docOps'
import type { Layer, PhotoDoc } from './types'

/**
 * Project file (.esp) = ZIP archive:
 *   project.json      – the document (layers, transforms, adjustments, text, shapes, masks…)
 *   bitmaps/<id>.png  – pixel data of picture layers and layer masks
 * Text and shape layers are stored only as settings, so they stay editable.
 */
const FORMAT = 'easystudio-photo'
const VERSION = 2

/**
 * `pngCache` (optional) keeps encoded pixels between calls: bitmaps never change once made, so
 * repeated saves (autosave) only encode the layers that are new.
 */
export async function writeProject(doc: PhotoDoc, pngCache?: Map<string, Uint8Array>): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {
    'project.json': strToU8(JSON.stringify({ format: FORMAT, version: VERSION, doc }, null, 1))
  }
  for (const id of new Set(usedBitmapIds(doc))) {
    const bm = getBitmap(id)
    if (!bm) throw new Error(`Missing image data for a layer (${id})`)
    let png = pngCache?.get(id)
    if (!png) {
      png = new Uint8Array(await (await bitmapToPng(bm)).arrayBuffer())
      pngCache?.set(id, png)
    }
    files[`bitmaps/${id}.png`] = png
  }
  if (pngCache) for (const id of pngCache.keys()) if (!files[`bitmaps/${id}.png`]) pngCache.delete(id)
  // PNGs are already compressed; storing them is much faster than deflating again.
  return zipSync(files, { level: 0 })
}

export async function readProject(data: Uint8Array, maxSize: number): Promise<PhotoDoc> {
  const files = unzipSync(data)
  const meta = files['project.json']
  if (!meta) throw new Error(i18next.t('err.notProject'))
  const parsed = JSON.parse(strFromU8(meta)) as { format?: string; version?: number; doc?: PhotoDoc }
  if (parsed.format !== FORMAT || !parsed.doc) throw new Error(i18next.t('err.notProject'))
  if ((parsed.version ?? 0) > VERSION) throw new Error(i18next.t('err.newerVersion'))
  const doc = parsed.doc
  // Version 1 files only had picture layers without the `type` field.
  doc.layers = doc.layers.map((l) => ({ ...l, type: l.type ?? 'raster', mask: l.mask ?? null }) as Layer)
  for (const id of new Set(usedBitmapIds(doc))) {
    if (getBitmap(id)) continue
    const png = files[`bitmaps/${id}.png`]
    if (!png) throw new Error(i18next.t('err.damaged'))
    addBitmap(await decodeImage(new Blob([png as BlobPart], { type: 'image/png' }), maxSize), id)
  }
  return doc
}
