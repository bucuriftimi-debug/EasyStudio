// Runs inside the app (Electron --selftest). Tests the AI assistant end to end with the local
// Ollama (must be running). Restores the user's AI settings afterwards and leaves the assistant
// bar open with an answer, for --selftest-shot.
const OUT = ROOT + '.cache/tmp/'
const MODEL = 'qwen2.5:7b'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__es; i++) await wait(100)
const { actions: A, store: S, assistant: AS } = window.__es
const bridge = window.easyStudio.ai
const res = {}
const time = async (label, fn, limit = 240000) => {
  const t0 = performance.now()
  console.log(`step ${label} …`)
  try {
    await Promise.race([fn(), wait(limit).then(() => Promise.reject(new Error('timeout')))])
  } catch (e) {
    res[label + 'Error'] = String(e)
  }
  res[label + 'Ms'] = Math.round(performance.now() - t0)
  console.log(`step ${label} done in ${res[label + 'Ms']} ms`)
}
const size = () => `${S.getDoc().width}x${S.getDoc().height}`
const save = async (name) => {
  const d = S.getDoc()
  const b = await A.renderExport(d, { format: 'jpeg', quality: 85, width: d.width, height: d.height })
  await window.easyStudio.saveFile({ data: new Uint8Array(await b.arrayBuffer()), defaultName: name, filters: [], path: OUT + name })
}

// A landscape copy of the test photo, so cropping to a square is visible.
const src = await createImageBitmap(await (await fetch('app://photo/__selftest.png')).blob())
const land = new OffscreenCanvas(src.width, Math.round(src.height * 0.66))
land.getContext('2d').drawImage(src, 0, -Math.round(src.height * 0.12))
const blob = await land.convertToBlob({ type: 'image/png' })
await A.openBytes('photo.png', blob)
await wait(300)
res.original = size()
res.stats = AS.pictureStats(S.getDoc())

const orig = await bridge.settings()
res.ollamaModels = await bridge.ollamaModels()
await bridge.setSettings({ provider: 'ollama', models: { ...orig.models, ollama: MODEL } })

try {
  await time('test', async () => {
    res.test = await bridge.test()
  })

  // 1) A command with several edits → preview, toggle one off, apply as one undo step.
  const PROMPT = 'make it warmer and a bit brighter, crop it square for Instagram and add the title "Summer" at the top'
  let r
  await time('command', async () => {
    r = await AS.ask('command', PROMPT)
  })
  if (r) {
    res.commandText = r.reply.text
    res.commandRaw = r.reply.actions
    res.commandActions = r.actions.map((a) => a.label)
    res.previewSize = size()
    res.previewHistoryLen = S.useEditor.getState().hist.past.length
    const crop = r.actions.findIndex((a) => a.name === 'crop_to_shape')
    if (crop >= 0) {
      const toggled = r.actions.map((a, i) => (i === crop ? { ...a, enabled: false } : a))
      AS.preview(toggled)
      res.sizeWithoutCrop = size()
      AS.preview(r.actions)
      res.sizeWithCropAgain = size()
    }
    await AS.apply(r.actions, PROMPT)
    res.afterApplySize = size()
    res.history = S.useEditor.getState().hist.past.map((e) => e.label).concat(S.useEditor.getState().hist.present.label)
    res.layers = S.getDoc().layers.map((l) => `${l.type}:${l.name}`)
    await save('assist-command.jpg')
    S.undo()
    res.afterUndoSize = size()
    res.afterUndoLayers = S.getDoc().layers.length
  }

  // 2) "Suggest improvements", then Cancel must leave the picture untouched.
  const before = S.getDoc()
  await time('suggest', async () => {
    const s = await AS.ask('suggest', '')
    res.suggestText = s.reply.text
    res.suggestActions = s.actions.map((a) => a.label)
    AS.discard()
  })
  res.cancelRestored = S.getDoc() === before && !S.useEditor.getState().gestureBase

  // 3) The real UI: open the bar (Ctrl+K), type, press Ask, wait for the answer.
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
  await wait(300)
  const input = document.querySelector('.assist-input')
  res.barOpened = !!input
  if (input) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, 'black and white, more contrast, add a vignette')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await wait(100)
    document.querySelector('.assist-row .es-btn.primary').click()
    await time('ui', async () => {
      while (!document.querySelector('.assist-result') && !document.querySelector('.assist-error')) await wait(200)
    })
    res.uiMeta = document.querySelector('.assist-meta')?.textContent
    res.uiText = document.querySelector('.assist-text')?.textContent ?? null
    res.uiActions = [...document.querySelectorAll('.assist-actions li')].map((li) => li.textContent)
    res.uiError = document.querySelector('.assist-error')?.textContent ?? null
  }
} finally {
  await bridge.setSettings({ provider: orig.provider, models: orig.models })
}
return res
