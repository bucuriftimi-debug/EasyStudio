import { resolve } from 'node:path'
import type { UserConfig } from 'vite'

/** Settings shared by the Electron renderer build and the plain-browser dev server. */
export const rendererConfig: UserConfig = {
  root: resolve(__dirname, 'src/renderer'),
  server: { port: 5191, strictPort: true },
  worker: { format: 'es' },
  resolve: {
    // The WebAssembly build of ONNX Runtime that matches transformers.js (speech recognition),
    // served from the app instead of a CDN.
    alias: { 'ort-hf': resolve(__dirname, '../../node_modules/@huggingface/transformers/node_modules/onnxruntime-web/dist') }
  },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  build: {
    target: 'chrome130',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000
  }
}
