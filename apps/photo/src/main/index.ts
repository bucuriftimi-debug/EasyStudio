import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron'
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { accessSync, constants, createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { basename, dirname, join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { registerLicense } from '@easystudio/license/main'
import { registerAiCloud } from './aiCloud'
import { clearAutosave, fileFromArgv, registerFiles, setPendingOpen } from './files'
import { registerLang, tr } from './lang'

/*
 * Keep every file the app writes (settings, Chromium cache, GPU cache, crash dumps, AI models)
 * next to the project / installation instead of C:\Users\...\AppData — the user asked for nothing on C:.
 */
function dataDir(): string {
  if (!app.isPackaged) return join(app.getAppPath(), '..', '..', '.data', 'photo')
  // Installed app: keep data next to the program (e.g. on E:), unless that folder is read-only.
  const dir = join(dirname(app.getPath('exe')), 'data')
  try {
    mkdirSync(dir, { recursive: true })
    accessSync(dir, constants.W_OK)
    return dir
  } catch {
    return app.getPath('userData')
  }
}
const DATA = dataDir()
// Microsoft Store ID (Partner Center → Product identity), for the "Get Pro" link outside the Store.
const STORE_ID = '9NZ1XHJQLQMN'
const MODELS = join(DATA, 'models')
const RENDERER = join(__dirname, '../renderer')
app.setPath('userData', DATA)
app.setPath('sessionData', DATA)
app.setPath('crashDumps', join(DATA, 'crashes'))
app.setAppLogsPath(join(DATA, 'logs'))

// Prefer the discrete GPU (GTX) on laptops with hybrid graphics.
app.commandLine.appendSwitch('force_high_performance_gpu')
// Selftest screenshots come from an off-screen window, which Windows would report as covered.
if (process.argv.includes('--selftest-shot') || process.argv.includes('--selftest-visible')) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

// The UI is served from app://photo/ (a secure origin, so fetch/WebGPU/WebAssembly work the
// same way as on the web); app://photo/models/* serves the downloaded AI models from disk.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
])

let selftestImage: string | null = null

function serveFile(file: string): Promise<Response> | Response {
  if (!existsSync(file)) return new Response('Not found', { status: 404 })
  return net.fetch(pathToFileURL(file).toString()).then((r) => {
    const headers = new Headers(r.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    if (file.endsWith('.wasm')) headers.set('Content-Type', 'application/wasm')
    if (file.endsWith('.mjs') || file.endsWith('.js')) headers.set('Content-Type', 'text/javascript')
    return new Response(r.body, { status: r.status, headers })
  })
}

function registerAppProtocol(): void {
  protocol.handle('app', (req) => {
    const url = new URL(req.url)
    const path = decodeURIComponent(url.pathname)
    if (path.startsWith('/models/')) {
      const name = basename(path)
      if (!/^[a-z0-9._-]+\.onnx$/i.test(name)) return new Response('Bad model name', { status: 400 })
      return serveFile(join(MODELS, name))
    }
    if (path === '/__selftest.png' && selftestImage) return serveFile(selftestImage)
    const file = normalize(join(RENDERER, path === '/' ? 'index.html' : path))
    if (!file.startsWith(normalize(RENDERER + sep))) return new Response('Forbidden', { status: 403 })
    return serveFile(file)
  })
}

let win: BrowserWindow | null = null
let dirty = false

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'avif', 'psd']
const PROJECT_EXT = 'esp'

type OpenKind = 'image' | 'project' | 'any'

function filtersFor(kind: OpenKind): Electron.FileFilter[] {
  const images = { name: tr('images'), extensions: IMAGE_EXT }
  const project = { name: tr('project'), extensions: [PROJECT_EXT] }
  if (kind === 'image') return [images]
  if (kind === 'project') return [project]
  return [{ name: tr('imagesAndProjects'), extensions: [...IMAGE_EXT, PROJECT_EXT] }, images, project]
}

function rendererUrl(query = ''): string {
  return process.env.ELECTRON_RENDERER_URL ? process.env.ELECTRON_RENDERER_URL + query : `app://photo/index.html${query}`
}

function webPreferences(): Electron.WebPreferences {
  return {
    preload: join(__dirname, '../preload/index.js'),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    spellcheck: false
  }
}

