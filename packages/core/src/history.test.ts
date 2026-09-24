import { describe, expect, it } from 'vitest'
import { createHistory, historyTimeline, jumpTo, pushHistory, redo, replacePresent, undo } from './history'

describe('history', () => {
  it('pushes, undoes and redoes', () => {
    let h = createHistory({ v: 0 }, 'open')
    h = pushHistory(h, { v: 1 }, 'a')
    h = pushHistory(h, { v: 2 }, 'b')
    expect(h.present.state.v).toBe(2)
    h = undo(h)
    expect(h.present.state.v).toBe(1)
    expect(h.present.label).toBe('a')
    h = undo(h)
    expect(h.present.state.v).toBe(0)
    h = undo(h) // no-op at the start
    expect(h.present.state.v).toBe(0)
    h = redo(redo(h))
    expect(h.present.state.v).toBe(2)
  })

  it('drops the redo branch when a new action is pushed', () => {
    let h = createHistory(0, 'open')
    h = pushHistory(h, 1, 'a')
    h = undo(h)
    h = pushHistory(h, 5, 'c')
    expect(h.future).toHaveLength(0)
    expect(historyTimeline(h).entries.map((e) => e.state)).toEqual([0, 5])
  })

  it('ignores pushes of the same state and respects the limit', () => {
    let h = createHistory(0, 'open')
    h = pushHistory(h, 0, 'same')
    expect(h.past).toHaveLength(0)
    for (let i = 1; i <= 10; i++) h = pushHistory(h, i, `s${i}`, 4)
    expect(h.past).toHaveLength(4)
    expect(h.present.state).toBe(10)
  })

  it('jumps to any timeline entry', () => {
    let h = createHistory('a', 'open')
    h = pushHistory(h, 'b', 'b')
    h = pushHistory(h, 'c', 'c')
    h = jumpTo(h, 0)
    expect(h.present.state).toBe('a')
    expect(h.future.map((e) => e.state)).toEqual(['b', 'c'])
    h = jumpTo(h, 2)
    expect(h.present.state).toBe('c')
  })

  it('replacePresent keeps the label and does not add entries', () => {
    let h = createHistory(1, 'open')
    h = replacePresent(h, 2)
    expect(h.past).toHaveLength(0)
    expect(h.present).toEqual({ label: 'open', state: 2 })
  })
})
