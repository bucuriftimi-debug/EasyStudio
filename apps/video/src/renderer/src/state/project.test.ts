import { describe, expect, it } from 'vitest'
import * as P from './project'

const video = (duration: number): P.MediaFacts => ({ kind: 'video', duration, hasVideo: true, hasAudio: true })
const music = (duration: number): P.MediaFacts => ({ kind: 'audio', duration, hasVideo: false, hasAudio: true })
const picture: P.MediaFacts = { kind: 'image', duration: 0, hasVideo: true, hasAudio: false }

function withMain(...lens: number[]) {
  let p = P.newProject('t')
  const ids: string[] = []
  for (const l of lens) {
    const c = P.makeClip('m', video(l))
    ids.push(c.id)
    p = P.addClip(p, c, { kind: 'main' })
  }
  return { p, ids }
}

const starts = (p: P.Project) => P.mainTrack(p).clips.map((c) => +c.start.toFixed(3))

describe('main track is magnetic', () => {
  it('clips sit back to back', () => {
    const { p } = withMain(4, 2, 3)
    expect(starts(p)).toEqual([0, 4, 6])
    expect(P.projectDuration(p)).toBe(9)
  })

  it('deleting closes the gap', () => {
    const { p, ids } = withMain(4, 2, 3)
    expect(starts(P.removeClip(p, ids[0]))).toEqual([0, 2])
  })

  it('reordering moves the others', () => {
    const { p, ids } = withMain(4, 2, 3)
    const q = P.reorderMain(p, ids[2], 0)
    expect(P.mainTrack(q).clips.map((c) => c.id)).toEqual([ids[2], ids[0], ids[1]])
    expect(starts(q)).toEqual([0, 3, 7])
  })

  it('trimming the end shifts what follows (ripple)', () => {
    const { p, ids } = withMain(4, 2)
    const q = P.trimClip(p, ids[0], 'end', -1.5, video(4))
    expect(starts(q)).toEqual([0, 2.5])
  })

  it('trimming the start changes the in point, not the position', () => {
    const { p, ids } = withMain(4, 2)
    const q = P.trimClip(p, ids[1], 'start', 0.5, video(2))
    const c = P.findClip(q, ids[1])!.clip
    expect(c.in).toBeCloseTo(0.5)
    expect(c.start).toBe(4)
    expect(P.clipDur(c)).toBeCloseTo(1.5)
  })

  it('cannot trim past the source', () => {
    const { p, ids } = withMain(4)
    const q = P.trimClip(p, ids[0], 'end', 10, video(4))
    expect(P.findClip(q, ids[0])!.clip.out).toBe(4)
    const r = P.trimClip(p, ids[0], 'start', -3, video(4))
    expect(P.findClip(r, ids[0])!.clip.in).toBe(0)
  })

  it('split makes two clips that play the same frames', () => {
    const { p, ids } = withMain(4, 2)
    const { project, rightId } = P.splitClip(p, ids[0], 1.5)
    const main = P.mainTrack(project).clips
    expect(main.length).toBe(3)
    expect(main[0].out).toBeCloseTo(1.5)
    expect(main[1].id).toBe(rightId)
    expect(main[1].in).toBeCloseTo(1.5)
    expect(starts(project)).toEqual([0, 1.5, 4])
  })

  it('split respects speed', () => {
    const { p, ids } = withMain(4)
    const fast = P.updateClip(p, ids[0], { speed: 2 })
    expect(P.projectDuration(fast)).toBe(2)
    const { project } = P.splitClip(fast, ids[0], 1)
    expect(P.mainTrack(project).clips[1].in).toBeCloseTo(2)
  })
})

