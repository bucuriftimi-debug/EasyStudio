// V0 test for EasyStudio Video (run with --selftest-visible so the page draws frames).
// Needs the files from tools/video-make-testmedia.js in .cache/testmedia.
const DIR = ROOT + '.cache/testmedia/'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__ev; i++) await wait(100)
const { engine, store, library } = window.__ev
const S = store.useVideo
const res = {}

// Frame number drawn as 10 bits (64 px blocks along the top of the coded frame).
function frameIndex(px, W, at) {
  let n = 0
  for (let b = 0; b < 10; b++) {
    const [x, y] = at(b)
    const i = (Math.round(y) * W + Math.round(x)) * 4
    if (px.data[i] > 128) n |= 1 << b
  }
  return n
}
const shown = (at) => {
  const r = engine.renderer
  const sc = engine.lastScene
  const px = r.exportPixels(sc, sc.width, sc.height, null)
  return frameIndex(px, sc.width, at)
}
const topRow = (b) => [b * 64 + 32, 32]

// 1) Import
const t0 = performance.now()
const added = await library.importPaths([DIR + 'test-720p30.mp4', DIR + 'test-phone.mp4', DIR + 'test-music.wav', DIR + 'test-picture.png'])
res.importMs = Math.round(performance.now() - t0)
res.media = S.getState().media.map((m) => `${m.name}: ${m.kind} ${m.width}x${m.height} ${m.duration.toFixed(2)}s fps=${m.fps} rot=${m.rotation} v=${m.videoCodec} a=${m.audioCodec} thumb=${!!m.thumb} ok=${m.playable}`)

// 2) Seeking shows the exact frame
const vid = S.getState().media.find((m) => m.name === 'test-720p30.mp4')
library.selectMedia(vid.id)
const seekChecks = []
for (const t of [0, 1, 2.5, 4.2, 5.9]) {
  engine.seek(t)
  await wait(350)
  seekChecks.push(`${t}s→frame ${shown(topRow)} (want ${Math.floor(t * 30 + 1e-6)})`)
}
res.seek = seekChecks

// 3) Playback: the frame on screen follows the clock
engine.seek(0.5)
await wait(300)
await engine.play()
const lag = []
for (let i = 0; i < 12; i++) {
  await wait(120)
  const f = shown(topRow)
  lag.push(Math.round(engine.time * 30 - f))
}
res.playLagFrames = lag
res.audioParts = engine.audio.length
engine.pause()
res.pausedAt = +engine.time.toFixed(2)

// 4) Phone video: rotation → 720×1280, bits now run down the right edge
const phone = S.getState().media.find((m) => m.name === 'test-phone.mp4')
library.selectMedia(phone.id)
engine.seek(1)
await wait(400)
res.phoneScene = `${engine.lastScene.width}x${engine.lastScene.height}`
res.phoneFrameAt1s = shown((b) => [720 - 32, b * 64 + 32])

// 4b) 1080p clip (coded 1920×1088): frame 30 at 1 s, bits along the top at scale 1
const hd = (await library.importPaths([DIR + 'test-1080p.mp4']))[0]
library.selectMedia(hd.id)
engine.seek(1)
await wait(500)
res.hdFrameAt1s = shown((b) => [b * 64 + 32, 32])

// 5) Picture and music
const pic = S.getState().media.find((m) => m.kind === 'image')
library.selectMedia(pic.id)
await wait(300)
res.pictureDuration = engine.duration
const wav = S.getState().media.find((m) => m.kind === 'audio')
library.selectMedia(wav.id)
await engine.play()
await wait(700)
res.musicPlaying = engine.isPlaying && engine.time > 0.3
res.musicAudioParts = engine.audio.length
engine.pause()

// Leave the 720p clip paused mid-way for the screenshot.
library.selectMedia(vid.id)
engine.seek(3.2)
await wait(500)
return res
