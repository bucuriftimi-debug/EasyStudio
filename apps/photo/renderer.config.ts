import { resolve } from 'node:path'
import type { UserConfig } from 'vite'

/** Settings shared by the Electron renderer build and the plain-browser dev server. */
export const rendererConfig: UserConfig = {
  root: resolve(__dirname, 'src/renderer'),
  server: { port: 5190, strictPort: true },
  worker: { format: 'es' },
  // ONNX Runtime Web finds its WebAssembly file through import.meta.url; Vite copies it into the build.
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  build: {
    target: 'chrome130',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000
  }
}