describe('free tracks', () => {
  it('music goes to an audio track, a second overlapping one to a new track', () => {
    let p = P.newProject('t')
    p = P.addClip(p, P.makeClip('a', music(10)), { kind: 'audio', start: 0 })
    p = P.addClip(p, P.makeClip('b', music(10)), { kind: 'audio', start: 5 })
    expect(p.tracks.filter((t) => t.kind === 'audio').length).toBe(2)
    p = P.addClip(p, P.makeClip('c', music(3)), { kind: 'audio', start: 10 })
    expect(p.tracks.filter((t) => t.kind === 'audio').length).toBe(2)
  })

  it('moving onto another clip is refused', () => {
    let p = P.newProject('t')
    const a = P.makeClip('a', music(4))
    const b = P.makeClip('b', music(4))
    p = P.addClip(p, a, { kind: 'audio', start: 0 })
    p = P.addClip(p, b, { kind: 'audio', start: 6 })
    expect(P.moveFree(p, b.id, 2)).toBe(p)
    expect(P.findClip(P.moveFree(p, b.id, 4), b.id)!.clip.start).toBe(4)
  })

  it('overlays are placed above the main track and removed when empty', () => {
    let p = P.newProject('t')
    const o = P.makeClip('pic', picture, 0)
    p = P.addClip(p, o, { kind: 'overlay', start: 1 })
    expect(p.tracks.map((t) => t.kind)).toEqual(['main', 'overlay'])
    expect(P.clipDur(P.findClip(p, o.id)!.clip)).toBe(P.IMAGE_SECONDS)
    expect(P.removeClip(p, o.id).tracks.length).toBe(1)
  })

  it('pictures can be made longer', () => {
    let p = P.newProject('t')
    const o = P.makeClip('pic', picture)
    p = P.addClip(p, o, { kind: 'main' })
    p = P.trimClip(p, o.id, 'end', 3, picture)
    expect(P.projectDuration(p)).toBe(8)
  })
})

describe('snapping', () => {
  it('snaps to the nearest point within tolerance', () => {
    expect(P.snap(4.93, [0, 5, 9], 0.1)).toBe(5)
    expect(P.snap(4.5, [0, 5, 9], 0.1)).toBe(4.5)
  })
})

describe('transitions and titles', () => {
  it('a transition makes the clip start before the previous one ends', () => {
    const { p, ids } = withMain(4, 3, 2)
    const q = P.updateClip(p, ids[1], { transition: { kind: 'dissolve', dur: 1 } })
    expect(starts(q)).toEqual([0, 3, 6])
    expect(P.projectDuration(q)).toBe(8)
  })

  it('the overlap is limited to half of each clip', () => {
    const { p, ids } = withMain(1, 4)
    const q = P.updateClip(p, ids[1], { transition: { kind: 'black', dur: 2 } })
    expect(starts(q)).toEqual([0, 0.5])
  })

  it('the first clip has no overlap even with a transition', () => {
    const { p, ids } = withMain(4, 3)
    const q = P.reorderMain(P.updateClip(p, ids[1], { transition: { kind: 'zoom', dur: 1 } }), ids[1], 0)
    expect(starts(q)).toEqual([0, 3])
  })

  it('titles go on a free track and can be made longer', () => {
    let p = P.newProject('t')
    const c = P.makeTextClip({ text: 'Hi' } as never, 2)
    p = P.addClip(p, c, { kind: 'overlay', start: 2 })
    expect(P.clipDur(P.findClip(p, c.id)!.clip)).toBe(P.TEXT_SECONDS)
    p = P.trimClip(p, c.id, 'end', 2, P.TEXT_FACTS)
    expect(P.projectDuration(p)).toBe(7)
  })

  it('old projects get the new fields', () => {
    const old = { name: 'x', width: 1920, height: 1080, fps: 30, tracks: [{ id: 't', kind: 'main', muted: false, hidden: false, clips: [{ id: 'c', mediaId: 'm', start: 0, in: 0, out: 2, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, transform: null, opacity: 1 }] }] }
    const up = P.upgradeProject(old as never)
    const c = up.tracks[0].clips[0]
    expect(c.adjust).toEqual({})
    expect(c.look).toBeNull()
    expect(c.transition).toBeNull()
  })
})
