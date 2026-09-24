// V2 test for EasyStudio Video: transitions, titles, filters, speed, size, format, save/open.
// Run with --selftest-visible (needs .cache/testmedia from tools/video-make-testmedia.js).
const DIR = ROOT + '.cache/testmedia/'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__ev; i++) await wait(100)
const { engine, store, library, editor: E, project: P, projectFile: F } = window.__ev
const S = store.useVideo
const res = {}
const proj = () => E.getProject()
const main = () => P.mainTrack(proj()).clips
const scene = () => engine.lastScene
const px = (x, y) => {
  const sc = scene()
  const d = engine.renderer.exportPixels(sc, sc.width, sc.height, null).data
  const i = (Math.round(y) * sc.width + Math.round(x)) * 4
  return [d[i], d[i + 1], d[i + 2]]
}
const frameShown = (scale = 1.5) => {
  const sc = scene()
  const d = engine.renderer.exportPixels(sc, sc.width, sc.height, null).data
  let n = 0
  for (let b = 0; b < 10; b++) if (d[(Math.round(32 * scale) * sc.width + Math.round((b * 64 + 32) * scale)) * 4] > 128) n |= 1 << b
  return n
}
const at = async (t) => {
  engine.seek(t)
  await wait(400)
}
const layerOp = (clipId) => scene().layers.find((l) => l.id === 'L:' + clipId)?.opacity ?? null

await library.importPaths([DIR + 'test-720p30.mp4', DIR + 'test-phone.mp4', DIR + 'test-music.wav'])
const byName = (n) => S.getState().media.find((m) => m.name === n)
E.addToTimeline(byName('test-720p30.mp4').id)
E.addToTimeline(byName('test-phone.mp4').id)
res.durationBefore = +P.projectDuration(proj()).toFixed(2)

// 1) Dissolve of 1 s into the phone clip
const [a, b] = main()
E.updateClip(b.id, 'tr', { transition: { kind: 'dissolve', dur: 1 } })
res.durationAfter = +P.projectDuration(proj()).toFixed(2)
const bStart = main()[1].start
await at(bStart + 0.5)
res.midDissolve = { a: layerOp(a.id), b: +(layerOp(b.id) ?? 0).toFixed(2) }
await at(bStart + 1.05)
res.afterDissolve = { a: layerOp(a.id), b: layerOp(b.id) }

// 2) Black & white filter on the first clip
await at(1)
const colour = px(960, 700)
E.updateClip(a.id, 'look', { look: { id: 'mono', amount: 100 } })
await at(1)
const grey = px(960, 700)
res.filter = { colour, grey, isGrey: Math.abs(grey[0] - grey[1]) < 6 && Math.abs(grey[1] - grey[2]) < 6 }
E.updateClip(a.id, 'look', { look: null })

// 3) Speed 2×: at 1 s the first clip shows source second 2 (frame 60)
E.updateClip(a.id, 'speed', { speed: 2 })
await at(1)
res.speed2frame = frameShown()
res.durationAt2x = +P.projectDuration(proj()).toFixed(2)
E.updateClip(a.id, 'speed', { speed: 1 })

// 4) Title at 0.5 s
engine.seek(0.5)
const tid = E.addTitle({ ...window.__ev.editor.titleOf ? {} : {}, text: 'HELLO', font: 'Montserrat', size: 150, weight: 900, italic: false, color: '#ff0000', fill: true, align: 'center', lineHeight: 1.15, letterSpacing: 0, uppercase: false, strokeColor: '#000000', strokeWidth: 0, shadowColor: '#000000', shadowBlur: 0, shadowX: 0, shadowY: 0, bgColor: '#7b6bff', bgEnabled: false, bgRadius: 16, bgPadding: 24 })
await wait(800) // font load
await at(1)
res.titleTracks = proj().tracks.map((t) => t.kind).join(',')
res.titleLayer = !!scene().layers.find((l) => l.id === 'L:' + tid)
const tc = px(960, 540)
res.titlePixel = tc
res.titleIsRed = tc[0] > 180 && tc[1] < 90 && tc[2] < 90

// 5) Smaller clip: half size → the corner shows the black background
E.updateClip(a.id, 'size', { transform: { cx: 960, cy: 540, sx: 0.75, sy: 0.75, rot: 0 } })
await at(1)
res.cornerAfterShrink = px(20, 20)
E.updateClip(a.id, 'size', { transform: null })

// 6) Format 9:16
E.setFormat('9:16')
await at(1)
res.format = `${proj().width}x${proj().height}`
res.sceneSize = `${scene().width}x${scene().height}`
E.setFormat('16:9')

// 7) Save / open keeps everything
const json = F.serialize(proj())
const before = JSON.stringify(proj().tracks.map((t) => t.clips.map((c) => [c.text?.text ?? '', c.transition?.kind ?? '', c.look?.id ?? '', c.speed])))
await F.loadProjectText(json, null)
const after = JSON.stringify(proj().tracks.map((t) => t.clips.map((c) => [c.text?.text ?? '', c.transition?.kind ?? '', c.look?.id ?? '', c.speed])))
res.roundTrip = before === after
res.roundTripData = after

// For the screenshot: the title selected, paused on it
engine.seek(1.2)
await wait(300)
E.selectClip(proj().tracks.find((t) => t.kind === 'overlay').clips[0].id)
await wait(1200)
return res
