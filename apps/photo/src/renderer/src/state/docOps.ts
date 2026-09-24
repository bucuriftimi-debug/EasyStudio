import {
  fitTransform,
  flipTransform,
  identityTransform,
  normDeg,
  rotateTransform90,
  scaleTransform,
  translateTransform,
  uid,
  type LayerTransform,
  type Rect
} from '@easystudio/core'
import type { Layer, LayerMask, PhotoDoc, RasterLayer, ShapeLayer, ShapeStyle, TextLayer, TextStyle } from './types'

/** Pure, immutable operations on a document. Every function returns a new document. */

type LayerPatch = Partial<RasterLayer> | Partial<TextLayer> | Partial<ShapeLayer>

function baseProps(name: string, width: number, height: number, t?: LayerTransform) {
  return {
    id: uid('ly'),
    name,
    width,
    height,
    visible: true,
    opacity: 100,
    blend: 'normal' as const,
    transform: t ?? identityTransform(width, height),
    adjust: {},
    look: null,
    mask: null
  }
}

export function createLayer(bitmapId: string, width: number, height: number, name: string, t?: LayerTransform): RasterLayer {
  return { ...baseProps(name, width, height, t), type: 'raster', bitmapId }
}

export function createTextLayer(style: TextStyle, size: { w: number; h: number }, cx: number, cy: number, name: string): TextLayer {
  return { ...baseProps(name, size.w, size.h, { cx, cy, sx: 1, sy: 1, rot: 0 }), type: 'text', style }
}

export function createShapeLayer(shape: ShapeStyle, w: number, h: number, t: LayerTransform, name: string): ShapeLayer {
  return { ...baseProps(name, w, h, t), type: 'shape', shape }
}

export function createDoc(name: string, width: number, height: number, first: Layer): PhotoDoc {
  return { name, width, height, layers: [first], activeLayerId: first.id }
}

export function activeLayer(doc: PhotoDoc): Layer | undefined {
  return doc.layers.find((l) => l.id === doc.activeLayerId) ?? doc.layers[doc.layers.length - 1]
}

export function updateLayer(doc: PhotoDoc, id: string, patch: LayerPatch | ((l: Layer) => LayerPatch)): PhotoDoc {
  return {
    ...doc,
    layers: doc.layers.map((l) => (l.id === id ? ({ ...l, ...(typeof patch === 'function' ? patch(l) : patch) } as Layer) : l))
  }
}

export function setMask(doc: PhotoDoc, id: string, mask: LayerMask | null): PhotoDoc {
  return updateLayer(doc, id, { mask })
}

/** Replace a layer with another object (e.g. a text layer converted to pixels), keeping its place. */
export function replaceLayer(doc: PhotoDoc, id: string, next: Layer): PhotoDoc {
  return { ...doc, layers: doc.layers.map((l) => (l.id === id ? next : l)), activeLayerId: doc.activeLayerId === id ? next.id : doc.activeLayerId }
}

/** Insert above the active layer (or on top) and make it active. */
export function addLayer(doc: PhotoDoc, layer: Layer): PhotoDoc {
  const idx = doc.layers.findIndex((l) => l.id === doc.activeLayerId)
  const layers = [...doc.layers]
  layers.splice(idx < 0 ? layers.length : idx + 1, 0, layer)
  return { ...doc, layers, activeLayerId: layer.id }
}

export function removeLayer(doc: PhotoDoc, id: string): PhotoDoc {
  const idx = doc.layers.findIndex((l) => l.id === id)
  if (idx < 0) return doc
  const layers = doc.layers.filter((l) => l.id !== id)
  const next = layers[Math.min(idx, layers.length - 1)] ?? null
  return { ...doc, layers, activeLayerId: doc.activeLayerId === id ? (next?.id ?? null) : doc.activeLayerId }
}

export function duplicateLayer(doc: PhotoDoc, id: string, copySuffix: string): PhotoDoc {
  const src = doc.layers.find((l) => l.id === id)
  if (!src) return doc
  const copy: Layer = {
    ...src,
    id: uid('ly'),
    name: `${src.name} ${copySuffix}`,
    transform: translateTransform(src.transform, 0, 0)
  }
  const idx = doc.layers.indexOf(src)
  const layers = [...doc.layers]
  layers.splice(idx + 1, 0, copy)
  return { ...doc, layers, activeLayerId: copy.id }
}

