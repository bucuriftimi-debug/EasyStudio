// V3 test for EasyStudio Video: export to MP4 / WebM, then open the result and check it.
// Run with --selftest-visible (needs .cache/testmedia from tools/video-make-testmedia.js).
const DIR = ROOT + '.cache/testmedia/'
const OUT = ROOT + '.cache/tmp/'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__ev; i++) await wait(100)
const { engine, store, library, editor: E, project: P } = window.__ev
const S = store.useVideo
const res = {}
const proj = () => E.getProject()
const main = () => P.mainTrack(proj()).clips
const frameShown = (scale) => {
  const sc = engine.lastScene
  const d = engine.renderer.exportPixels(sc, sc.width, sc.height, null).data
  let n = 0
  for (let b = 0; b < 10; b++) if (d[(Math.round(32 * scale) * sc.width + Math.round((b * 64 + 32) * scale)) * 4] > 128) n |= 1 << b
  return n
}

await library.importPaths([DIR + 'test-720p30.mp4', DIR + 'test-phone.mp4', DIR + 'test-music.wav'])
const byName = (n) => S.getState().media.find((m) => m.name === n)
E.addToTimeline(byName('test-720p30.mp4').id)
E.addToTimeline(byName('test-phone.mp4').id)
E.updateClip(main()[1].id, 'tr', { transition: { kind: 'dissolve', dur: 0.5 } })
engine.seek(0)
E.addToTimeline(byName('test-music.wav').id)
res.projectDuration = +P.projectDuration(proj()).toFixed(3)

const XJ = window.__ev.exportJob
async function doExport(name, settings) {
  const t0 = performance.now()
  const ok = await XJ.runExport(settings, OUT + name)
  const secs = (performance.now() - t0) / 1000
  const st = XJ.useExport.getState()
  return { ok, secs: +secs.toFixed(2), fps: +((P.projectDuration(proj()) * settings.fps) / secs).toFixed(1), status: st.status, error: st.error }
}

res.mp4 = await doExport('export-test.mp4', { format: 'mp4', width: 1920, height: 1080, fps: 30, quality: 'medium' })
res.webm = await doExport('export-test.webm', { format: 'webm', width: 1280, height: 720, fps: 30, quality: 'small' })

// Cancel: start a 4K export and stop it quickly — the unfinished file must be gone.
const p4k = XJ.runExport({ format: 'mp4', width: 3840, height: 2160, fps: 30, quality: 'high' }, OUT + 'export-cancel.mp4')
await wait(700)
XJ.cancelExport()
res.cancelResult = await p4k
res.cancelStatus = XJ.useExport.getState().status

// Open the results and check them.
const outs = await library.importPaths([OUT + 'export-test.mp4', OUT + 'export-test.webm'])
res.outputs = outs.map((m) => `${m.name}: ${m.width}x${m.height} ${m.duration.toFixed(2)}s fps=${m.fps} v=${m.videoCodec} a=${m.audioCodec} ok=${m.playable}`)
const cancelled = await library.importPaths([OUT + 'export-cancel.mp4'])
res.cancelledFileGone = cancelled.length === 0

// Frames of the exported MP4, decoded straight from the file (the 720p clip was scaled 1.5×).
const { mediabunny: MB, platform } = window.__ev
const out = S.getState().media.find((m) => m.name === 'export-test.mp4')
const input = new MB.Input({ formats: MB.ALL_FORMATS, source: new MB.CustomSource({ getSize: () => out.file.size, read: (a, b) => platform.readMedia(out.file, a, b) }) })
const sink = new MB.CanvasSink(await input.getPrimaryVideoTrack())
const frames = []
for (const t of [0.5, 2.5, 4.9]) {
  const c = (await sink.getCanvas(t)).canvas
  const d = c.getContext('2d').getImageData(0, 0, c.width, 100).data
  let n = 0
  for (let b = 0; b < 10; b++) if (d[(48 * c.width + Math.round((b * 64 + 32) * 1.5)) * 4] > 128) n |= 1 << b
  frames.push(`${t}s→${n} (want ${Math.floor(t * 30 + 1e-6)})`)
}
res.exportedFrames = frames
const atrack = await input.getPrimaryAudioTrack()
res.exportedAudio = atrack ? `${await atrack.getCodec()} ${await atrack.getNumberOfChannels()}ch ${await atrack.getSampleRate()}Hz` : null
return res
