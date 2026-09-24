import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { accessSync, constants, existsSync, mkdirSync } from 'node:fs'
import { basename, dirname, join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerLicense } from '@easystudio/license/main'
import { closeMedia, registerMedia } from './media'
import { registerExporter } from './exporter'
import { clearAutosave, projectFromArgv, registerSession, setPendingProject } from './session'

/*
 * Everything the app writes (settings, Chromium caches, crash dumps) stays next to the project
 * or the installation, not on C: — the user asked for nothing on C:.
 */
function dataDir(): string {
  if (!app.isPackaged) return join(app.getAppPath(), '..', '..', '.data', 'video')
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
const STORE_ID = '9NP6GSLVKK2D'
const RENDERER = join(__dirname, '../renderer')
app.setPath('userData', DATA)
app.setPath('sessionData', DATA)
app.setPath('crashDumps', join(DATA, 'crashes'))
app.setAppLogsPath(join(DATA, 'logs'))

// Use the discrete GPU (decoding, encoding and effects all run on it).
app.commandLine.appendSwitch('force_high_performance_gpu')
// Let the page play sound without a click first (the player starts from buttons anyway).
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
if (process.argv.includes('--selftest-shot') || process.argv.includes('--selftest-visible')) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
])

let lang: 'en' | 'ro' = 'en'
const TEXTS = {
  en: { mp4: 'MP4 video', webm: 'WebM video', media: 'Videos, music and pictures', video: 'Videos', audio: 'Music and sound', images: 'Pictures', project: 'EasyStudio Video project', unsavedTitle: 'Unsaved changes', unsavedMessage: 'You have unsaved changes.', unsavedDetail: 'If you close now, your changes will be lost.', closeAnyway: 'Close without saving', cancel: 'Cancel' },
  ro: { mp4: 'Video MP4', webm: 'Video WebM', media: 'Video, muzică și poze', video: 'Video', audio: 'Muzică și sunet', images: 'Poze', project: 'Proiect EasyStudio Video', unsavedTitle: 'Modificări nesalvate', unsavedMessage: 'Ai modificări nesalvate.', unsavedDetail: 'Dacă închizi acum, modificările se pierd.', closeAnyway: 'Închide fără să salvez', cancel: 'Anulează' }
}
const tr = (k: keyof (typeof TEXTS)['en']) => TEXTS[lang][k]

function serveFile(file: string): Promise<Response> | Response {
  if (!existsSync(file)) return new Response('Not found', { status: 404 })
  return net.fetch(pathToFileURL(file).toString()).then((r) => {
    const headers = new Headers(r.headers)
    if (file.endsWith('.wasm')) headers.set('Content-Type', 'application/wasm')
    if (file.endsWith('.mjs') || file.endsWith('.js')) headers.set('Content-Type', 'text/javascript')
    return new Response(r.body, { status: r.status, headers })
  })
}

function registerAppProtocol(): void {
  protocol.handle('app', (req) => {
    const path = decodeURIComponent(new URL(req.url).pathname)
    const file = normalize(join(RENDERER, path === '/' ? 'index.html' : path))
    if (!file.startsWith(normalize(RENDERER + sep))) return new Response('Forbidden', { status: 403 })
    return serveFile(file)
  })
}

let win: BrowserWindow | null = null
let dirty = false

function rendererUrl(query = ''): string {
  return process.env.ELECTRON_RENDERER_URL ? process.env.ELECTRON_RENDERER_URL + query : `app://video/index.html${query}`
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
  const allowed = new Set(['clipboard-read', 'clipboard-sanitized-write', 'local-fonts'])
  w.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission as string)))
  w.webContents.session.setPermissionCheckHandler((_wc, permission) => allowed.has(permission as string))
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: '#0e0f12',
    title: 'EasyStudio Video',
    autoHideMenuBar: true,
    webPreferences: webPreferences()
  })
  win.once('ready-to-show', () => {
    win?.maximize()
    win?.show()
  })
  setupSession(win)
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
    clearAutosave()
  })
  win.loadURL(rendererUrl())
}

/* ------------------------------ IPC ------------------------------ */

registerMedia(() => win, {
  get media() {
    return tr('media')
  },
  get video() {
    return tr('video')
  },
  get audio() {
    return tr('audio')
  },
  get images() {
    return tr('images')
  }
})

registerExporter(
  () => win,
  {
    get mp4() {
      return tr('mp4')
    },
    get webm() {
      return tr('webm')
    }
  },
  process.argv.includes('--selftest')
)

