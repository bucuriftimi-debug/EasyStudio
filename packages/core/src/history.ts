/**
 * Snapshot-based undo/redo. Documents are immutable, so each entry is just a reference
 * to a previous state (structural sharing keeps this cheap). Pixel data lives outside the
 * document (referenced by id), so snapshots never copy pixels.
 */
export interface HistoryEntry<T> {
  label: string
  state: T
}

export interface History<T> {
  past: HistoryEntry<T>[]
  present: HistoryEntry<T>
  future: HistoryEntry<T>[]
}

export const DEFAULT_HISTORY_LIMIT = 60

export function createHistory<T>(state: T, label: string): History<T> {
  return { past: [], present: { label, state }, future: [] }
}

export function pushHistory<T>(
  h: History<T>,
  state: T,
  label: string,
  limit = DEFAULT_HISTORY_LIMIT
): History<T> {
  if (state === h.present.state) return h
  const past = [...h.past, h.present]
  if (past.length > limit) past.splice(0, past.length - limit)
  return { past, present: { label, state }, future: [] }
}

/** Replace the present state without creating an entry (live previews while dragging). */
export function replacePresent<T>(h: History<T>, state: T): History<T> {
  return { ...h, present: { ...h.present, state } }
}

export function canUndo<T>(h: History<T>): boolean {
  return h.past.length > 0
}

export function canRedo<T>(h: History<T>): boolean {
  return h.future.length > 0
}

export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h
  const past = h.past.slice(0, -1)
  const present = h.past[h.past.length - 1]
  return { past, present, future: [h.present, ...h.future] }
}

export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h
  const [present, ...future] = h.future
  return { past: [...h.past, h.present], present, future }
}

/** All entries in chronological order, with the index of the present one. */
export function historyTimeline<T>(h: History<T>): { entries: HistoryEntry<T>[]; current: number } {
  return { entries: [...h.past, h.present, ...h.future], current: h.past.length }
}

/** Jump to an entry by its index in `historyTimeline(h).entries`. */
export function jumpTo<T>(h: History<T>, index: number): History<T> {
  const { entries } = historyTimeline(h)
  if (index < 0 || index >= entries.length) return h
  return {
    past: entries.slice(0, index),
    present: entries[index],
    future: entries.slice(index + 1)
  }
}

export function allHistoryStates<T>(h: History<T>): T[] {
  return [...h.past.map((e) => e.state), h.present.state, ...h.future.map((e) => e.state)]
}
