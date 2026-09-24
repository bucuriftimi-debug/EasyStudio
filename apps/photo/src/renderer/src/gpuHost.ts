import { docToLayerUVMatrix, tileRect } from '@easystudio/core'
import { NEUTRAL_EFFECTS, Renderer, toEffectParams, type RenderScene } from '@easystudio/gpu'
import { getBitmap, type StoredBitmap } from './state/bitmaps'
import { layerSource } from './state/gen'
import type { Layer, PhotoDoc, Selection } from './state/types'

/** The single GPU renderer, owned by the canvas view but also used for export, painting & thumbnails. */
let renderer: Renderer | null = null

export function setRenderer(r: Renderer | null): void {
  renderer = r
}

export function getRenderer(): Renderer | null {
  return renderer
}

export function layerEffects(l: Layer) {
  return toEffectParams(l.adjust, l.look?.id, l.look?.amount ?? 100)
}

export function buildScene(doc: PhotoDoc, compare = false): RenderScene {
  return {
    width: doc.width,
    height: doc.height,
    layers: doc.layers.map((l) => ({
      id: l.id,
      sourceId: layerSource(l).id,
      maskId: l.mask?.enabled ? l.mask.bitmapId : null,
      visible: l.visible,
      opacity: l.opacity / 100,
      blend: l.blend,
      docToLayer: docToLayerUVMatrix(l.transform, l.width, l.height),
      effects: compare ? NEUTRAL_EFFECTS : layerEffects(l)
    }))
  }
}

export function uploadBitmap(r: Renderer, bm: StoredBitmap): void {
  if (r.hasSource(bm.id)) return
  const patches = [...bm.patches].map(([i, image]) => ({ ...tileRect(i, bm.width, bm.height), image }))
  r.uploadTiled(bm.id, bm.width, bm.height, bm.base, patches)
}

/** Upload missing pixel data to the GPU and free what the document no longer uses. */
export function syncSources(r: Renderer, doc: PhotoDoc | null, selection?: Selection | null): void {
  const sources = new Set<string>()
  const layers = new Set<string>()
  if (doc) {
    for (const l of doc.layers) {
      layers.add(l.id)
      const src = layerSource(l)
      sources.add(src.id)
      if (!r.hasSource(src.id)) {
        if (src.canvas) r.uploadSource(src.id, src.canvas, src.canvas.width, src.canvas.height)
        else {
          const bm = getBitmap(src.id)
          if (bm) uploadBitmap(r, bm)
        }
      }
      if (l.mask) {
        sources.add(l.mask.bitmapId)
        const bm = getBitmap(l.mask.bitmapId)
        if (bm) uploadBitmap(r, bm)
      }
    }
  }
  if (selection) {
    sources.add(selection.id)
    if (!r.hasSource(selection.id)) r.uploadSource(selection.id, selection.canvas, selection.canvas.width, selection.canvas.height)
  }
  r.retain(sources, layers)
}

let probedMaxTexture = 0

/** Biggest texture the graphics card accepts, asked once (the canvas renderer may not exist yet). */
function gpuMaxTexture(): number {
  if (renderer) return renderer.maxTextureSize
  if (!probedMaxTexture) {
    try {
      const gl = new OffscreenCanvas(1, 1).getContext('webgl2')
      probedMaxTexture = (gl?.getParameter(gl.MAX_TEXTURE_SIZE) as number) || 8192
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    } catch {
      probedMaxTexture = 8192
    }
  }
  return probedMaxTexture
}

export function maxImageSize(): number {
  return Math.min(gpuMaxTexture(), 16384)
}
