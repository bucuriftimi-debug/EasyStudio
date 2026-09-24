// V4 test: crash recovery + recent projects. Run 3 times:
//   1) plain --selftest            → builds a project and writes the recovery copy (like a crash)
//   2) --selftest-session          → sees the recovery banner (screenshot), leaves it
//   3) --selftest-session          → restores it and checks it is the same project
const DIR = ROOT + '.cache/testmedia/'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__ev; i++) await wait(100)
const { library, editor: E, project: P, session: Sn, store, engine } = window.__ev
const res = {}
const shape = () => E.getProject().tracks.map((t) => `${t.kind}:${t.clips.length}`).join(' ')
const step = localStorage.getItem('selftest.v4') ?? '1'
res.step = step
if (step === '1') {
  await library.importPaths([DIR + 'test-720p30.mp4', DIR + 'test-music.wav'])
  const m = store.useVideo.getState().media
  E.addToTimeline(m.find((x) => x.name === 'test-720p30.mp4').id)
  engine.seek(1)
  E.addToTimeline(m.find((x) => x.name === 'test-music.wav').id)
  E.addTitle({ text: 'Recovered?', font: 'Montserrat', size: 90, weight: 900, italic: false, color: '#ffffff', fill: true, align: 'center', lineHeight: 1.15, letterSpacing: 0, uppercase: false, strokeColor: '#000000', strokeWidth: 0, shadowColor: '#000000', shadowBlur: 0, shadowX: 0, shadowY: 0, bgColor: '#7b6bff', bgEnabled: false, bgRadius: 16, bgPadding: 24 })
  await Sn.autosave()
  res.shape = shape()
  localStorage.setItem('selftest.v4', '2')
} else {
  for (let i = 0; i < 30 && !Sn.useSession.getState().recovery; i++) await wait(100)
  res.recovery = Sn.useSession.getState().recovery
  res.banner = !!document.querySelector('.recover-banner')
  if (step === '2') localStorage.setItem('selftest.v4', '3')
  else {
    localStorage.removeItem('selftest.v4')
    await Sn.restoreRecovered()
    await wait(800)
    res.shape = shape()
    res.title = E.getProject().tracks.flatMap((t) => t.clips).find((c) => c.text)?.text.text
    res.dirty = E.isDirty()
    res.recoveryAfter = Sn.useSession.getState().recovery
  }
}
return res
