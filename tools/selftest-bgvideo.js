// Runs inside EasyStudio Video (Electron --selftest --selftest-visible --license pro).
// Makes a 2-second video of .cache/testimg/photo.png (two people, slow zoom), puts it over a
// blue picture and removes its background with the AI; checks the player and an export.
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__ev; i++) await wait(100)
const { library, editor: E, project: P, store, bgRemoval: B, engine, mediabunny: MB, platform, media: MD, exportJob: XJ } = window.__ev
const res = {}
const OUT = ROOT + '.cache/tmp/'
const byName = (n) => store.useVideo.getState().media.find((x) => x.name === n)
await library.importPaths([ROOT + '.cache/testimg/photo.png', ROOT + '.cache/testmedia/test-picture.png'])
const photo = MD.mediaHandles(byName('photo.png').id).image
// 1) The test video (640x640, 30 fps, 2 s)
const io = platform.exportFile()
const fid = await io.open(OUT + 'people.mp4')
const cv = new OffscreenCanvas(640, 640)
const g = cv.getContext('2d')
const out = new MB.Output({ format: new MB.Mp4OutputFormat(), target: new MB.StreamTarget(new WritableStream({ write: (c) => io.write(fid, c.position, c.data) }), { chunked: true }) })
const src = new MB.CanvasSource(cv, { codec: 'avc', bitrate: 4e6 })
out.addVideoTrack(src, { frameRate: 30 })
await out.start()
for (let i = 0; i < 60; i++) {
  const k = 1 + i * 0.002
  g.drawImage(photo, (640 - 640 * k) / 2, (640 - 640 * k) / 2, 640 * k, 640 * k)
  await src.add(i / 30, 1 / 30)
}
await out.finalize()
await io.close(fid, true)
await library.importPaths([OUT + 'people.mp4'])
// 2) Blue picture on the main track, the people video above it (fills the 16:9 frame height)
E.addToTimeline(byName('test-picture.png').id)
E.updateClip(P.mainTrack(E.getProject()).clips[0].id, 'len', { out: 2 })
engine.seek(0)
E.addToTimeline(byName('people.mp4').id, { kind: 'overlay', start: 0 })
const clip = E.getProject().tracks.find((t) => t.kind === 'overlay').clips[0]
E.selectClip(clip.id)
await wait(400)
res.button = document.querySelector('.bg-btn strong')?.textContent
const px = async (t, pts) => {
  engine.seek(t)
  await wait(600)
  const sc = engine.lastScene
  const d = engine.renderer.exportPixels(sc, sc.width, sc.height, null).data
  return pts.map(([x, y]) => [...d.slice((y * sc.width + x) * 4, (y * sc.width + x) * 4 + 3)].join(','))
}
// Frame 1920x1080; the 640 video is fitted to 1080 high, centred: x 420..1500.
// Crowd above the players ~ (960, 60); the left player's shirt ~ (660, 900).
const points = [[960, 60], [660, 900]]
res.before = await px(1, points)
const t0 = performance.now()
res.ok = await B.removeVideoBackground(clip.id)
res.seconds = +((performance.now() - t0) / 1000).toFixed(1)
res.state = B.useBgRemoval.getState()
res.mask = P.findClip(E.getProject(), clip.id).clip.bgMask
await wait(500)
res.after = await px(1, points)
// Save one mask frame to look at
const [mm] = await library.importPaths([res.mask.path])
const min = new MB.Input({ formats: MB.ALL_FORMATS, source: new MB.CustomSource({ getSize: () => mm.file.size, read: (a, b) => platform.readMedia(mm.file, a, b) }) })
const mcv = (await new MB.CanvasSink(await min.getPrimaryVideoTrack()).getCanvas(1)).canvas
const mpng = mcv.convertToBlob ? await mcv.convertToBlob() : await new Promise((r) => mcv.toBlob(r))
await window.easyStudio.saveFile({ data: new Uint8Array(await mpng.arrayBuffer()), defaultName: 'x.png', filters: [], path: OUT + 'bg-mask.png' })
res.buttonAfter = document.querySelector('.bg-btn strong')?.textContent
// 3) Export at 720p and look at the same places (scaled by 2/3)
const ok = await XJ.runExport({ format: 'mp4', width: 1280, height: 720, fps: 30, quality: 'medium' }, OUT + 'bg-export.mp4')
const [m] = await library.importPaths([OUT + 'bg-export.mp4'])
const input = new MB.Input({ formats: MB.ALL_FORMATS, source: new MB.CustomSource({ getSize: () => m.file.size, read: (a, b) => platform.readMedia(m.file, a, b) }) })
const frame = (await new MB.CanvasSink(await input.getPrimaryVideoTrack()).getCanvas(1)).canvas
const fd = frame.getContext('2d').getImageData(0, 0, frame.width, frame.height).data
res.exported = { ok, px: points.map(([x, y]) => { const i = (Math.round(y * 2 / 3) * frame.width + Math.round(x * 2 / 3)) * 4; return [...fd.slice(i, i + 3)].join(',') }) }
E.selectClip(null)
engine.seek(1)
await wait(600)
return res
