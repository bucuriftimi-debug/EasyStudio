// Runs inside EasyStudio Video (Electron --selftest --selftest-visible). Automatic subtitles on
// .cache/testmedia/speech-en.wav (made with Windows speech synthesis), over a picture.
// The first run downloads the speech model into .data/video/hf.
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__ev; i++) await wait(100)
const { library, editor: E, project: P, store, subtitles: S } = window.__ev
const DIR = ROOT + '.cache/testmedia/'
const res = {}
await library.importPaths([DIR + 'test-picture.png', DIR + 'speech-en.wav'])
const id = (n) => store.useVideo.getState().media.find((x) => x.name === n).id
E.addToTimeline(id('test-picture.png'))
E.addToTimeline(id('speech-en.wav'))
const picture = P.mainTrack(E.getProject()).clips[0]
E.updateClip(picture.id, 'len', { out: 22 })
res.duration = +P.projectDuration(E.getProject()).toFixed(2)
S.openSubtitles()
await wait(300)
res.dialog = document.querySelector('.es-modal h2')?.textContent
const phases = []
const unsub = S.useSubtitles.subscribe((s) => phases[phases.length - 1] !== s.phase && phases.push(s.phase))
const t0 = performance.now()
res.ok = await S.makeSubtitles({ language: MODEL_LANG, model: MODEL, look: 'classic' })
unsub()
res.seconds = +((performance.now() - t0) / 1000).toFixed(1)
res.phases = phases
res.state = { phase: S.useSubtitles.getState().phase, error: S.useSubtitles.getState().error, count: S.useSubtitles.getState().count }
const p = E.getProject()
const subTrack = p.tracks.find((t) => t.kind === 'overlay')
res.tracks = p.tracks.map((t) => `${t.kind}:${t.clips.length}`)
res.cues = subTrack ? subTrack.clips.map((c) => `${c.start.toFixed(1)}-${(c.start + (c.out - c.in)).toFixed(1)} ${c.text.text.replace('\n', ' / ')}`) : []
S.closeSubtitles()
return res