/** Save bytes to a file (a dialog, or straight to `path` when it is given and writable). */
ipcMain.handle('file:save', async (_e, opts: { data: Uint8Array; defaultName: string; filters: Electron.FileFilter[]; path?: string | null }) => {
  let path = opts.path ?? null
  if (path) {
    try {
      await mkdir(dirname(path), { recursive: true })
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
  await writeFile(path, opts.data)
  return path
})

/** Open a project (.esv): its text and where it is. */
ipcMain.handle('project:open', async (_e, path?: string | null) => {
  let p = path ?? null
  if (!p) {
    if (!win) return null
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: tr('project'), extensions: ['esv'] }] })
    if (r.canceled || !r.filePaths[0]) return null
    p = r.filePaths[0]
  }
  if (!p.toLowerCase().endsWith('.esv')) throw new Error('Not a project file')
  return { path: p, name: basename(p), text: await readFile(p, 'utf8') }
})

ipcMain.on('window:title', (_e, title: string) => win?.setTitle(title))
ipcMain.on('doc:dirty', (_e, d: boolean) => {
  dirty = d
})
ipcMain.on('app:lang', (_e, l: string) => {
  lang = l === 'ro' ? 'ro' : 'en'
})
ipcMain.handle('app:info', () => ({ version: app.getVersion(), dataDir: DATA }))

/* ------------------------------ lifecycle ------------------------------ */

Menu.setApplicationMenu(null)

/**
 * `--selftest`: load the real UI in a hidden window and run `--selftest-script <file.js>` inside
 * it (it can use `window.__ev`); prints what the script returns. `--selftest-shot <png>` saves a
 * picture of the window at the end, `--selftest-visible` keeps it drawing frames (off-screen).
 */
async function selftest(): Promise<void> {
  const argv = process.argv
  // Whoever started the test may stop reading its output early: that must not become an error box.
  process.stdout.on('error', () => undefined)
  process.stderr.on('error', () => undefined)
  // `--selftest-size 1920x1080`: page size for screenshots (default: a 1400 × 900 window).
  const sizeArg = argv.indexOf('--selftest-size')
  const [sw, sh] = sizeArg > 0 ? argv[sizeArg + 1].split('x').map(Number) : [1400, 900]
  const w = new BrowserWindow({ show: false, width: sw, height: sh, useContentSize: sizeArg > 0, webPreferences: { ...webPreferences(), backgroundThrottling: false } })
  if (argv.includes('--selftest-shot') || argv.includes('--selftest-visible')) {
    w.setPosition(-30000, -30000)
    w.showInactive()
  }
  win = w
  setupSession(w)
  const errors: string[] = []
  w.webContents.on('console-message', (e) => {
    const ev = e as unknown as { level?: string; message?: string }
    if (ev.level === 'error') errors.push(String(ev.message))
    process.stderr.write(`[page:${ev.level}] ${ev.message}\n`)
  })
  w.webContents.on('render-process-gone', (_e, d) => errors.push(`renderer gone: ${d.reason}`))
  await w.loadURL(rendererUrl('?selftest'))
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
  await wait(1200)
  const out: Record<string, unknown> = {}
  const scriptArg = argv.indexOf('--selftest-script')
  if (scriptArg > 0) {
    const code = await readFile(argv[scriptArg + 1], 'utf8')
    try {
      // `ROOT` = the folder the test was started from (the project), with forward slashes.
      const root = JSON.stringify(process.cwd().replace(/\\/g, '/') + '/')
      out.script = await w.webContents.executeJavaScript(`(async () => { const ROOT = ${root}; ${code} })()`)
    } catch (err) {
      out.scriptError = String(err)
    }
  } else {
    out.ui = await w.webContents.executeJavaScript(`({ player: !!document.querySelector('canvas.player-canvas'), library: !!document.querySelector('.library') })`)
  }
  const shotArg = argv.indexOf('--selftest-shot')
  if (shotArg > 0) {
    await w.webContents.insertCSS('*, *::before, *::after { animation: none !important; transition: none !important; }')
    w.webContents.invalidate()
    await wait(800)
    await writeFile(argv[shotArg + 1], (await w.webContents.capturePage()).toPNG())
  }
  out.errors = errors
  process.stdout.write(JSON.stringify(out, null, 2) + '\n')
  app.quit()
}

const testMode = process.argv.includes('--selftest')
const firstInstance = testMode || app.requestSingleInstanceLock()
if (!firstInstance) app.quit()
app.on('second-instance', (_e, argv) => {
  const file = projectFromArgv(argv)
  if (file) setPendingProject(file, win)
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.whenReady().then(async () => {
  if (!firstInstance) return
  registerAppProtocol()
  await registerSession(DATA, !testMode || process.argv.includes('--selftest-session'))
  registerLicense({ dataDir: DATA, storeId: STORE_ID, window: () => win })
  if (testMode) return selftest()
  const file = projectFromArgv(process.argv)
  if (file) setPendingProject(file, null)
  createWindow()
})
app.on('window-all-closed', () => {
  void closeMedia()
  app.quit()
})
