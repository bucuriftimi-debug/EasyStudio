import { describe, expect, it } from 'vitest'
import type { TextStyle } from '@easystudio/draw'
import { addSubtitleTrack, splitCues, twoLines } from './subtitleCues'
import { newProject } from './project'

describe('subtitles', () => {
  it('keeps short sentences whole', () => {
    expect(splitCues([{ start: 1, end: 3, text: ' Hello there. ' }])).toEqual([{ start: 1, end: 3, text: 'Hello there.' }])
  })

  it('splits long sentences and shares the time by length', () => {
    const text = 'This is a rather long sentence that the speech recognition returned in one piece'
    const cues = splitCues([{ start: 0, end: 8, text }], 30)
    expect(cues.length).toBeGreaterThan(1)
    for (const c of cues) expect(c.text.length).toBeLessThanOrEqual(30)
    expect(cues.map((c) => c.text).join(' ')).toBe(text)
    expect(cues[0].start).toBe(0)
    expect(cues[cues.length - 1].end).toBeCloseTo(8)
    for (let i = 1; i < cues.length; i++) expect(cues[i].start).toBeCloseTo(cues[i - 1].end)
  })

  it('does not leave a lonely last word', () => {
    const cues = splitCues([{ start: 0, end: 5, text: 'Finally, add some music and export your video.' }])
    expect(cues.map((c) => c.text)).toEqual(['Finally, add some music', 'and export your video.'])
  })

  it('never overlaps and has a minimum length', () => {
    const cues = splitCues([
      { start: 0, end: 0.1, text: 'Hi' },
      { start: 0.5, end: 2, text: 'How are you?' }
    ])
    expect(cues[0].end).toBeLessThanOrEqual(cues[1].start)
    expect(cues[1].end - cues[1].start).toBeGreaterThanOrEqual(0.7)
  })

  it('drops empty text', () => {
    expect(splitCues([{ start: 0, end: 1, text: '   ' }])).toEqual([])
  })

  it('balances two lines', () => {
    expect(twoLines('short')).toBe('short')
    expect(twoLines('one two three four five six seven')).toBe('one two three four\nfive six seven')
  })

  it('adds a subtitle track above the pictures', () => {
    const p = newProject('x')
    p.tracks.push({ id: 'a', kind: 'audio', muted: false, hidden: false, clips: [] })
    const q = addSubtitleTrack(p, [{ start: 1, end: 2.5, text: 'Hello' }], { font: 'Montserrat', size: 60 } as TextStyle)
    expect(q.tracks.map((t) => t.kind)).toEqual(['main', 'overlay', 'audio'])
    const c = q.tracks[1].clips[0]
    expect(c.start).toBe(1)
    expect(c.out - c.in).toBeCloseTo(1.5)
    expect(c.text?.text).toBe('Hello')
    expect(c.transform?.cy).toBeGreaterThan(p.height / 2)
  })
})
