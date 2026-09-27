/// <reference lib="webworker" />
/**
 * Cut-out for video: IS-Net (Apache-2.0, the same model as "Remove background" in EasyStudio
 * Photo) with ONNX Runtime on the graphics card (WebGPU), the CPU as a fallback. It gets one frame
 * at a time and answers with its mask (0 = background … 255 = subject), the same size as the frame.
 * The model file comes through app://video/hf/ (downloaded once from huggingface.co).
 */
import * as ort from 'onnxruntime-web/webgpu'

declare const self: DedicatedWorkerGlobalScope

export type SegRequest = { type: 'frame'; id: number; rgba: Uint8ClampedArray; width: number; height: number }

export type SegMessage =
  | { type: 'download'; loaded: number; total: number }
  | { type: 'ready'; device: string }
  | { type: 'mask'; id: number; mask: Uint8ClampedArray }
  | { type: 'error'; message: string }

const MODEL_URL = 'app://video/hf/skillsafe-ai/isnet-general-use/resolve/main/isnet-general-use.onnx'
/** IS-Net looks at 1024 × 1024 pictures. */
const S = 1024

const post = (m: SegMessage, transfer: Transferable[] = []) => self.postMessage(m, transfer)
let session: Promise<ort.InferenceSession> | null = null

/** A WebGPU device with the card's real limits (the defaults are too small for some models). */
async function gpuProviders(): Promise<string[]> {
  type Adapter = { limits: Record<string, number>; requestDevice(o: unknown): Promise<unknown> }
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<Adapter | null> } }).gpu
  const adapter = gpu && (await gpu.requestAdapter().catch(() => null))
  if (!adapter) return ['wasm']
  const wanted = ['maxStorageBuffersPerShaderStage', 'maxBufferSize', 'maxStorageBufferBindingSize', 'maxComputeWorkgroupStorageSize', 'maxComputeInvocationsPerWorkgroup', 'maxComputeWorkgroupSizeX', 'maxComputeWorkgroupSizeY', 'maxComputeWorkgroupSizeZ', 'maxComputeWorkgroupsPerDimension']
  const requiredLimits: Record<string, number> = {}
  for (const k of wanted) if (typeof adapter.limits[k] === 'number') requiredLimits[k] = adapter.limits[k]
  ;(ort.env.webgpu as unknown as { device: unknown }).device = await adapter.requestDevice({ requiredLimits })
  return ['webgpu', 'wasm']
}

/** Download the model (with progress) and start it. */
function load(): Promise<ort.InferenceSession> {
  session ??= (async () => {
    ort.env.wasm.numThreads = 1
    ort.env.logLevel = 'error'
    const res = await fetch(MODEL_URL)
    if (!res.ok || !res.body) throw new Error(`model download failed (${res.status})`)
    const total = Number(res.headers.get('content-length')) || 0
    const parts: Uint8Array[] = []
    let loaded = 0
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      parts.push(value)
      loaded += value.byteLength
      post({ type: 'download', loaded, total })
    }
    const bytes = new Uint8Array(loaded)
    let off = 0
    for (const p of parts) {
      bytes.set(p, off)
      off += p.byteLength
    }
    const executionProviders = await gpuProviders()
    const s = await ort.InferenceSession.create(bytes, { executionProviders, graphOptimizationLevel: 'all' })
    post({ type: 'ready', device: executionProviders[0] })
    return s
  })()
  return session
}

const canvasOf = (img: ImageData) => {
  const c = new OffscreenCanvas(img.width, img.height)
  c.getContext('2d')!.putImageData(img, 0, 0)
  return c
}

function resized(src: OffscreenCanvas, w: number, h: number): Uint8ClampedArray {
  const c = new OffscreenCanvas(w, h)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h).data
}

async function handle(req: SegRequest): Promise<void> {
  const s = await load()
  const d = resized(canvasOf(new ImageData(new Uint8ClampedArray(req.rgba), req.width, req.height)), S, S)
  // Same preparation as rembg: scale by the brightest value, then centre around 0.5.
  let peak = 1
  for (let i = 0; i < S * S; i++) peak = Math.max(peak, d[i * 4], d[i * 4 + 1], d[i * 4 + 2])
  const f = new Float32Array(3 * S * S)
  for (let i = 0; i < S * S; i++) for (let c = 0; c < 3; c++) f[c * S * S + i] = d[i * 4 + c] / peak - 0.5
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', f, [1, 3, S, S]) }, [s.outputNames[0]])
  const o = (await out[s.outputNames[0]].getData()) as Float32Array
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < o.length; i++) {
    if (o[i] < min) min = o[i]
    if (o[i] > max) max = o[i]
  }
  const logits = min < -0.05 || max > 1.05
  const range = logits ? 1 : Math.max(1e-6, max - min)
  // Model output (1024²) → grey picture → frame size.
  const img = new ImageData(S, S)
  for (let i = 0; i < S * S; i++) img.data[i * 4 + 3] = (logits ? 1 / (1 + Math.exp(-o[i])) : (o[i] - min) / range) * 255
  const a = resized(canvasOf(img), req.width, req.height)
  const mask = new Uint8ClampedArray(req.width * req.height)
  for (let i = 0; i < mask.length; i++) mask[i] = a[i * 4 + 3]
  post({ type: 'mask', id: req.id, mask }, [mask.buffer])
}

self.onmessage = (e: MessageEvent<SegRequest>) => {
  handle(e.data).catch((err) => {
    console.error(err)
    post({ type: 'error', message: String((err as Error)?.message ?? err) })
  })
}
