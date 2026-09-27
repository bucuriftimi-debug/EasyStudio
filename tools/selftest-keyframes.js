// Runs inside EasyStudio Video (Electron --selftest --selftest-visible --license pro).
// Keyframes on a title (the player, the panel and the exported file) and an entering animation.
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__ev; i++) await wait(100)
const { editor: E, project: P, engine, store, exportJob: XJ, library, mediabunny: MB, platform } = window.__ev
const res = {}
const OUT = ROOT + '.cache/tmp/'
// White square title on the black frame (easy to find in pixels).
engine.seek(0)
const id = E.addTitle({ text: '■', font: 'Montserrat', size: 160, weight: 900, italic: false, color: '#ffffff', fill: true, align: 'center', lineHeight: 1, letterSpacing: 0, uppercase: false, strokeColor: '#000000', strokeWidth: 0, shadowColor: '#000000', shadowBlur: 0, shadowX: 0, shadowY: 0, bgColor: '#000000', bgEnabled: false, bgRadius: 0, bgPadding: 0 })
E.updateClip(id, 'len', { out: 4, transform: { cx: 400, cy: 540, sx: 1, sy: 1, rot: 0 } })
E.selectClip(id)
// Brightness-weighted centre of the frame now in the player.
const centre = async (t) => {
  engine.seek(t)
  await wait(250)
  const sc = engine.lastScene
  const d = engine.renderer.exportPixels(sc, sc.width, sc.height, null).data
  let sx = 0, sw = 0
  for (let y = 0; y < sc.height; y += 4) for (let x = 0; x < sc.width; x += 4) { const v = d[(y * sc.width + x) * 4]; if (v > 128) { sx += x * v; sw += v } }
  return sw ? { x: Math.round(sx / sw), bright: Math.round(sw / 1000) } : { x: null, bright: 0 }
}
engine.seek(0.5)
await wait(300)
res.buttonBefore = [...document.querySelectorAll('.kf-row button')].map((b) => b.textContent).join('|')
E.addKeyframe(id)
await wait(200)
res.buttonAtKey = [...document.querySelectorAll('.kf-row button')].map((b) => b.textContent).join('|')
engine.seek(2.5)
await wait(200)
const c1 = P.findClip(E.getProject(), id).clip
E.updateClip(id, 'move', { transform: { ...E.clipMotion(c1, E.getProject(), 2.5).tr, cx: 1000 } })
const c2 = P.findClip(E.getProject(), id).clip
res.keys = c2.keys.map((k) => `${k.t}s@${Math.round(k.tr.cx)}`)
res.player = { t0_5: await centre(0.5), t1_5: await centre(1.5), t2_5: await centre(2.5), t3_5: await centre(3.5) }
res.timelineDiamonds = document.querySelectorAll('.tl-kf').length
// The same movement in an exported video (1280x720: positions scale by 2/3).
const ok = await XJ.runExport({ format: 'mp4', width: 1280, height: 720, fps: 30, quality: 'medium' }, OUT + 'kf-test.mp4')
const [m] = await library.importPaths([OUT + 'kf-test.mp4'])
const input = new MB.Input({ formats: MB.ALL_FORMATS, source: new MB.CustomSource({ getSize: () => m.file.size, read: (a, b) => platform.readMedia(m.file, a, b) }) })
const sink = new MB.CanvasSink(await input.getPrimaryVideoTrack())
const xs = []
for (const t of [0.5, 1.5, 2.5]) {
  const cv = (await sink.getCanvas(t)).canvas
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
  let sx = 0, sw = 0
  for (let y = 0; y < cv.height; y += 3) for (let x = 0; x < cv.width; x += 3) { const v = d[(y * cv.width + x) * 4]; if (v > 128) { sx += x * v; sw += v } }
  xs.push(sw ? Math.round(sx / sw) : null)
}
res.exported = { ok, x: xs }
// Entering animation: fade over 1 s.
E.updateClip(id, 'anim', { keys: [], anim: { in: 'fade', out: null, dur: 1 } })
res.fade = { t0_2: (await centre(0.2)).bright, t2: (await centre(2)).bright }
return res