function setupSession(w: BrowserWindow): void {
  // Only what the editor needs: clipboard (copy/paste pictures) and the list of installed fonts.
  const allowed = new Set(['clipboard-read', 'clipboard-sanitized-write', 'local-fonts'])
  w.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission as string)))
  w.webContents.session.setPermissionCheckHandler((_wc, permission) => allowed.has(permission as string))
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#0e0f12',
    title: 'EasyStudio Photo',
    autoHideMenuBar: true,
    webPreferences: webPreferences()
  })

  win.once('ready-to-show', () => {
    win?.maximize()
    win?.show()
  })
  setupSession(win)

  // Never navigate away from the app; open external links in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())

  win.on('close', (e) => {
    if (dirty && win) {
      const choice = dialog.showMessageBoxSync(win, {
        type: 'warning',
        buttons: [tr('closeAnyway'), tr('cancel')],
        defaultId: 1,
        cancelId: 1,
        title: tr('unsavedTitle'),
        message: tr('unsavedMessage'),
        detail: tr('unsavedDetail')
      })
      if (choice !== 0) return e.preventDefault()
    }
    // A normal close: the crash-recovery copy is no longer needed.
    clearAutosave()
  })

  win.loadURL(rendererUrl())
}

/* ------------------------------ IPC ------------------------------ */

ipcMain.handle('file:open', async (_e, kind: OpenKind = 'any') => {
  if (!win) return null
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: filtersFor(kind) })
  if (r.canceled || !r.filePaths[0]) return null
  const path = r.filePaths[0]
  const data = await readFile(path)
  return { path, name: basename(path), data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) }
})

ipcMain.handle(
  'file:save',
  async (
    _e,
    opts: { data: Uint8Array; defaultName: string; filters: Electron.FileFilter[]; path?: string | null }
  ): Promise<string | null> => {
    let path = opts.path ?? null
    if (path) {
      try {
        await access(dirname(path), constants.W_OK)
      } catch {
        path = null
      }
    }
    if (!path) {
      if (!win) return null
      const r = await dialog.showSaveDialog(win, { defaultPath: opts.defaultName, filters: opts.filters })
      if (r.canceled || !r.filePath) return null
      path = r.filePath
    }
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, opts.data)
    return path
  }
)

ipcMain.on('window:title', (_e, title: string) => win?.setTitle(title))
ipcMain.on('doc:dirty', (_e, d: boolean) => {
  dirty = d
})
ipcMain.handle('app:info', () => ({ version: app.getVersion(), dataDir: DATA }))

/* ------------------------------ AI models ------------------------------ */

const MODEL_NAME = /^[a-z0-9._-]+\.onnx$/i
const MODEL_HOSTS = ['huggingface.co']

ipcMain.handle('model:has', (_e, file: string) => MODEL_NAME.test(file) && existsSync(join(MODELS, file)))

/** Download a model once (with progress events) and return the URL the renderer can load it from. */
ipcMain.handle('model:ensure', async (e, opts: { file: string; url: string }) => {
  if (!MODEL_NAME.test(opts.file)) throw new Error('Bad model name')
  const dest = join(MODELS, opts.file)
  const localUrl = `app://photo/models/${opts.file}`
  if (existsSync(dest)) return localUrl
  const src = new URL(opts.url)
  if (src.protocol !== 'https:' || !MODEL_HOSTS.includes(src.hostname)) throw new Error(tr('modelHost'))
  await mkdir(MODELS, { recursive: true })
  const part = dest + '.part'
  const res = await net.fetch(opts.url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(tr('downloadFailed', { status: res.status }))
  const total = Number(res.headers.get('content-length')) || 0
  let received = 0
  let lastSent = 0
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctrl) {
      received += chunk.byteLength
      const now = Date.now()
      if (now - lastSent > 150) {
        lastSent = now
        e.sender.send('model:progress', { file: opts.file, received, total })
      }
      ctrl.enqueue(chunk)
    }
  })
  try {
    await pipeline(Readable.fromWeb(res.body.pipeThrough(counter) as never), createWriteStream(part))
    if (total && statSync(part).size !== total) throw new Error(tr('downloadIncomplete'))
    await rename(part, dest)
  } catch (err) {
    await rm(part, { force: true })
    throw err
  }
  e.sender.send('model:progress', { file: opts.file, received: total || received, total: total || received })
  return localUrl
})

/* ------------------------------ lifecycle ------------------------------ */

Menu.setApplicationMenu(null)

/** `--diag`: print which GPU Chromium uses and exit (handy to confirm the GTX is active). */
async function diag(): Promise<void> {
  const info = (await app.getGPUInfo('complete')) as {
    gpuDevice?: { vendorId: number; deviceId: number; active: boolean; driverVersion?: string }[]
    auxAttributes?: { glRenderer?: string }
  }
  const out = {
    renderer: info.auxAttributes?.glRenderer,
    devices: info.gpuDevice?.map((d) => ({ vendor: d.vendorId.toString(16), device: d.deviceId.toString(16), active: d.active, driver: d.driverVersion })),
    features: app.getGPUFeatureStatus(),
    dataDir: DATA
  }
  process.stdout.write(JSON.stringify(out, null, 2) + '\n')
  app.quit()
}

