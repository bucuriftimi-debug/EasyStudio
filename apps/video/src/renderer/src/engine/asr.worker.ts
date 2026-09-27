/// <reference lib="webworker" />
/**
 * Speech recognition for automatic subtitles: OpenAI Whisper (MIT) through transformers.js,
 * on the graphics card (WebGPU) or the CPU. Model files come from app://video/hf/ (downloaded
 * once from huggingface.co by the main process); ONNX Runtime's WebAssembly is bundled.
 */
import { env, pipeline } from '@huggingface/transformers'
import ortMjs from 'ort-hf/ort-wasm-simd-threaded.asyncify.mjs?url'
import ortWasm from 'ort-hf/ort-wasm-simd-threaded.asyncify.wasm?url'

declare const self: DedicatedWorkerGlobalScope

export type AsrModel = 'base' | 'small'

export type AsrRequest = { type: 'transcribe'; audio: Float32Array; language: string | null; model: AsrModel }

export type AsrMessage =
  | { type: 'download'; loaded: number; total: number }
  | { type: 'progress'; done: number; total: number }
  | { type: 'result'; chunks: { start: number; end: number; text: string }[]; device: string }
  | { type: 'error'; message: string }

const RATE = 16000
/** Whisper hears 30 seconds at a time. */
const WINDOW = 30 * RATE

env.allowLocalModels = false
// Model files keep their huggingface.co addresses, but are fetched through the app, which
// downloads them once and keeps them on disk (the page itself may not reach the internet).
const HF = 'https://huggingface.co/'
env.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input)
  return fetch(url.startsWith(HF) ? `app://video/hf/${url.slice(HF.length)}` : url, init)
}) as typeof fetch
env.useBrowserCache = false
env.useWasmCache = false
const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown; numThreads?: number } }
if (onnx.wasm) {
  onnx.wasm.wasmPaths = { mjs: new URL(ortMjs, self.location.href).href, wasm: new URL(ortWasm, self.location.href).href }
  onnx.wasm.numThreads = 1
}

type Transcriber = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string; chunks?: { timestamp: [number, number | null]; text: string }[] }>

let loaded: { key: string; run: Transcriber; device: string } | null = null
const post = (m: AsrMessage) => self.postMessage(m)

async function load(model: AsrModel): Promise<{ run: Transcriber; device: string }> {
  if (loaded?.key === model) return loaded
  const id = `onnx-community/whisper-${model}`
  const files = new Map<string, { loaded: number; total: number }>()
  const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status !== 'progress' || !p.file) return
    files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 })
    let a = 0
    let b = 0
    for (const f of files.values()) {
      a += f.loaded
      b += f.total
    }
    post({ type: 'download', loaded: a, total: b })
  }
  const hasGpu = 'gpu' in navigator && !!(await (navigator as unknown as { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter().catch(() => null))
  // GTX 16xx cards give wrong results in fp16: the encoder stays fp32 on the GPU.
  const attempts: { device: string; dtype: unknown }[] = hasGpu
    ? [
        { device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' } },
        { device: 'wasm', dtype: 'q8' }
      ]
    : [{ device: 'wasm', dtype: 'q8' }]
  let lastError: unknown = null
  for (const a of attempts) {
    try {
      const run = (await pipeline('automatic-speech-recognition', id, { device: a.device, dtype: a.dtype, progress_callback } as never)) as unknown as Transcriber
      loaded = { key: model, run, device: a.device }
      return loaded
    } catch (e) {
      console.warn('[asr] could not start on', a.device, e)
      lastError = e
    }
  }
  throw lastError
}

/** Where to cut near `end`: the quietest 50 ms in the last 3 seconds, so words are not split. */
function cutPoint(audio: Float32Array, start: number, end: number): number {
  if (end >= audio.length) return audio.length
  const step = RATE / 20
  let best = end
  let bestEnergy = Infinity
  for (let p = end - 3 * RATE; p + step <= end; p += step) {
    let e = 0
    for (let i = p; i < p + step; i++) e += audio[i] * audio[i]
    if (e < bestEnergy) {
      bestEnergy = e
      best = p + step / 2
    }
  }
  return Math.max(start + RATE, Math.round(best))
}

async function transcribe(req: AsrRequest): Promise<void> {
  const { run, device } = await load(req.model)
  const chunks: { start: number; end: number; text: string }[] = []
  const a = req.audio
  let start = 0
  post({ type: 'progress', done: 0, total: a.length })
  while (start < a.length) {
    const end = cutPoint(a, start, Math.min(a.length, start + WINDOW))
    const part = a.subarray(start, end)
    // Skip silence (music-only parts, pauses): Whisper tends to invent text there.
    let energy = 0
    for (let i = 0; i < part.length; i += 16) energy += part[i] * part[i]
    if (energy / (part.length / 16) > 1e-5) {
      const out = await run(part, { language: req.language ?? undefined, task: 'transcribe', return_timestamps: true })
      const offset = start / RATE
      for (const c of out.chunks ?? []) {
        const s = c.timestamp[0] ?? 0
        const e = c.timestamp[1] ?? Math.min(part.length / RATE, s + 4)
        const text = c.text.trim()
        if (text) chunks.push({ start: offset + s, end: offset + Math.max(e, s + 0.3), text })
      }
    }
    start = end
    post({ type: 'progress', done: start, total: a.length })
  }
  post({ type: 'result', chunks, device })
}

self.onmessage = (e: MessageEvent<AsrRequest>) => {
  if (e.data.type === 'transcribe')
    transcribe(e.data).catch((err) => {
      console.error(err)
      post({ type: 'error', message: String((err as Error)?.message ?? err) })
    })
}
