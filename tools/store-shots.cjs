// Makes the Microsoft Store screenshots (1600 × 900, English and Romanian; bigger windows do not fit on a 1080p screen) into
// .cache/store-shots/. Usage: node tools/store-shots.cjs [photo|video]
const { execFileSync } = require('node:child_process')
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
const electron = join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
const out = join(root, '.cache', 'store-shots')
const tmp = join(root, '.cache', 'tmp')
mkdirSync(out, { recursive: true })
const SHOTS = { photo: ['editor', 'filters', 'ai', 'export'], video: ['editor', 'export'] }
for (const app of process.argv[2] ? [process.argv[2]] : ['photo', 'video']) {
  const script = readFileSync(join(__dirname, `store-shots-${app}.js`), 'utf8')
  for (const lang of ['en', 'ro'])
    for (const shot of SHOTS[app]) {
      const file = join(tmp, `store-shot-${app}.js`)
      writeFileSync(file, script.replace(/__SHOT__/g, JSON.stringify(shot)).replace(/__LANG__/g, JSON.stringify(lang)))
      const png = join(out, `${app}-${lang}-${shot}.png`)
      const args = [join(root, 'apps', app), '--selftest', '--selftest-size', '1600x900', '--selftest-script', file, '--selftest-shot', png, '--license', 'pro']
      if (app === 'video') args.push('--selftest-visible')
      execFileSync(electron, args, { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] })
      console.log(png)
    }
}
