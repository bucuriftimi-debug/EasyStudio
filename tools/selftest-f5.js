// Runs inside the app (Electron --selftest). Tests F5: PSD import, templates, recent files,
// autosave (part 1 of crash recovery) and the Romanian translation. Pass the test PSD with
// --selftest-image .cache/testimg/test.psd (make it with `node tools/make-test-psd.mjs`).
const OUT = ROOT + '.cache/tmp/'
const PSD_PATH = ROOT + '.cache/testimg/test.psd'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__es; i++) await wait(100)
const { actions: A, store: S, files: F, templates: T } = window.__es
const bridge = window.easyStudio
const res = {}
const save = async (name) => {
  const d = S.getDoc()
  const b = await A.renderExport(d, { format: 'png', quality: 90, width: d.width, height: d.height })
  await bridge.saveFile({ data: new Uint8Array(await b.arrayBuffer()), defaultName: name, filters: [], path: OUT + name })
}
const auto = setInterval(() => S.useEditor.getState().question?.resolve(true), 100)

// 1) PSD import
const psdBlob = await (await fetch('app://photo/__selftest.png')).blob()
await A.openBytes('test.psd', psdBlob)
await wait(600)
const d = S.getDoc()
res.psdSize = `${d.width}x${d.height}`
res.psdLayers = d.layers.map((l) => `${l.name} | vis=${l.visible} op=${l.opacity} blend=${l.blend} mask=${!!l.mask} at=${Math.round(l.transform.cx)},${Math.round(l.transform.cy)} ${l.width}x${l.height}`)
res.psdToasts = S.useEditor.getState().toasts.map((t) => t.text)
await save('f5-psd.png')

// 2) Recent files (through the real bridge, with the PSD's real path)
res.recentAdd = (await bridge.recent.add(PSD_PATH)).map((r) => r.name)
res.recentRead = (await bridge.recent.read(PSD_PATH)).data.length
res.readNotAllowed = await bridge.recent.read('C:\\Windows\\win.ini').then(() => 'READ (bad!)', (e) => String(e.message).slice(-60))
await F.loadRecent()
res.recentInStore = S.useEditor.getState().recent.length

// 3) Templates: each one opens as layers and renders
res.templates = {}
for (const tpl of T.TEMPLATES) {
  await A.openTemplate(tpl)
  await wait(400)
  const doc = S.getDoc()
  res.templates[tpl.id] = `${doc.width}x${doc.height}, layers: ${doc.layers.map((l) => l.type[0]).join('')}`
  await save(`f5-tpl-${tpl.id}.png`)
}
res.previewUrl = (await T.templatePreview(T.TEMPLATES[0])).slice(0, 5)

// 4) Autosave: edit the document, write the recovery copy (the next run checks it comes back)
S.commit('test edit', (doc) => ({ ...doc, name: 'Recovery test' }))
await F.autosaveTick()
res.autosaveDirty = S.isDirty()

// 5) Romanian
res.menuBefore = document.querySelector('.menubar button')?.textContent
res.helpFound = !![...document.querySelectorAll('.menubar button')].find((b) => b.textContent === 'Help')
;[...document.querySelectorAll('.menubar button')].find((b) => b.textContent === 'Help')?.click()
await wait(200)
const ro = [...document.querySelectorAll('.es-menu-item')].find((b) => b.textContent.includes('Română'))
ro?.click()
await wait(300)
res.menuAfter = document.querySelector('.menubar button')?.textContent
res.htmlLang = document.documentElement.lang
clearInterval(auto)
// Leave the language to the automatic choice (Windows language) for the real app.
localStorage.removeItem('easystudio.lang')
return res