/** Move a layer to a new index (0 = bottom). */
export function moveLayerTo(doc: PhotoDoc, id: string, index: number): PhotoDoc {
  const from = doc.layers.findIndex((l) => l.id === id)
  if (from < 0) return doc
  const to = Math.max(0, Math.min(doc.layers.length - 1, index))
  if (from === to) return doc
  const layers = [...doc.layers]
  const [l] = layers.splice(from, 1)
  layers.splice(to, 0, l)
  return { ...doc, layers }
}

export function moveLayerBy(doc: PhotoDoc, id: string, delta: number): PhotoDoc {
  const from = doc.layers.findIndex((l) => l.id === id)
  return from < 0 ? doc : moveLayerTo(doc, id, from + delta)
}

function mapTransforms(doc: PhotoDoc, f: (t: LayerTransform) => LayerTransform): Layer[] {
  return doc.layers.map((l) => ({ ...l, transform: f(l.transform) }))
}

/** Crop the canvas to a rectangle. Layers keep all their pixels (non-destructive). */
export function cropDoc(doc: PhotoDoc, r: Rect): PhotoDoc {
  const x = Math.round(r.x)
  const y = Math.round(r.y)
  const w = Math.max(1, Math.round(r.w))
  const h = Math.max(1, Math.round(r.h))
  return { ...doc, width: w, height: h, layers: mapTransforms(doc, (t) => translateTransform(t, -x, -y)) }
}

export function rotateDoc90(doc: PhotoDoc, cw: boolean): PhotoDoc {
  return {
    ...doc,
    width: doc.height,
    height: doc.width,
    layers: mapTransforms(doc, (t) => rotateTransform90(t, doc.width, doc.height, cw))
  }
}

export function flipDoc(doc: PhotoDoc, axis: 'h' | 'v'): PhotoDoc {
  return { ...doc, layers: mapTransforms(doc, (t) => flipTransform(t, doc.width, doc.height, axis)) }
}

/** Resize the whole image (everything scales with it). */
export function resizeDoc(doc: PhotoDoc, w: number, h: number): PhotoDoc {
  const W = Math.max(1, Math.round(w))
  const H = Math.max(1, Math.round(h))
  const kx = W / doc.width
  const ky = H / doc.height
  return { ...doc, width: W, height: H, layers: mapTransforms(doc, (t) => scaleTransform(t, kx, ky)) }
}

/** Change the canvas size without scaling the content. Anchor: 0 / 0.5 / 1 per axis. */
export function resizeCanvas(doc: PhotoDoc, w: number, h: number, ax: number, ay: number): PhotoDoc {
  const W = Math.max(1, Math.round(w))
  const H = Math.max(1, Math.round(h))
  const dx = Math.round((W - doc.width) * ax)
  const dy = Math.round((H - doc.height) * ay)
  return { ...doc, width: W, height: H, layers: mapTransforms(doc, (t) => translateTransform(t, dx, dy)) }
}

/* ------------------------- single layer transforms ------------------------- */

export function flipLayer(doc: PhotoDoc, id: string, axis: 'h' | 'v'): PhotoDoc {
  return updateLayer(doc, id, (l) => ({
    transform: axis === 'h' ? { ...l.transform, sx: -l.transform.sx } : { ...l.transform, sy: -l.transform.sy }
  }))
}

export function rotateLayer(doc: PhotoDoc, id: string, deg: number): PhotoDoc {
  return updateLayer(doc, id, (l) => ({ transform: { ...l.transform, rot: normDeg(l.transform.rot + deg) } }))
}

export function fitLayer(doc: PhotoDoc, id: string): PhotoDoc {
  return updateLayer(doc, id, (l) => ({ transform: fitTransform(l.transform, l.width, l.height, doc.width, doc.height) }))
}

export function resetLayerTransform(doc: PhotoDoc, id: string): PhotoDoc {
  return updateLayer(doc, id, () => ({
    transform: { cx: doc.width / 2, cy: doc.height / 2, sx: 1, sy: 1, rot: 0 }
  }))
}

export function usedBitmapIds(doc: PhotoDoc): string[] {
  const out: string[] = []
  for (const l of doc.layers) {
    if (l.type === 'raster') out.push(l.bitmapId)
    if (l.mask) out.push(l.mask.bitmapId)
  }
  return out
}
