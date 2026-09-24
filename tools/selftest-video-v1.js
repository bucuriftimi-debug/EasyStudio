// V1 test for EasyStudio Video: timeline editing + playback + project save/open.
// Run with --selftest-visible (needs .cache/testmedia from tools/video-make-testmedia.js).
const DIR = ROOT + '.cache/testmedia/'
const OUT = ROOT + '.cache/tmp/'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__ev; i++) await wait(100)
const { engine, store, library, editor: E, project: P, projectFile: F, platform } = window.__ev
const S = store.useVideo
const res = {}
const proj = () => E.getProject()
const mainClips = () => P.mainTrack(proj()).clips
const shape = () => proj().tracks.map((t) => `${t.kind}:[${t.clips.map((c) => `${S.getState().media.find((m) => m.id === c.mediaId)?.name.split('.')[0]}@${c.start.toFixed(2)}+${P.clipDur(c).toFixed(2)}`).join(' ')}]`).join(' ')

// Which frame of the 720p test clip is on screen (bits at the top of the frame).
function frameShown(scale = 1.5, dx = 0, dy = 0) {
  const r = engine.renderer
  const sc = engine.lastScene
  const px = r.exportPixels(sc, sc.width, sc.height, null)
  let n = 0
  for (let b = 0; b < 10; b++) {
    const x = Math.round(dx + (b * 64 + 32) * scale)
    const y = Math.round(dy + 32 * scale)
    if (px.data[(y * sc.width + x) * 4] > 128) n |= 1 << b
  }
  return n
}
const pixel = (x, y) => {
  const sc = engine.lastScene
  const px = engine.renderer.exportPixels(sc, sc.width, sc.height, null)
  const i = (y * sc.width + x) * 4
  return [px.data[i], px.data[i + 1], px.data[i + 2]]
}
const at = async (t) => {
  engine.seek(t)
  await wait(400)
}

await library.importPaths([DIR + 'test-720p30.mp4', DIR + 'test-phone.mp4', DIR + 'test-music.wav', DIR + 'test-picture.png'])
const byName = (n) => S.getState().media.find((m) => m.name === n)
const v720 = byName('test-720p30.mp4')
const phone = byName('test-phone.mp4')
const music = byName('test-music.wav')
const pic = byName('test-picture.png')

// 1) Build: two videos + a picture on the main track, music on a sound track.
E.addToTimeline(v720.id)
E.addToTimeline(phone.id)
E.addToTimeline(pic.id)
engine.seek(0)
E.addToTimeline(music.id)
res.format = `${proj().width}x${proj().height}@${proj().fps}`
res.built = shape()
res.duration = +engine.duration.toFixed(2)

// 2) Exact frames from the timeline
await at(2.5)
res.frameAt2_5 = frameShown()
// phone clip is portrait inside a landscape frame: check it shows (centre column is not black)
await at(7)
res.phoneCentre = pixel(960, 540)
res.phoneSide = pixel(100, 540)

// 3) Split the first clip at 3 s, trim 1 s off the start of the right part
E.selectClip(mainClips()[0].id)
engine.seek(3)
E.splitAtPlayhead()
res.afterSplit = shape()
await at(3.5)
res.frameAt3_5 = frameShown()
const right = mainClips()[1]
E.commit('trim', (p) => P.trimClip(p, right.id, 'start', 1, E.facts(v720)))
res.afterTrim = shape()
await at(mainClips()[1].start + 0.01)
res.frameAfterTrim = frameShown()

// 4) Reorder: the picture first
const picClip = mainClips().find((c) => c.mediaId === pic.id)
E.commit('move', (p) => P.reorderMain(p, picClip.id, 0))
res.afterReorder = shape()
await at(1)
res.pictureAt1 = pixel(960, 300)

// 5) Undo back to the split state, redo once
E.undo()
E.undo()
res.afterUndo = shape()
E.redo()
res.afterRedo = shape()

// 6) Play across a cut (end of the first part → second part)
const cut = P.clipEnd(mainClips()[0])
await at(cut - 0.6)
await engine.play()
const seen = []
for (let i = 0; i < 10; i++) {
  await wait(110)
  seen.push(`${engine.time.toFixed(2)}:${frameShown()}`)
}
res.audioParts = engine.audio.length
engine.pause()
res.acrossCut = seen

// 7) Save, start a new project, open it again
const json = F.serialize(proj())
await platform.saveFile(new TextEncoder().encode(json), 'test.esv', [], OUT + 'test.esv')
const before = shape()
E.useEditor.setState({ savedProject: proj() })
await F.newProject()
res.afterNew = shape()
await F.loadProjectText(json, OUT + 'test.esv')
res.reopenedSame = shape() === before
res.reopened = shape()

// Leave it in a nice state for the screenshot
E.setZoom(55)
await at(2.2)
E.selectClip(mainClips()[1].id)
await wait(1500)
return res
