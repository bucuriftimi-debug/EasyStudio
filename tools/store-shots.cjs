// Makes the Microsoft Store screenshots (1600 × 900, English and Romanian; bigger windows do not fit on a 1080p screen) into
// .cache/store-shots/. Usage: node tools/store-shots.cjs [photo|video]
// Store policy 10.1.1.3: the screenshots may show nothing made by others (other apps, brands, their
// logos or names), so the video demo uses our own pictures, copied under tidy names.
const { execFileSync } = require('node:child_process')
const { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
const electron = join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
const out = join(root, '.cache', 'store-shots')
const tmp = join(root, '.cache', 'tmp')
mkdirSync(out, { recursive: true })
const SHOTS = { photo: ['templates', 'editor', 'filters', 'ai', 'collage', 'export'], video: ['editor', 'subtitles', 'export'] }

// Demo media of the video app: [source, English name, Romanian name].
const MEDIA = {
  sunset: ['.cache/shots-media/sunset.png', 'sunset.png', 'apus.png'],
  poster: ['.cache/demo/tpl-event.png', 'poster.png', 'afis.png'],
  birthday: ['.cache/demo/tpl-birthday.png', 'birthday.png', 'felicitare.png'],
  sale: ['.cache/demo/tpl-sale.png', 'sale.png', 'reducere.png'],
  music: ['.cache/testmedia/test-music.wav', 'music.wav', 'muzica.wav'],
  voice: ['.cache/testmedia/speech-en.wav', 'voice.wav', 'voce.wav']
}
function media(lang) {
  if (!existsSync(join(root, MEDIA.sunset[0]))) execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(__dirname, 'make-shot-media.ps1')])
  const dir = join(root, '.cache', 'shots-media', lang)
  mkdirSync(dir, { recursive: true })
  const paths = {}
  for (const [key, [src, en, ro]] of Object.entries(MEDIA)) {
    paths[key] = join(dir, lang === 'ro' ? ro : en)
    copyFileSync(join(root, src), paths[key])
  }
  return paths
}

for (const app of process.argv[2] ? [process.argv[2]] : ['photo', 'video']) {
  const script = readFileSync(join(__dirname, `store-shots-${app}.js`), 'utf8')
  for (const lang of ['en', 'ro'])
    for (const shot of SHOTS[app]) {
      const file = join(tmp, `store-shot-${app}.js`)
      const code = script
        .replace(/__SHOT__/g, JSON.stringify(shot))
        .replace(/__LANG__/g, JSON.stringify(lang))
        .replace(/__MEDIA__/g, app === 'video' ? JSON.stringify(media(lang)) : 'null')
      writeFileSync(file, code)
      const png = join(out, `${app}-${lang}-${shot}.png`)
      const args = [join(root, 'apps', app), '--selftest', '--selftest-size', '1600x900', '--selftest-script', file, '--selftest-shot', png, '--license', 'pro']
      if (app === 'video') args.push('--selftest-visible')
      execFileSync(electron, args, { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] })
      console.log(png)
    }
}
