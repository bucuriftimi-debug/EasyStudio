// Store screenshots of EasyStudio Video, made by tools/store-shots.cjs (which fills in __SHOT__,
// __LANG__ and __MEDIA__: copies of the demo media with tidy names in the listing's language).
// Only our own pictures: the sunset drawn by tools/make-shot-media.ps1 and pictures from the
// photo templates (.cache/demo). Nothing made by others may appear (Store policy 10.1.1.3).
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__ev; i++) await wait(100)
const { library, editor: E, project: P, engine, store, exportJob: X, subtitles: S } = window.__ev
const SHOT = __SHOT__
const LANG = __LANG__
const M = __MEDIA__
;[...document.querySelectorAll('.lang-switch button')].find((b) => b.textContent === (LANG === 'ro' ? 'RO' : 'EN'))?.click()
await wait(300)
const fileName = (p) => p.split(/[\\/]/).pop()
const id = (p) => store.useVideo.getState().media.find((x) => x.name === fileName(p)).id

if (SHOT === 'subtitles') {
  // Automatic subtitles over the sunset (the speech model is already in .data/video/hf).
  await library.importPaths([M.sunset, M.voice])
  E.addToTimeline(id(M.sunset))
  E.addToTimeline(id(M.voice))
  E.updateClip(P.mainTrack(E.getProject()).clips[0].id, 'len', { out: 22 })
  await S.makeSubtitles({ language: 'en', model: 'base', look: 'box' })
  S.closeSubtitles()
  const subs = E.getProject().tracks.find((t) => t.kind === 'overlay').clips
  const cue = subs[Math.min(2, subs.length - 1)]
  E.setZoom(60)
  engine.seek(cue.start + (cue.out - cue.in) / 2)
  await wait(1200)
  E.selectClip(cue.id)
} else {
  await library.importPaths([M.sunset, M.poster, M.birthday, M.sale, M.music])
  E.addToTimeline(id(M.sunset))
  E.addToTimeline(id(M.poster))
  E.addToTimeline(id(M.birthday))
  E.addToTimeline(id(M.sale))
  const main = P.mainTrack(E.getProject()).clips
  E.updateClip(main[1].id, 'tr', { transition: { kind: 'dissolve', dur: 1 } })
  E.updateClip(main[2].id, 'tr', { transition: { kind: 'slide', dur: 0.8 } })
  E.updateClip(main[3].id, 'tr', { transition: { kind: 'zoom', dur: 0.8 } })
  engine.seek(0)
  E.addToTimeline(id(M.music))
  E.addToTimeline(id(M.music), { kind: 'audio', start: 4 })
  engine.seek(0.5)
  const tid = E.addTitle({ text: LANG === 'ro' ? 'Vacanța de vară' : 'My Summer Trip', font: 'Pacifico', size: 130, weight: 400, italic: false, color: '#ffffff', fill: true, align: 'center', lineHeight: 1.15, letterSpacing: 0, uppercase: false, strokeColor: '#000000', strokeWidth: 0, shadowColor: '#000000', shadowBlur: 24, shadowX: 0, shadowY: 4, bgColor: '#7b6bff', bgEnabled: false, bgRadius: 16, bgPadding: 24 })
  E.updateClip(tid, 'pos', { transform: { cx: 960, cy: 250, sx: 1, sy: 1, rot: 0 } })
  E.setZoom(60)
  await wait(1500)
  engine.seek(2)
  await wait(800)
  if (SHOT === 'export') X.openExport()
  else E.selectClip(tid)
}
store.useVideo.setState({ toasts: [] })
await wait(1500)
localStorage.removeItem('easystudio.lang')
return SHOT
