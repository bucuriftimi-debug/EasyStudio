import { create } from 'zustand'
import {
  allHistoryStates,
  createHistory,
  jumpTo,
  pushHistory,
  redo as historyRedo,
  replacePresent,
  undo as historyUndo,
  type History
} from '@easystudio/core'
import { collectBitmaps } from './bitmaps'
import { usedBitmapIds } from './docOps'
import type { CropState, DialogId, Mode, Panel, PhotoDoc, Selection, Tool, ToolSettings, View } from './types'
import type { AutosaveInfo, RecentEntry } from '../platform'

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'success' | 'error'
}

export interface EditorState {
  hist: History<PhotoDoc> | null
  /** Doc state at the last save/open — used to know if there are unsaved changes. */
  savedDoc: PhotoDoc | null
  filePath: string | null
  gestureBase: PhotoDoc | null
  tool: Tool
  mode: Mode
  panel: Panel
  dialog: DialogId
  view: View
  viewport: { w: number; h: number }
  compare: boolean
  crop: CropState | null
  selection: Selection | null
  /** Paint on the active layer's mask instead of its pixels. */
  editMask: boolean
  fg: string
  bg: string
  recentColors: string[]
  settings: ToolSettings
  /** Bumped when web fonts finish loading so text layers get redrawn. */
  fontEpoch: number
  /** Text layer whose text box should grab keyboard focus (just created / double-clicked). */
  focusText: string | null
  /** An open yes/no question (see `ask`). */
  question: { text: string; yes: string; no: string; resolve: (v: boolean) => void } | null
  toasts: Toast[]
  /** The "tell the AI what you want" bar (Ctrl+K). */
  assistantOpen: null | 'ask' | 'suggest'
  /** Recently opened / saved files (desktop app). */
  recent: RecentEntry[]
  /** Work left over by a session that crashed, waiting for "Restore" or "Discard". */
  recovery: AutosaveInfo | null
  /** First-run tips (0 = first step), null when hidden. */
  tour: number | null
  busy: string | null
  /** 0..1 for a progress bar under the busy message (null = spinner only). */
  busyProgress: number | null
}

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? { ...fallback, ...JSON.parse(v) } : fallback
  } catch {
    return fallback
  }
}

const loadMode = (): Mode => {
  try {
    return localStorage.getItem('easystudio.photo.mode') === 'pro' ? 'pro' : 'simple'
  } catch {
    return 'simple'
  }
}

export const DEFAULT_SETTINGS: ToolSettings = {
  brushSize: 30,
  brushHardness: 70,
  brushOpacity: 100,
  brushSmoothing: 30,
  eraserSize: 40,
  eraserHardness: 70,
  eraserOpacity: 100,
  cloneSize: 40,
  cloneHardness: 50,
  cloneOpacity: 100,
  magicSize: 40,
  selectShape: 'rect',
  selectOp: 'replace',
  wandTolerance: 32,
  wandContiguous: true,
  fillKind: 'bucket',
  fillTolerance: 32,
  fillContiguous: true,
  gradientType: 'linear',
  gradientToTransparent: false,
  shapeKind: 'rect'
}

const SETTINGS_KEY = 'easystudio.photo.tools'
const COLORS_KEY = 'easystudio.photo.colors'
const savedColors = load(COLORS_KEY, { fg: '#000000', bg: '#ffffff', recent: [] as string[] })

export const useEditor = create<EditorState>(() => ({
  hist: null,
  savedDoc: null,
  filePath: null,
  gestureBase: null,
  tool: 'move',
  mode: loadMode(),
  panel: 'adjust',
  dialog: null,
  view: { zoom: 1, panX: 0, panY: 0 },
  viewport: { w: 800, h: 600 },
  compare: false,
  crop: null,
  selection: null,
  editMask: false,
  fg: savedColors.fg,
  bg: savedColors.bg,
  recentColors: savedColors.recent,
  settings: load(SETTINGS_KEY, DEFAULT_SETTINGS),
  fontEpoch: 0,
  focusText: null,
  question: null,
  toasts: [],
  assistantOpen: null,
  recent: [],
  recovery: null,
  tour: null,
  busy: null,
  busyProgress: null
}))

