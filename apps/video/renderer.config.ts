import { resolve } from 'node:path'
import type { UserConfig } from 'vite'

/** Settings shared by the Electron renderer build and the plain-browser dev server. */
export const rendererConfig: UserConfig = {
  root: resolve(__dirname, 'src/renderer'),
  server: { port: 5191, strictPort: true },
  worker: { format: 'es' },
  build: {
    target: 'chrome130',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000
  }
}
