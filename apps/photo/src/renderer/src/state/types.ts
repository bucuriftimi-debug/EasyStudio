import type { LayerTransform } from '@easystudio/core'
import type { AdjustValues, BlendMode } from '@easystudio/gpu'
import type { TextStyle } from '@easystudio/draw'

export interface Look {
  id: string
  /** 0..100 */
  amount: number
}

export interface LayerMask {
  /** Grey bitmap (white = visible, black = hidden), same logical size as the layer. */
  bitmapId: string
  enabled: boolean
}

interface LayerBase {
  id: string
  name: string
  /** Logical size in layer pixels (the transform maps this box onto the document). */
  width: number
  height: number
  visible: boolean
  /** 0..100 */
  opacity: number
  blend: BlendMode
  transform: LayerTransform
  adjust: AdjustValues
  look: Look | null
  mask?: LayerMask | null
}

export interface RasterLayer extends LayerBase {
  type: 'raster'
  /** Pixel data id in the bitmap store (immutable; editing pixels creates a new bitmap). */
  bitmapId: string
}

export type { TextStyle }

export interface TextLayer extends LayerBase {
  type: 'text'
  style: TextStyle
}

export type ShapeKind = 'rect' | 'ellipse' | 'triangle' | 'star' | 'line' | 'arrow'

export interface ShapeStyle {
  kind: ShapeKind
  fill: string
  fillEnabled: boolean
  stroke: string
  strokeWidth: number
  /** Rounded corners (rect), px */
  radius: number
}

export interface ShapeLayer extends LayerBase {
  type: 'shape'
  shape: ShapeStyle
}

export type Layer = RasterLayer | TextLayer | ShapeLayer

export type SelOp = 'replace' | 'add' | 'sub' | 'int'

/**
 * A selection is a document-sized alpha mask plus its bounding box. It is editor state (not
 * part of undo history) so big masks are never duplicated in memory.
 */
export interface Selection {
  /** Unique per selection state (also used as the GPU texture id). */
  id: string
  canvas: OffscreenCanvas
  bounds: { x: number; y: number; w: number; h: number }
}

export interface PhotoDoc {
  name: string
  width: number
  height: number
  /** Bottom → top */
  layers: Layer[]
  activeLayerId: string | null
}

export type Tool = 'move' | 'select' | 'crop' | 'brush' | 'eraser' | 'clone' | 'magic' | 'fill' | 'text' | 'shape' | 'eyedropper' | 'hand'
export type Mode = 'simple' | 'pro'
export type Panel = 'props' | 'adjust' | 'filters' | 'layers' | 'history'
export type DialogId = 'new' | 'resize' | 'canvas' | 'export' | 'about' | 'selmodify' | 'aisettings' | 'genfill' | null

export type SelectShape = 'rect' | 'ellipse' | 'lasso' | 'wand' | 'object'
export type FillKind = 'bucket' | 'gradient'

export interface ToolSettings {
  brushSize: number
  brushHardness: number
  brushOpacity: number
  brushSmoothing: number
  eraserSize: number
  eraserHardness: number
  eraserOpacity: number
  cloneSize: number
  cloneHardness: number
  cloneOpacity: number
  magicSize: number
  selectShape: SelectShape
  selectOp: SelOp
  wandTolerance: number
  wandContiguous: boolean
  fillKind: FillKind
  fillTolerance: number
  fillContiguous: boolean
  gradientType: 'linear' | 'radial'
  gradientToTransparent: boolean
  shapeKind: ShapeKind
}

export interface View {
  /** CSS px per document px */
  zoom: number
  /** Position of the document's top-left corner in the viewport (CSS px). */
  panX: number
  panY: number
}

export interface CropState {
  /** Document-space rectangle. */
  x: number
  y: number
  w: number
  h: number
  ratioId: string
}
