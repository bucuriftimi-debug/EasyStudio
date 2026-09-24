import { contextBridge, ipcRenderer } from 'electron'

type Progress = { file: string; received: number; total: number }

/** The only bridge between the web UI and the computer. Keep it small and explicit. */
const api = {
  isElectron: true,
  openFile: (kind: 'image' | 'project' | 'any') => ipcRenderer.invoke('file:open', kind),
  saveFile: (opts: { data: Uint8Array; defaultName: string; filters: { name: string; extensions: string[] }[]; path?: string | null }) =>
    ipcRenderer.invoke('file:save', opts),
  setTitle: (title: string) => ipcRenderer.send('window:title', title),
  setDirty: (dirty: boolean) => ipcRenderer.send('doc:dirty', dirty),
  appInfo: () => ipcRenderer.invoke('app:info'),
  hasModel: (file: string): Promise<boolean> => ipcRenderer.invoke('model:has', file),
  ensureModel: (file: string, url: string): Promise<string> => ipcRenderer.invoke('model:ensure', { file, url }),
  onModelProgress: (cb: (p: Progress) => void) => {
    const fn = (_e: unknown, p: Progress) => cb(p)
    ipcRenderer.on('model:progress', fn)
    return () => ipcRenderer.removeListener('model:progress', fn)
  },
  setLang: (lang: string) => ipcRenderer.send('app:lang', lang),
  recent: {
    list: () => ipcRenderer.invoke('recent:list'),
    add: (path: string, thumb?: string) => ipcRenderer.invoke('recent:add', { path, thumb }),
    remove: (path: string) => ipcRenderer.invoke('recent:remove', path),
    clear: () => ipcRenderer.invoke('recent:clear'),
    read: (path: string) => ipcRenderer.invoke('file:read', path)
  },
  /** A file handed over by Windows (double-click on a .esp, "Open with…"). */
  pendingOpen: () => ipcRenderer.invoke('app:pending-open'),
  onPendingOpen: (cb: () => void) => {
    const fn = () => cb()
    ipcRenderer.on('app:open-pending', fn)
    return () => ipcRenderer.removeListener('app:open-pending', fn)
  },
  autosave: {
    write: (a: { data: Uint8Array; name: string; filePath: string | null }) => ipcRenderer.invoke('autosave:write', a),
    check: () => ipcRenderer.invoke('autosave:check'),
    load: () => ipcRenderer.invoke('autosave:load'),
    clear: () => ipcRenderer.invoke('autosave:clear'),
    discard: () => ipcRenderer.invoke('autosave:discard')
  },
  // Optional cloud AI: keys stay in the main process, the page only sends requests.
  ai: {
    settings: () => ipcRenderer.invoke('ai:settings'),
    setSettings: (patch: unknown) => ipcRenderer.invoke('ai:settings:set', patch),
    setKey: (provider: string, key: string | null) => ipcRenderer.invoke('ai:key:set', provider, key),
    ask: (req: unknown) => ipcRenderer.invoke('ai:ask', req),
    test: () => ipcRenderer.invoke('ai:test'),
    fill: (req: unknown) => ipcRenderer.invoke('ai:fill', req),
    ollamaModels: () => ipcRenderer.invoke('ai:ollama:models')
  },
  // Free / Pro (Microsoft Store add-on).
  license: {
    status: (refresh?: boolean) => ipcRenderer.invoke('license:status', refresh),
    buy: () => ipcRenderer.invoke('license:buy')
  }
}

contextBridge.exposeInMainWorld('easyStudio', api)
