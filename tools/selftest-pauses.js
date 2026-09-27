// Runs inside EasyStudio Video (Electron --selftest --selftest-visible). "Cut out pauses" on
// .cache/testmedia/speech-en.wav (make it with tools/make-speech-test.ps1).
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__ev; i++) await wait(100)
const { library, editor: E, project: P, store } = window.__ev
const res = {}
await library.importPaths([ROOT + '.cache/testmedia/speech-en.wav'])
const id = store.useVideo.getState().media.find((x) => x.name === 'speech-en.wav').id
E.addToTimeline(id)
const audio = () => E.getProject().tracks.find((t) => t.kind === 'audio')
const clip = audio().clips[0]
res.before = +P.clipDur(clip).toFixed(2)
E.selectClip(clip.id)
await wait(500)
const btn = document.querySelector('.pauses-btn')
res.button = btn?.textContent
btn?.click()
for (let i = 0; i < 50 && !/\d/.test(document.querySelector('.exp-summary span')?.textContent ?? ''); i++) await wait(100)
res.preview = { found: document.querySelector('.exp-summary span')?.textContent, shorter: document.querySelector('.exp-summary strong')?.textContent, kept: document.querySelectorAll('.pause-strip i').length }
;[...document.querySelectorAll('.es-modal button')].find((b) => b.textContent.includes(window.__ev.license ? '' : ''))
const apply = [...document.querySelectorAll('.es-modal-foot button')].pop()
apply.click()
await wait(400)
const clips = audio().clips
res.after = { pieces: clips.length, total: +clips.reduce((n, c) => n + P.clipDur(c), 0).toFixed(2), starts: clips.map((c) => +c.start.toFixed(2)), ranges: clips.map((c) => `${c.in.toFixed(2)}-${c.out.toFixed(2)}`) }
res.toasts = store.useVideo.getState().toasts.map((t) => t.text)
E.undo()
res.undo = audio().clips.length
return res
