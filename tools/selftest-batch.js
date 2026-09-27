// Runs inside EasyStudio Photo (Electron --selftest). Batch editing: 5 generated photos get the
// "warm" filter, auto-fix and the "small" size, and are saved into .cache/tmp/batch-out/.
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__es; i++) await wait(100)
const { store: S, batch: B, license: L } = window.__es
const res = {}
const files = []
for (let i = 0; i < 5; i++) {
  const c = new OffscreenCanvas(1600 + i * 200, 1200)
  const g = c.getContext('2d')
  const gr = g.createLinearGradient(0, 0, c.width, c.height)
  gr.addColorStop(0, '#333')
  gr.addColorStop(1, ['#88aadd', '#dd8888', '#88dd99', '#dddd88', '#bb88dd'][i])
  g.fillStyle = gr
  g.fillRect(0, 0, c.width, c.height)
  const data = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg' })).arrayBuffer())
  files.push({ name: `holiday-${i + 1}.jpg`, path: null, read: async () => data })
}
files.push({ name: 'broken.jpg', path: null, read: async () => new Uint8Array([1, 2, 3]) })
const BS = String.fromCharCode(92)
const folder = (ROOT + '.cache/tmp/batch-out').split('/').join(BS)
const steps = []
const t0 = performance.now()
const r = await B.runBatch(files, folder, { look: 'warm', auto: true, longEdge: 800, format: 'jpeg', quality: 85, suffix: '-edited' }, (d, n, name) => steps.push(`${d}/${n} ${name}`))
res.result = { ...r, ms: Math.round(performance.now() - t0), steps: steps.length }
// Read back one result
const back = await window.easyStudio.recent.read(folder + BS + 'holiday-3-edited.jpg').catch((e) => String(e))
res.readBack = typeof back === 'string' ? back : back.data.length
// The dialog opens and, in the free version, more than 3 photos asks for Pro
S.useEditor.setState({ dialog: 'batch' })
await wait(400)
res.dialog = { title: document.querySelector('.es-modal h2')?.textContent, freeNote: !!document.querySelector('.batch-form .es-pro-badge') }
S.useEditor.setState({ dialog: null })
return res
