// Runs inside the app (Electron --selftest). Exercises every AI feature on a real photo and
// saves the results next to the project (.cache/tmp) for visual inspection.
const OUT = ROOT + '.cache/tmp/'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__es; i++) await wait(100)
const { actions: A, store: S, ai: AI } = window.__es
// Answer "yes" to any question (e.g. model download).
const auto = setInterval(() => S.useEditor.getState().question?.resolve(true), 100)
const res = {}
const toastsSince = () => S.useEditor.getState().toasts.map((t) => `${t.kind}: ${t.text}`)
const save = async (name) => {
  const d = S.getDoc()
  const b = await A.renderExport(d, { format: 'png', quality: 90, width: d.width, height: d.height })
  await window.easyStudio.saveFile({ data: new Uint8Array(await b.arrayBuffer()), defaultName: name, filters: [], path: OUT + name })
}
const time = async (label, fn, limit = 180000) => {
  const t0 = performance.now()
  console.log(`step ${label} …`)
  try {
    await Promise.race([fn(), wait(limit).then(() => Promise.reject(new Error('timeout')))])
  } catch (e) {
    res[label + 'Error'] = String(e)
  }
  res[label + 'Ms'] = Math.round(performance.now() - t0)
  console.log(`step ${label} done in ${res[label + 'Ms']} ms; toasts: ${JSON.stringify(toastsSince())}; busy: ${S.useEditor.getState().busy}`)
}

const blob = await (await fetch('app://photo/__selftest.png')).blob()
await A.openBytes('photo.png', blob)
await wait(300)
await time('device', async () => {
  res.device = await AI.aiDevice()
}, 60000)

await time('removeBg', () => AI.removeBackground())
res.removeBgMask = !!S.getDoc().layers[0].mask
await save('ai-removebg.png')
await time('removeBgAgain', () => AI.removeBackground())
while (S.useEditor.getState().hist.past.length) S.undo()

const saveSel = async (name) => {
  const sel = S.useEditor.getState().selection
  if (!sel) return
  const c = new OffscreenCanvas(sel.canvas.width, sel.canvas.height)
  const x = c.getContext('2d')
  x.fillStyle = '#000'
  x.fillRect(0, 0, c.width, c.height)
  x.drawImage(sel.canvas, 0, 0)
  const b = await c.convertToBlob({ type: 'image/png' })
  await window.easyStudio.saveFile({ data: new Uint8Array(await b.arrayBuffer()), defaultName: name, filters: [], path: OUT + name })
}
await time('subject', () => AI.selectSubject())
res.subjectBounds = S.useEditor.getState().selection?.bounds ?? null
await saveSel('ai-sel-subject.png')
A.deselect()
await time('objectFirst', () => AI.selectObjectAt({ x: 131, y: 285 }, 'replace'))
res.objectBounds = S.useEditor.getState().selection?.bounds ?? null
await saveSel('ai-sel-person.png')
await time('objectSecond', () => AI.selectObjectAt({ x: 348, y: 366 }, 'replace'))
res.ballBounds = S.useEditor.getState().selection?.bounds ?? null
await saveSel('ai-sel-ball.png')
A.deselect()

await time('erase', () => AI.eraseObject([{ x: 318, y: 352 }, { x: 378, y: 372 }], 110))
await save('ai-erase.png')

await time('upscale', () => AI.upscale(4))
res.upscaledSize = [S.getDoc().width, S.getDoc().height]
await save('ai-upscale.png')

res.toasts = toastsSince()
res.history = [...S.useEditor.getState().hist.past.map((e) => e.label), S.useEditor.getState().hist.present.label]
clearInterval(auto)
return res
