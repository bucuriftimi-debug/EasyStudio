// Runs inside EasyStudio Video (--selftest). Makes test media with Mediabunny (hardware encoder):
//   test-720p30.mp4  6 s, 1280×720, 30 fps, H.264 + AAC. The frame number is drawn as 10 black/white
//                    blocks along the top (bit 0 on the left), so tests can read which frame is shown.
//                    Sound: 440 Hz tone with a 1 kHz beep at the start of every second.
//   test-phone.mp4   3 s, stored 1280×720 with "rotate 90°" metadata (like phone videos) → shows 720×1280.
//   test-1080p.mp4   2 s, 1920×1080 (coded as 1920×1088), no sound.
//   test-music.wav   4 s chord.
//   test-picture.png 1600×900 picture.
const OUT = ROOT + '.cache/testmedia/'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (let i = 0; i < 100 && !window.__ev; i++) await wait(100)
const MB = window.__ev.mediabunny
const { saveFile } = window.__ev.platform
const res = {}

function drawFrame(ctx, w, h, i, fps, label) {
  const hue = (i * 6) % 360
  ctx.fillStyle = `hsl(${hue},55%,45%)`
  ctx.fillRect(0, 0, w, h)
  // frame number as bits
  for (let b = 0; b < 10; b++) {
    ctx.fillStyle = (i >> b) & 1 ? '#ffffff' : '#000000'
    ctx.fillRect(b * 64, 0, 64, 64)
  }
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 120px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(String(i), w / 2, h / 2 + 40)
  ctx.font = '40px sans-serif'
  ctx.fillText(`${label} ${(i / fps).toFixed(2)} s`, w / 2, h - 60)
  // moving square
  const x = ((i * 12) % (w - 100)) + 20
  ctx.fillStyle = '#ffeb3b'
  ctx.fillRect(x, h - 200, 80, 80)
}

function tone(seconds, rate, beeps) {
  const ch = 2
  const buf = new AudioBuffer({ length: Math.round(seconds * rate), sampleRate: rate, numberOfChannels: ch })
  for (let c = 0; c < ch; c++) {
    const d = buf.getChannelData(c)
    for (let n = 0; n < d.length; n++) {
      const t = n / rate
      const beep = beeps && t % 1 < 0.1
      d[n] = beep ? 0.5 * Math.sin(2 * Math.PI * 1000 * t) : 0.15 * Math.sin(2 * Math.PI * 440 * t)
    }
  }
  return buf
}

async function makeVideo(name, w, h, fps, seconds, meta, label, withAudio) {
  const output = new MB.Output({ format: new MB.Mp4OutputFormat(), target: new MB.BufferTarget() })
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')
  const vsrc = new MB.CanvasSource(canvas, { codec: 'avc', bitrate: MB.QUALITY_HIGH })
  output.addVideoTrack(vsrc, { frameRate: fps, ...meta })
  let asrc = null
  if (withAudio) {
    const codec = (await MB.canEncodeAudio('aac')) ? 'aac' : 'opus'
    res[name + 'AudioCodec'] = codec
    asrc = new MB.AudioBufferSource({ codec, bitrate: 128000 })
    output.addAudioTrack(asrc)
  }
  await output.start()
  const t0 = performance.now()
  for (let i = 0; i < fps * seconds; i++) {
    drawFrame(ctx, w, h, i, fps, label)
    await vsrc.add(i / fps, 1 / fps)
  }
  if (asrc) await asrc.add(tone(seconds, 48000, true))
  await output.finalize()
  res[name + 'EncodeMs'] = Math.round(performance.now() - t0)
  const bytes = new Uint8Array(output.target.buffer)
  res[name + 'KB'] = Math.round(bytes.length / 1024)
  await saveFile(bytes, name, [], OUT + name)
}

async function makeWav(name) {
  const output = new MB.Output({ format: new MB.WavOutputFormat(), target: new MB.BufferTarget() })
  const src = new MB.AudioBufferSource({ codec: 'pcm-s16' })
  output.addAudioTrack(src)
  await output.start()
  const rate = 44100
  const buf = new AudioBuffer({ length: rate * 4, sampleRate: rate, numberOfChannels: 2 })
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    for (let n = 0; n < d.length; n++) {
      const t = n / rate
      d[n] = 0.1 * (Math.sin(2 * Math.PI * 261.6 * t) + Math.sin(2 * Math.PI * 329.6 * t) + Math.sin(2 * Math.PI * 392 * t))
    }
  }
  await src.add(buf)
  await output.finalize()
  await saveFile(new Uint8Array(output.target.buffer), name, [], OUT + name)
}

async function makePng(name) {
  const c = new OffscreenCanvas(1600, 900)
  const x = c.getContext('2d')
  const g = x.createLinearGradient(0, 0, 1600, 900)
  g.addColorStop(0, '#0ea5e9')
  g.addColorStop(1, '#a855f7')
  x.fillStyle = g
  x.fillRect(0, 0, 1600, 900)
  x.fillStyle = '#fff'
  x.font = 'bold 110px sans-serif'
  x.textAlign = 'center'
  x.fillText('PICTURE', 800, 490)
  await saveFile(await c.convertToBlob({ type: 'image/png' }), name, [], OUT + name)
}

res.canEncodeAvc = await MB.canEncodeVideo('avc', { width: 1280, height: 720 })
res.canEncodeAac = await MB.canEncodeAudio('aac')
await makeVideo('test-720p30.mp4', 1280, 720, 30, 6, {}, 'TEST', true)
await makeVideo('test-phone.mp4', 1280, 720, 30, 3, { rotation: 90 }, 'PHONE', true)
// 1080p is stored as 1920×1088 by H.264: the player must still show it (regression check).
await makeVideo('test-1080p.mp4', 1920, 1080, 30, 2, {}, 'HD', false)
await makeWav('test-music.wav')
await makePng('test-picture.png')
return res
