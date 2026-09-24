// Runs inside EasyStudio Video (Electron --selftest --selftest-visible). Checks the Free / Pro
// export rules and the "Made with EasyStudio" mark. Run with `--license free` and `--license pro`
// (needs .cache/testmedia from tools/video-make-testmedia.js).
const DIR = ROOT + '.cache/testmedia/'
const OUT = ROOT + '.cache/tmp/'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__ev; i++) await wait(100)
const { store, library, editor: E, exportJob: XJ, license: L, mediabunny: MB, platform } = window.__ev
const S = store.useVideo
const res = {}
const dialog = () => L.useLicense.getState().dialog

res.status = await window.easyStudio.license.status()
await wait(300)
res.proButton = !!document.querySelector('.es-pro-btn')

await library.importPaths([DIR + 'test-720p30.mp4'])
E.addToTimeline(S.getState().media.find((m) => m.name === 'test-720p30.mp4').id)

// The export window: which choices are marked PRO.
XJ.openExport()
await wait(500)
res.dialogBadges = document.querySelectorAll('.es-modal .es-pro-badge').length
res.watermarkNote = document.querySelector('.exp-mark')?.textContent ?? null
const btn4k = [...document.querySelectorAll('.es-modal button')].find((b) => b.textContent.startsWith('4K'))
btn4k?.click()
await wait(200)
res.click4k = { dialog: dialog(), summary: document.querySelector('.exp-summary span')?.textContent }
L.useLicense.setState({ dialog: null })
XJ.closeExport()

// A locked export does not start, even when asked for directly.
res.run4k = await XJ.runExport({ format: 'mp4', width: 3840, height: 2160, fps: 30, quality: 'medium' }, OUT + 'pro-4k.mp4')
res.run4kDialog = dialog()
L.useLicense.setState({ dialog: null })

// 720p and 1080p exports; count bright pixels where the mark goes (bottom right).
async function brightCorner(name, w, h) {
  const ok = await XJ.runExport({ format: 'mp4', width: w, height: h, fps: 30, quality: 'medium' }, OUT + name)
  const [m] = await library.importPaths([OUT + name])
  const input = new MB.Input({ formats: MB.ALL_FORMATS, source: new MB.CustomSource({ getSize: () => m.file.size, read: (a, b) => platform.readMedia(m.file, a, b) }) })
  const c = (await new MB.CanvasSink(await input.getPrimaryVideoTrack()).getCanvas(1)).canvas
  const bw = Math.round(c.width * 0.3)
  const bh = Math.round(c.height * 0.09)
  const d = c.getContext('2d').getImageData(c.width - bw, c.height - bh, bw, bh).data
  let bright = 0
  for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) bright++
  const png = await c.convertToBlob?.() ?? await new Promise((r) => c.toBlob(r))
  await window.easyStudio.saveFile({ data: new Uint8Array(await png.arrayBuffer()), defaultName: name + '.png', filters: [], path: OUT + name + '.png' })
  return { ok, size: `${c.width}x${c.height}`, brightShare: +(bright / (bw * bh)).toFixed(4) }
}
res.export720 = await brightCorner('pro-720.mp4', 1280, 720)
res.export1080 = await brightCorner('pro-1080.mp4', 1920, 1080)
return res
