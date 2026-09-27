import { describe, expect, it } from 'vitest'
import { animate, keyAt, motionAt, removeKeyAt, scaleKeys, upsertKey, type Keyframe } from './motion'

const tr = (cx: number, sx = 1) => ({ cx, cy: 100, sx, sy: sx, rot: 0 })

describe('keyframes', () => {
  const keys: Keyframe[] = [
    { t: 1, tr: tr(0), opacity: 1 },
    { t: 3, tr: tr(200, 2), opacity: 0 }
  ]

  it('uses the clip itself without keyframes', () => {
    expect(motionAt(tr(5), 0.5, [], 2)).toEqual({ tr: tr(5), opacity: 0.5 })
  })

  it('holds before the first and after the last keyframe', () => {
    expect(motionAt(tr(5), 1, keys, 0).tr.cx).toBe(0)
    expect(motionAt(tr(5), 1, keys, 9).tr.cx).toBe(200)
  })

  it('blends smoothly in between', () => {
    const mid = motionAt(tr(5), 1, keys, 2)
    expect(mid.tr.cx).toBeCloseTo(100)
    expect(mid.tr.sx).toBeCloseTo(1.5)
    expect(mid.opacity).toBeCloseTo(0.5)
    // Ease: slower at the ends than a straight line.
    expect(motionAt(tr(5), 1, keys, 1.2).tr.cx).toBeLessThan(20)
  })

  it('adds, replaces and removes keyframes by time', () => {
    let k = upsertKey(keys, 2, tr(50), 1)
    expect(k.map((f) => f.t)).toEqual([1, 2, 3])
    k = upsertKey(k, 2.005, tr(60), 1)
    expect(k.length).toBe(3)
    expect(keyAt(k, 2)?.tr.cx).toBe(60)
    expect(removeKeyAt(k, 2).length).toBe(2)
  })

  it('scales keyframes for export', () => {
    expect(scaleKeys(keys, 2, 10, 0)[1].tr).toEqual({ cx: 410, cy: 200, sx: 4, sy: 4, rot: 0 })
  })
})

describe('animations', () => {
  const m = { tr: tr(500), opacity: 1 }
  it('fades in and out', () => {
    const a = { in: 'fade' as const, out: 'fade' as const, dur: 1 }
    expect(animate(m, a, 0, 5, 1920, 1080).opacity).toBe(0)
    expect(animate(m, a, 0.5, 5, 1920, 1080).opacity).toBeCloseTo(0.5)
    expect(animate(m, a, 2.5, 5, 1920, 1080).opacity).toBe(1)
    expect(animate(m, a, 4.5, 5, 1920, 1080).opacity).toBeCloseTo(0.5)
  })

  it('rises into place', () => {
    const a = { in: 'rise' as const, out: null, dur: 1 }
    expect(animate(m, a, 0, 5, 1920, 1080).tr.cy).toBeGreaterThan(100)
    expect(animate(m, a, 1, 5, 1920, 1080).tr.cy).toBeCloseTo(100)
  })

  it('pops a little past full size', () => {
    const a = { in: 'pop' as const, out: null, dur: 1 }
    const sizes = [0.2, 0.5, 0.7, 0.9].map((t) => animate(m, a, t, 5, 1920, 1080).tr.sx)
    expect(Math.max(...sizes)).toBeGreaterThan(1)
    expect(animate(m, a, 1, 5, 1920, 1080).tr.sx).toBeCloseTo(1)
  })

  it('never takes more than half a short clip', () => {
    const a = { in: 'fade' as const, out: 'fade' as const, dur: 2 }
    expect(animate(m, a, 0.5, 1, 1920, 1080).opacity).toBeCloseTo(1)
  })
})