/**
 * `--selftest`: load the real UI in a hidden window, create a document through the UI and
 * report errors (smoke test for installed builds). With `--selftest-script <file.js>` it also
 * runs that script inside the page (it can use `window.__es`) and prints what it returns.
 */
async function selftest(): Promise<void> {
  const argv = process.argv
  // Whoever started the test may stop reading its output early: that must not become an error box.
  process.stdout.on('error', () => undefined)
  process.stderr.on('error', () => undefined)
  const scriptArg = argv.indexOf('--selftest-script')
  const imageArg = argv.indexOf('--selftest-image')
  if (imageArg > 0) selftestImage = argv[imageArg + 1]
  // `--selftest-open <file>`: behave as if Windows handed this file to the app (double-click).
  const openArg = argv.indexOf('--selftest-open')
  if (openArg > 0) setPendingOpen(argv[openArg + 1], null)
  const w = new BrowserWindow({ show: false, width: 1400, height: 900, webPreferences: { ...webPreferences(), backgroundThrottling: false } })
  // A hidden window draws no frames: for screenshots / timing, show it far off-screen, without focus.
  if (argv.includes('--selftest-shot') || argv.includes('--selftest-visible')) {
    w.setPosition(-30000, -30000)
    w.showInactive()
  }
  setupSession(w)
  const errors: string[] = []
  w.webContents.on('console-message', (e) => {
    const ev = e as unknown as { level?: string; message?: string }
    if (ev.level === 'error') errors.push(String(ev.message))
    // Everything the page logs goes to stderr so a hanging test can be diagnosed.
    process.stderr.write(`[page:${ev.level}] ${ev.message}\n`)
  })
  w.webContents.on('render-process-gone', (_e, d) => errors.push(`renderer gone: ${d.reason}`))
  await w.loadURL(rendererUrl('?selftest'))
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  await wait(1500)
  const out: Record<string, unknown> = {}
  if (scriptArg > 0) {
    const code = await readFile(argv[scriptArg + 1], 'utf8')
    try {
      // `ROOT` = the folder the test was started from (the project), with forward slashes.
      const root = JSON.stringify(process.cwd().replace(/\\/g, '/') + '/')
      out.script = await w.webContents.executeJavaScript(`(async () => { const ROOT = ${root}; ${code} })()`)
    } catch (err) {
      out.scriptError = String(err)
    }
    // `--selftest-shot <file.png>`: picture of the window as the script left it.
    const shotArg = argv.indexOf('--selftest-shot')
    if (shotArg > 0) {
      await w.webContents.insertCSS('*, *::before, *::after { animation: none !important; transition: none !important; }')
      w.webContents.invalidate()
      await wait(800)
      await writeFile(argv[shotArg + 1], (await w.webContents.capturePage()).toPNG())
    }
  } else {
    out.welcomePresets = await w.webContents.executeJavaScript(`document.querySelectorAll('.preset').length`)
    await w.webContents.executeJavaScript(`document.querySelector('.preset').click()`)
    await wait(1500)
    out.editor = await w.webContents.executeJavaScript(
      `({ canvas: !!document.querySelector('canvas.canvas'), gpuError: document.querySelector('.canvas-error')?.textContent ?? null, tools: document.querySelectorAll('.tool').length })`
    )
  }
  out.errors = errors
  process.stdout.write(JSON.stringify(out, null, 2) + '\n')
  app.quit()
}

const testMode = process.argv.includes('--diag') || process.argv.includes('--selftest')

// One window only: opening another file (double-click on a .esp) goes to the running app.
const firstInstance = testMode || app.requestSingleInstanceLock()
if (!firstInstance) app.quit()
app.on('second-instance', (_e, argv) => {
  const file = fileFromArgv(argv)
  if (file) setPendingOpen(file, win)
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.whenReady().then(async () => {
  if (!firstInstance) return
  registerAppProtocol()
  registerLang()
  // `--selftest-session`: a test that behaves like a fresh start (picks up a crashed session's copy).
  await registerFiles(DATA, !testMode || process.argv.includes('--selftest-session'))
  await registerAiCloud(DATA)
  registerLicense({ dataDir: DATA, storeId: STORE_ID, window: () => win })
  if (process.argv.includes('--diag')) return diag()
  if (process.argv.includes('--selftest')) return selftest()
  const file = fileFromArgv(process.argv)
  if (file) setPendingOpen(file, null)
  createWindow()
})
app.on('window-all-closed', () => app.quit())
