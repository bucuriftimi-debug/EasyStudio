import { describe, expect, it } from 'vitest'
import { cutPauses, DEFAULT_PAUSES, removedSeconds, speechRanges } from './pauses'
import { addClip, makeClip, newProject, projectDuration, type MediaFacts } from './project'

const STEP = 0.05
/** Loudness track: -60 dB silence with -20 dB speech in the given seconds. */
function track(total: number, speech: [number, number][]): Float32Array {
  const db = new Float32Array(Math.round(total / STEP)).fill(-60)
  for (const [a, b] of speech) for (let i = Math.round(a / STEP); i < Math.round(b / STEP); i++) db[i] = -20
  return db
}

describe('cut out pauses', () => {
  it('finds speech with padding and keeps short pauses', () => {
    const r = speechRanges(track(10, [[1, 3], [3.3, 4], [6, 8]]), STEP, DEFAULT_PAUSES)
    expect(r.length).toBe(2)
    expect(r[0][0]).toBeCloseTo(0.85)
    expect(r[0][1]).toBeCloseTo(4.15)
    expect(r[1][0]).toBeCloseTo(5.85)
    expect(r[1][1]).toBeCloseTo(8.15)
    expect(removedSeconds(r, 10)).toBeCloseTo(10 - 3.3 - 2.3)
  })

  it('returns nothing for silence', () => {
    expect(speechRanges(new Float32Array(100).fill(-60), STEP, DEFAULT_PAUSES).length).toBeLessThanOrEqual(1)
  })

  const facts: MediaFacts = { kind: 'video', duration: 10, hasVideo: true, hasAudio: true }

  it('replaces a main-track clip by its spoken parts', () => {
    let p = newProject('x')
    const c = { ...makeClip('m1', facts), fadeOut: 1 }
    p = addClip(p, c, { kind: 'main' })
    p = addClip(p, makeClip('m2', facts), { kind: 'main' })
    const q = cutPauses(p, c.id, [
      [1, 3],
      [6, 8]
    ])
    const clips = q.tracks[0].clips
    expect(clips.length).toBe(3)
    expect(clips[0].id).toBe(c.id)
    expect([clips[0].in, clips[0].out, clips[1].in, clips[1].out]).toEqual([1, 3, 6, 8])
    expect(clips[0].fadeOut).toBe(0)
    expect(clips[1].fadeOut).toBe(1)
    expect(clips[2].mediaId).toBe('m2')
    expect(projectDuration(q)).toBeCloseTo(14)
  })

  it('respects the speed of the clip', () => {
    let p = newProject('x')
    const c = { ...makeClip('m1', facts), speed: 2 }
    p = addClip(p, c, { kind: 'main' })
    const q = cutPauses(p, c.id, [[1, 2]])
    expect([q.tracks[0].clips[0].in, q.tracks[0].clips[0].out]).toEqual([2, 4])
  })

  it('packs the pieces on other tracks', () => {
    let p = newProject('x')
    const c = makeClip('a1', { kind: 'audio', duration: 10, hasVideo: false, hasAudio: true })
    p = addClip(p, c, { kind: 'audio', start: 5 })
    const q = cutPauses(p, c.id, [
      [1, 2],
      [4, 6]
    ])
    const clips = q.tracks.find((t) => t.kind === 'audio')!.clips
    expect(clips.map((x) => x.start)).toEqual([5, 6])
  })
})
