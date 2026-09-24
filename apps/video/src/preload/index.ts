import { contextBridge, ipcRenderer, webUtils } from 'electron'

/** The only bridge between the web UI and the computer. Keep it small and explicit. */
const api = {
  isElectron: true,
  setTitle: (title: string) => ipcRenderer.send('window:title', title),
  setDirty: (dirty: boolean) => ipcRenderer.send('doc:dirty', dirty),
  setLang: (lang: string) => ipcRenderer.send('app:lang', lang),
  appInfo: () => ipcRenderer.invoke('app:info'),
  saveFile: (opts: { data: Uint8Array; defaultName: string; filters: { name: string; extensions: string[] }[]; path?: string | null }) =>
    ipcRenderer.invoke('file:save', opts),
  openProject: (path?: string | null) => ipcRenderer.invoke('project:open', path ?? null),
  exportFile: {
    pick: (defaultName: string, format: 'mp4' | 'webm'): Promise<string | null> => ipcRenderer.invoke('export:pick', { defaultName, format }),
    open: (path: string): Promise<number> => ipcRenderer.invoke('export:open', path),
    write: (id: number, position: number, data: Uint8Array) => ipcRenderer.invoke('export:write', id, position, data),
    close: (id: number, keep: boolean) => ipcRenderer.invoke('export:close', id, keep),
    reveal: (path: string) => ipcRenderer.invoke('export:reveal', path)
  },
  recent: {
    list: () => ipcRenderer.invoke('recent:list'),
    add: (path: string) => ipcRenderer.invoke('recent:add', path),
    remove: (path: string) => ipcRenderer.invoke('recent:remove', path)
  },
  pendingOpen: (): Promise<string | null> => ipcRenderer.invoke('app:pending-open'),
  onPendingOpen: (cb: () => void) => {
    const fn = () => cb()
    ipcRenderer.on('app:open-pending', fn)
    return () => ipcRenderer.removeListener('app:open-pending', fn)
  },
  autosave: {
    write: (a: { text: string; name: string; filePath: string | null }) => ipcRenderer.invoke('autosave:write', a),
    check: () => ipcRenderer.invoke('autosave:check'),
    load: (): Promise<string> => ipcRenderer.invoke('autosave:load'),
    discard: () => ipcRenderer.invoke('autosave:discard'),
    clear: () => ipcRenderer.invoke('autosave:clear')
  },
  media: {
    pick: () => ipcRenderer.invoke('media:pick'),
    register: (paths: string[]) => ipcRenderer.invoke('media:register', paths),
    read: (id: string, start: number, end: number): Promise<Uint8Array> => ipcRenderer.invoke('media:read', id, start, end),
    /** Path of a file dropped on the window (Electron no longer puts it on the File object). */
    pathOf: (file: File) => webUtils.getPathForFile(file)
  }
}

contextBridge.exposeInMainWorld('easyStudio', api)
