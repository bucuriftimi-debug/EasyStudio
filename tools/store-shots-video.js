// Store screenshots of EasyStudio Video, made by tools/store-shots.cjs (which fills in
// __SHOT__ and __LANG__). A small demo project: pictures from the photo templates
// (.cache/demo, made by the photo app), music, a title and transitions.
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__ev; i++) await wait(100)
const { library, editor: E, project: P, engine, store, exportJob: X } = window.__ev
const SHOT = __SHOT__
const LANG = __LANG__
;[...document.querySelectorAll('.lang-switch button')].find((b) => b.textContent === (LANG === 'ro' ? 'RO' : 'EN'))?.click()
await wait(300)
const D = ROOT + '.cache/demo/'
await library.importPaths([ROOT + '.cache/testmedia/perf-1080p60.mp4', D + 'tpl-event.png', D + 'tpl-youtube.png', D + 'tpl-birthday.png', D + 'tpl-sale.png', ROOT + '.cache/testmedia/test-music.wav'])
const id = (n) => store.useVideo.getState().media.find((x) => x.name === n).id
E.addToTimeline(id('tpl-youtube.png'))
E.addToTimeline(id('tpl-event.png'))
E.addToTimeline(id('tpl-birthday.png'))
E.addToTimeline(id('tpl-sale.png'))
const main = P.mainTrack(E.getProject()).clips
E.updateClip(main[1].id, 'tr', { transition: { kind: 'dissolve', dur: 1 } })
E.updateClip(main[2].id, 'tr', { transition: { kind: 'slide', dur: 0.8 } })
E.updateClip(main[3].id, 'tr', { transition: { kind: 'zoom', dur: 0.8 } })
engine.seek(0)
E.addToTimeline(id('test-music.wav'))
E.addToTimeline(id('test-music.wav'), { kind: 'audio', start: 4 })
const at = P.mainTrack(E.getProject()).clips[1].start
engine.seek(at + 0.4)
const tid = E.addTitle({ text: LANG === 'ro' ? 'Vacanța de vară' : 'My Summer Trip', font: 'Pacifico', size: 110, weight: 400, italic: false, color: '#ffffff', fill: true, align: 'center', lineHeight: 1.15, letterSpacing: 0, uppercase: false, strokeColor: '#000000', strokeWidth: 0, shadowColor: '#000000', shadowBlur: 20, shadowX: 0, shadowY: 4, bgColor: '#7b6bff', bgEnabled: false, bgRadius: 16, bgPadding: 24 })
E.updateClip(tid, 'pos', { transform: { cx: 960, cy: 140, sx: 1, sy: 1, rot: 0 } })
E.setZoom(60)
await wait(1500)
engine.seek(at + 1.4)
await wait(800)
if (SHOT === 'export') X.openExport()
else E.selectClip(tid)
store.useVideo.setState({ toasts: [] })
await wait(1500)
localStorage.removeItem('easystudio.lang')
return SHOT
