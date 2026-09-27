// Runs inside EasyStudio Photo (Electron --selftest --license pro). Checks portrait retouching:
// 1) the pure maths on a synthetic picture (noisy skin gets smoother, edges and non-skin stay),
// 2) the whole flow with the AI model on the picture given with --selftest-image (optional),
// 3) whitening inside a selection.
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__es; i++) await wait(100)
const { actions: A, store: S, retouch: R, bitmaps: B } = window.__es
const res = {}
const auto = setInterval(() => S.useEditor.getState().question?.resolve(true), 100)

// 1) Synthetic: left half noisy skin tone, right half noisy blue; a dark "eye" line in the skin.
const W = 400, H = 300
const c = new OffscreenCanvas(W, H)
const g = c.getContext('2d', { willReadFrequently: true })
const img = g.createImageData(W, H)
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 30
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4
    const skin = x < W / 2
    const eye = skin && y > 140 && y < 160 && x > 60 && x < 140
    const base = eye ? [40, 30, 30] : skin ? [224, 172, 140] : [60, 110, 220]
    const n = rnd()
    img.data[i] = base[0] + n
    img.data[i + 1] = base[1] + n
    img.data[i + 2] = base[2] + n
    img.data[i + 3] = 255
  }
g.putImageData(img, 0, 0)
const out = R.smoothSkinPixels(c, null, 1).data
const std = (d, x0, x1, y0, y1) => {
  const v = []
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) v.push(d[(y * W + x) * 4])
  const m = v.reduce((a, b) => a + b, 0) / v.length
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length)
}
res.synthetic = {
  skinNoiseBefore: +std(img.data, 20, 180, 20, 120).toFixed(1),
  skinNoiseAfter: +std(out, 20, 180, 20, 120).toFixed(1),
  blueNoiseBefore: +std(img.data, 220, 380, 20, 280).toFixed(1),
  blueNoiseAfter: +std(out, 220, 380, 20, 280).toFixed(1),
  eyeCentreBefore: img.data[(150 * W + 100) * 4],
  eyeCentreAfter: out[(150 * W + 100) * 4]
}

// 3) Whitening: a yellowish "teeth" patch; mask covers its left half.
const t = new OffscreenCanvas(100, 50)
const tg = t.getContext('2d', { willReadFrequently: true })
tg.fillStyle = 'rgb(220,200,140)'
tg.fillRect(0, 0, 100, 50)
const mask = new Uint8ClampedArray(100 * 50)
for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) mask[y * 100 + x] = 255
const w = R.whitenPixels(t, mask, 0.8).data
res.whiten = { inside: [...w.slice((25 * 100 + 25) * 4, (25 * 100 + 25) * 4 + 3)].join(','), outside: [...w.slice((25 * 100 + 75) * 4, (25 * 100 + 75) * 4 + 3)].join(',') }

// 2) Real picture with the AI model (if one was given)
try {
  const blob = await (await fetch('app://photo/__selftest.png')).blob()
  await A.openBytes('portrait.png', blob)
  await wait(500)
  const before = S.getDoc().layers[0].bitmapId
  S.useEditor.setState({ dialog: 'retouch' })
  await wait(400)
  res.dialog = { title: document.querySelector('.es-modal h2')?.textContent, slider: !!document.querySelector('.es-modal .es-slider, .es-modal input') }
  S.useEditor.setState({ dialog: null })
  const t0 = performance.now()
  await R.retouchPortrait(0.7)
  res.real = { ms: Math.round(performance.now() - t0), changed: S.getDoc().layers[0].bitmapId !== before, toasts: S.useEditor.getState().toasts.map((x) => x.text) }
  const d = S.getDoc()
  const png = await A.renderExport(d, { format: 'png', quality: 90, width: d.width, height: d.height })
  await window.easyStudio.saveFile({ data: new Uint8Array(await png.arrayBuffer()), defaultName: 'x.png', filters: [], path: ROOT + '.cache/tmp/retouch-after.png' })
} catch (e) {
  res.realError = String(e)
}
clearInterval(auto)
return res
