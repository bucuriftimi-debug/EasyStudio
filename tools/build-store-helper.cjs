// Compiles tools/store-helper/StoreHelper.cs into build/StoreHelper.exe (shared by both apps).
// Uses the C# compiler of .NET Framework 4.x and the Windows metadata files, both part of
// Windows 10/11, so nothing has to be installed.
const { execFileSync } = require('node:child_process')
const { existsSync, mkdirSync, statSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
const src = join(__dirname, 'store-helper', 'StoreHelper.cs')
const outDir = join(root, 'build')
const out = join(outDir, 'StoreHelper.exe')
const win = process.env.SystemRoot || 'C:\\Windows'
const fx = join(win, 'Microsoft.NET', 'Framework64', 'v4.0.30319')
const winmd = join(win, 'System32', 'WinMetadata')

if (existsSync(out) && statSync(out).mtimeMs > statSync(src).mtimeMs) process.exit(0)
mkdirSync(outDir, { recursive: true })
const refs = [
  join(fx, 'System.Runtime.WindowsRuntime.dll'),
  join(fx, 'System.Runtime.dll'),
  join(fx, 'System.Threading.Tasks.dll'),
  join(winmd, 'Windows.Foundation.winmd'),
  join(winmd, 'Windows.Services.winmd')
]
execFileSync(join(fx, 'csc.exe'), ['/nologo', '/optimize+', '/target:exe', '/platform:anycpu', `/out:${out}`, ...refs.map((r) => `/r:${r}`), src], {
  stdio: 'inherit'
})
console.log('StoreHelper.exe built:', out)