const set = useEditor.setState
const get = useEditor.getState

export const getDoc = (): PhotoDoc | null => get().hist?.present.state ?? null
export const useDoc = (): PhotoDoc | null => useEditor((s) => s.hist?.present.state ?? null)

function gc(h: History<PhotoDoc> | null): void {
  const used = new Set<string>()
  if (h) for (const d of allHistoryStates(h)) for (const id of usedBitmapIds(d)) used.add(id)
  collectBitmaps(used)
}

/* ------------------------------ document lifecycle ------------------------------ */

export function openDocument(doc: PhotoDoc, label: string, filePath: string | null = null): void {
  const hist = createHistory(doc, label)
  set({ hist, savedDoc: doc, filePath, gestureBase: null, crop: null, compare: false, tool: 'move', selection: null, editMask: false })
  gc(hist)
  fitView()
}

export function closeDocument(): void {
  set({ hist: null, savedDoc: null, filePath: null, gestureBase: null, crop: null, compare: false, selection: null, editMask: false })
  gc(null)
}

/* ------------------------------ tools & colours ------------------------------ */

export function setSettings(patch: Partial<ToolSettings>): void {
  const settings = { ...get().settings, ...patch }
  set({ settings })
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}

function saveColors(): void {
  const s = get()
  try {
    localStorage.setItem(COLORS_KEY, JSON.stringify({ fg: s.fg, bg: s.bg, recent: s.recentColors }))
  } catch {
    /* ignore */
  }
}

export function setColor(which: 'fg' | 'bg', color: string): void {
  set({ [which]: color } as Pick<EditorState, 'fg'>)
  saveColors()
}

/** Remember a colour once it is actually used (painting, filling, text…). */
export function rememberColor(color: string): void {
  const recent = [color, ...get().recentColors.filter((c) => c !== color)].slice(0, 12)
  set({ recentColors: recent })
  saveColors()
}

export function swapColors(): void {
  const { fg, bg } = get()
  set({ fg: bg, bg: fg })
  saveColors()
}

export function resetColors(): void {
  set({ fg: '#000000', bg: '#ffffff' })
  saveColors()
}

export function setSelection(selection: Selection | null): void {
  set({ selection })
}

export function markSaved(path: string | null): void {
  set({ savedDoc: getDoc(), filePath: path ?? get().filePath })
}

export function isDirty(s: EditorState = get()): boolean {
  return !!s.hist && s.hist.present.state !== s.savedDoc
}

/* ------------------------------ editing ------------------------------ */

/** Apply a change as one undo step. */
export function commit(label: string, fn: (d: PhotoDoc) => PhotoDoc): void {
  const { hist, gestureBase } = get()
  if (!hist) return
  if (gestureBase) endGesture(label)
  const cur = get().hist!
  const next = fn(cur.present.state)
  if (next === cur.present.state) return
  const h = pushHistory(cur, next, label)
  set({ hist: h })
  gc(h)
}

/** Start a continuous change (slider drag, moving a layer): intermediate states are not recorded. */
export function beginGesture(): void {
  const doc = getDoc()
  if (doc && !get().gestureBase) set({ gestureBase: doc })
}

/** Live update during a gesture. Falls back to a normal commit if no gesture is active. */
export function live(label: string, fn: (d: PhotoDoc) => PhotoDoc): void {
  const { hist, gestureBase } = get()
  if (!hist) return
  if (!gestureBase) return commit(label, fn)
  set({ hist: replacePresent(hist, fn(hist.present.state)) })
}

export function endGesture(label: string): void {
  const { hist, gestureBase } = get()
  if (!hist || !gestureBase) return
  const cur = hist.present.state
  set({ gestureBase: null })
  if (cur === gestureBase) return
  const base = replacePresent(hist, gestureBase)
  const h = pushHistory(base, cur, label)
  set({ hist: h })
  gc(h)
}

