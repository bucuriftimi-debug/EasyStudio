/// <reference lib="webworker" />
/**
 * transformers.js set up for the app (imported first by the AI workers):
 * - model files keep their huggingface.co addresses but are fetched through app://video/hf/,
 *   where the main process downloads them once and keeps them on disk (the page may not reach
 *   the internet itself);
 * - ONNX Runtime's WebAssembly is served from the app, not from a CDN.
 */
import { env } from '@huggingface/transformers'
import ortMjs from 'ort-hf/ort-wasm-simd-threaded.asyncify.mjs?url'
import ortWasm from 'ort-hf/ort-wasm-simd-threaded.asyncify.wasm?url'

const HF = 'https://huggingface.co/'

env.allowLocalModels = false
env.useBrowserCache = false
env.useWasmCache = false
env.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input)
  return fetch(url.startsWith(HF) ? `app://video/hf/${url.slice(HF.length)}` : url, init)
}) as typeof fetch

const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown; numThreads?: number } }
if (onnx.wasm) {
  onnx.wasm.wasmPaths = { mjs: new URL(ortMjs, self.location.href).href, wasm: new URL(ortWasm, self.location.href).href }
  onnx.wasm.numThreads = 1
}

/** Is there a WebGPU graphics card? */
export async function hasWebGpu(): Promise<boolean> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
  return !!gpu && !!(await gpu.requestAdapter().catch(() => null))
}

/** Adds up the download progress of several files into one number. */
export function downloadMeter(post: (loaded: number, total: number) => void) {
  const files = new Map<string, { loaded: number; total: number }>()
  return (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status !== 'progress' || !p.file) return
    files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 })
    let a = 0
    let b = 0
    for (const f of files.values()) {
      a += f.loaded
      b += f.total
    }
    post(a, b)
  }
}
