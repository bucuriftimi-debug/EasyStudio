// Playback smoothness on big videos (run with --selftest-visible). Makes a 4K 30 fps and a
// 1080p 60 fps test clip (hardware encoder), then plays each for 4 s and counts new frames shown.
const OUT = ROOT + '.cache/testmedia/'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__ev; i++) await wait(100)
const { mediabunny: MB, platform, library, editor: E, engine, store } = window.__ev
const res = {}

async function make(name, w, h, fps, seconds) {
  const output = new MB.Output({ format: new MB.Mp4OutputFormat(), target: new MB.BufferTarget() })
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')
  const src = new MB.CanvasSource(canvas, { codec: 'avc', bitrate: w * h * fps * 0.12 })
  output.addVideoTrack(src, { frameRate: fps })
  await output.start()
  const t0 = performance.now()
  for (let i = 0; i < fps * seconds; i++) {
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, `hsl(${(i * 3) % 360},70%,40%)`)
    g.addColorStop(1, `hsl(${(i * 3 + 180) % 360},70%,50%)`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#fff'
    ctx.font = `bold ${h / 6}px sans-serif`
    ctx.fillText(String(i), w * 0.4, h * 0.55)
    for (let k = 0; k < 40; k++) ctx.fillRect(((i * 17 + k * 97) % w) | 0, ((k * 131) % h) | 0, w / 30, h / 30)
    await src.add(i / fps, 1 / fps)
  }
  await output.finalize()
  res[name + 'EncodeSec'] = +((performance.now() - t0) / 1000).toFixed(1)
  await platform.saveFile(new Uint8Array(output.target.buffer), name, [], OUT + name)
}

await make('perf-4k30.mp4', 3840, 2160, 30, 8)
await make('perf-1080p60.mp4', 1920, 1080, 60, 8)
await library.importPaths([OUT + 'perf-4k30.mp4', OUT + 'perf-1080p60.mp4'])

for (const [name, fps] of [['perf-4k30.mp4', 30], ['perf-1080p60.mp4', 60]]) {
  const m = store.useVideo.getState().media.find((x) => x.name === name)
  await E.useEditor.getState()
  window.__ev.projectFile && (await window.__ev.projectFile.newProject())
  E.addToTimeline(m.id)
  engine.seek(0.5)
  await wait(500)
  engine.stats.draws = 0
  engine.stats.videoFrames = 0
  const t0 = engine.time
  await engine.play()
  await wait(4000)
  const played = engine.time - t0
  engine.pause()
  res[name] = { played: +played.toFixed(2), expectedFrames: Math.round(played * fps), shownFrames: engine.stats.videoFrames, draws: engine.stats.draws }
  E.useEditor.setState({ savedProject: E.getProject() })
}
return res
