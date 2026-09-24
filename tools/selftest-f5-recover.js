// Part 2 of the F5 test, run with --selftest-session after selftest-f5.js (which left an
// autosave behind, like a crash would). `--selftest-script ... restore` style is not possible,
// so the step is chosen by the page URL hash set below: first run = look, second run = restore.
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__es; i++) await wait(100)
const { store: S, files: F } = window.__es
const res = {}
for (let i = 0; i < 30 && !S.useEditor.getState().recovery; i++) await wait(100)
res.recovery = S.useEditor.getState().recovery
res.banner = document.querySelector('.recover-banner')?.textContent ?? null
res.recentShown = document.querySelectorAll('.recent-item').length
res.templatesShown = document.querySelectorAll('.template img').length
if (localStorage.getItem('selftest.restore') === '1') {
  localStorage.removeItem('selftest.restore')
  await F.restoreRecovered()
  await wait(500)
  const d = S.getDoc()
  res.restored = d ? { name: d.name, layers: d.layers.length, dirty: S.isDirty() } : null
  res.recoveryAfter = S.useEditor.getState().recovery
  S.useEditor.setState({ tour: 1 })
  await wait(400)
  res.tourCard = document.querySelector('.tour-card strong')?.textContent ?? null
} else {
  localStorage.setItem('selftest.restore', '1')
  for (let i = 0; i < 40 && document.querySelectorAll('.template img').length < 6; i++) await wait(100)
  res.templatesShown = document.querySelectorAll('.template img').length
}
return res