/** Throw away a gesture's live changes (e.g. an AI preview the user cancelled). */
export function cancelGesture(): void {
  const { hist, gestureBase } = get()
  if (!hist || !gestureBase) return
  set({ hist: replacePresent(hist, gestureBase), gestureBase: null })
}

export function undo(): void {
  const { hist } = get()
  if (!hist) return
  set({ hist: historyUndo(hist), gestureBase: null, crop: null })
}

export function redo(): void {
  const { hist } = get()
  if (!hist) return
  set({ hist: historyRedo(hist), gestureBase: null, crop: null })
}

export function jumpHistory(index: number): void {
  const { hist } = get()
  if (!hist) return
  set({ hist: jumpTo(hist, index), gestureBase: null, crop: null })
}

/* ------------------------------ view ------------------------------ */

const MIN_ZOOM = 0.02
const MAX_ZOOM = 32

export function fitView(allowUpscale = false): void {
  const doc = getDoc()
  if (!doc) return
  const { w, h } = get().viewport
  const pad = 48
  let zoom = Math.min((w - pad * 2) / doc.width, (h - pad * 2) / doc.height)
  if (!allowUpscale) zoom = Math.min(zoom, 1)
  zoom = Math.max(MIN_ZOOM, zoom)
  set({ view: { zoom, panX: (w - doc.width * zoom) / 2, panY: (h - doc.height * zoom) / 2 } })
}

/** Zoom keeping the document point under (ax, ay) (viewport CSS px) fixed. */
export function zoomTo(zoom: number, ax?: number, ay?: number): void {
  const { view, viewport } = get()
  const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
  const px = ax ?? viewport.w / 2
  const py = ay ?? viewport.h / 2
  const dx = (px - view.panX) / view.zoom
  const dy = (py - view.panY) / view.zoom
  set({ view: { zoom: z, panX: px - dx * z, panY: py - dy * z } })
}

const ZOOM_STEPS = [0.05, 0.1, 0.125, 0.167, 0.25, 0.333, 0.5, 0.667, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32]

export function zoomStep(dir: 1 | -1, ax?: number, ay?: number): void {
  const z = get().view.zoom
  const next = dir > 0 ? (ZOOM_STEPS.find((s) => s > z * 1.001) ?? MAX_ZOOM) : ([...ZOOM_STEPS].reverse().find((s) => s < z / 1.001) ?? MIN_ZOOM)
  zoomTo(next, ax, ay)
}

export function panBy(dx: number, dy: number): void {
  const v = get().view
  set({ view: { ...v, panX: v.panX + dx, panY: v.panY + dy } })
}

/* ------------------------------ UI ------------------------------ */

let toastId = 0
export function toast(text: string, kind: Toast['kind'] = 'info', ms = 3200): void {
  const id = ++toastId
  set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }))
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms)
}

export function setMode(mode: Mode): void {
  set({ mode })
  try {
    localStorage.setItem('easystudio.photo.mode', mode)
  } catch {
    /* ignore */
  }
}

export function setTool(tool: Tool): void {
  const s = get()
  if (s.tool === tool) return
  set({ tool, crop: tool === 'crop' ? s.crop : null })
}

/** Ask a yes/no question in an in-app dialog (instead of the browser's plain confirm box). */
export function ask(text: string, yes: string, no: string): Promise<boolean> {
  return new Promise((resolve) => {
    get().question?.resolve(false)
    set({
      question: {
        text,
        yes,
        no,
        resolve: (v) => {
          set({ question: null })
          resolve(v)
        }
      }
    })
  })
}

export function bumpFontEpoch(): void {
  set((s) => ({ fontEpoch: s.fontEpoch + 1 }))
}

export function setBusy(busy: string | null): void {
  set({ busy, busyProgress: null })
}
