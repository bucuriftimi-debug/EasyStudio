// Store screenshots of EasyStudio Photo, made by tools/store-shots.cjs (which fills in
// __SHOT__ and __LANG__ and runs the app with --selftest-size 1600x900 --selftest-shot).
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__es; i++) await wait(100)
const { actions: A, store: S, templates: T } = window.__es
const SHOT = __SHOT__
const LANG = __LANG__
;[...document.querySelectorAll('.lang-switch button')].find((b) => b.textContent === (LANG === 'ro' ? 'Română' : 'English'))?.click()
await wait(400)
const tpl = (id) => T.TEMPLATES.find((t) => t.id === id)
// A template flattened into one picture, opened like a photo (AI tools and filters work on pictures).
async function openAsPhoto(id, name) {
  await A.openTemplate(tpl(id))
  await wait(600)
  const d = S.getDoc()
  const blob = await A.renderExport(d, { format: 'png', quality: 90, width: d.width, height: d.height })
  await A.openBytes(name, blob)
  await wait(600)
}
const selectBig = () => {
  const doc = S.getDoc()
  const title = doc.layers.filter((l) => l.type === 'text').sort((a, b) => b.style.size - a.style.size)[0]
  const h = S.useEditor.getState().hist
  S.useEditor.setState({ hist: { ...h, present: { ...h.present, state: { ...doc, activeLayerId: title.id } } } })
}
if (SHOT === 'editor') {
  await A.openTemplate(tpl('youtube'))
  await wait(600)
  selectBig()
  S.useEditor.setState({ panel: 'props' })
} else if (SHOT === 'filters') {
  await openAsPhoto('event', LANG === 'ro' ? 'Afiș.png' : 'Poster.png')
  S.useEditor.setState({ panel: 'filters' })
} else if (SHOT === 'ai') {
  await openAsPhoto('birthday', LANG === 'ro' ? 'Felicitare.png' : 'Birthday.png')
  document.querySelector('.ai-btn')?.click()
} else if (SHOT === 'export') {
  await A.openTemplate(tpl('sale'))
  await wait(600)
  S.useEditor.setState({ dialog: 'export' })
}
await wait(300)
S.useEditor.setState({ toasts: [] })
await wait(1500)
localStorage.removeItem('easystudio.lang')
return SHOT
