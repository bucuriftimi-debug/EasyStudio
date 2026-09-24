/// <reference lib="webworker" />
/**
 * Runs the AI models off the UI thread with ONNX Runtime Web (WebGPU on the graphics card,
 * WebAssembly on the CPU as a fallback). Pre/post-processing also happens here.
 */
import * as ort from 'onnxruntime-web/webgpu'

declare const self: DedicatedWorkerGlobalScope

type Msg =
  | { id: number; type: 'init' }
  | { id: number; type: 'matte'; url: string; image: ImageBitmap }
  | { id: number; type: 'samEncode'; url: string; image: ImageBitmap; origW: number; origH: number; key: string }
  | { id: number; type: 'samDecode'; url: string; key: string; points: { x: number; y: number; label: number }[] }
  | { id: number; type: 'inpaint'; url: string; image: ImageData; mask: Uint8ClampedArray }
  | { id: number; type: 'upscale'; url: string; image: ImageData; scale: 2 | 4 }
  | { id: number; type: 'release' }

let providers: string[] = ['wasm']
let device = 'cpu'
const sessions = new Map<string, ort.InferenceSession>()
/** Models that failed on the graphics card and now run on the CPU. */
const cpuOnly = new Set<string>()
let sam: { key: string; emb: ort.Tensor; w: number; h: number; scale: number } | null = null

const post = (id: number, data: unknown, transfer: Transferable[] = []) => self.postMessage({ id, ok: true, data }, transfer)
const progress = (id: number, p: number) => self.postMessage({ id, progress: p })

async function init() {
  // Single-threaded WebAssembly (multi-threading would need cross-origin isolation); the heavy work runs on the GPU anyway.
  ort.env.wasm.numThreads = 1
  ort.env.logLevel = 'error'
  try {
    type Adapter = {
      limits: Record<string, number>
      features: Set<string>
      requestDevice(o: unknown): Promise<{ lost: Promise<unknown> }>
    }
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(o?: unknown): Promise<Adapter | null> } }).gpu
    const adapter = gpu && (await gpu.requestAdapter())
    if (adapter) {
      // Ask for everything the card can do: WebGPU's defaults (e.g. 16 storage buffers per shader)
      // are too small for some models, but real graphics cards support much more.
      const wanted = [
        'maxStorageBuffersPerShaderStage',
        'maxBufferSize',
        'maxStorageBufferBindingSize',
        'maxComputeWorkgroupStorageSize',
        'maxComputeInvocationsPerWorkgroup',
        'maxComputeWorkgroupSizeX',
        'maxComputeWorkgroupSizeY',
        'maxComputeWorkgroupSizeZ',
        'maxComputeWorkgroupsPerDimension'
      ]
      const requiredLimits: Record<string, number> = {}
      for (const k of wanted) if (typeof adapter.limits[k] === 'number') requiredLimits[k] = adapter.limits[k]
      const requiredFeatures = ['shader-f16'].filter((f) => adapter.features.has(f))
      const dev = await adapter.requestDevice({ requiredLimits, requiredFeatures })
      console.info(`AI on WebGPU: ${requiredLimits.maxStorageBuffersPerShaderStage} storage buffers/shader, max buffer ${Math.round((requiredLimits.maxBufferSize ?? 0) / 2 ** 20)} MB`)
      ;(ort.env.webgpu as unknown as { device: unknown }).device = dev
      dev.lost.then(() => {
        // The graphics driver reset: continue on the CPU.
        providers = ['wasm']
        device = 'cpu'
        sessions.clear()
      })
      providers = ['webgpu', 'wasm']
      device = 'gpu'
    }
  } catch (e) {
    console.warn('WebGPU not available, using the CPU', e)
  }
  return { device }
}

/** Run a model; if the graphics card can't handle it, switch that model to the CPU and retry. */
async function run(
  url: string,
  feeds: Record<string, ort.Tensor>,
  keep: string[] = [],
  outputs?: string[]
): Promise<ort.InferenceSession.OnnxValueMapType> {
  // By default only fetch the main output (IS-Net has 11 extra side outputs we don't need).
  const fetches = (x: ort.InferenceSession) => outputs ?? [x.outputNames[0]]
  const s = await session(url, keep)
  try {
    return await s.run(feeds, fetches(s))
  } catch (e) {
    if (cpuOnly.has(url) || providers[0] !== 'webgpu') throw e
    console.warn('Model failed on the GPU, retrying on the CPU:', (e as Error).message)
    cpuOnly.add(url)
    await s.release().catch(() => undefined)
    sessions.delete(url)
    const s2 = await session(url, keep)
    return await s2.run(feeds, fetches(s2))
  }
}

/** Load a model (keeping only what the current task needs in GPU memory). */
async function session(url: string, keep: string[] = []): Promise<ort.InferenceSession> {
  const s = sessions.get(url)
  if (s) return s
  for (const [u, old] of sessions) {
    if (u !== url && !keep.includes(u)) {
      await old.release()
      sessions.delete(u)
      if (sam && u.includes('encoder')) sam = null
    }
  }
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer())
  const eps = cpuOnly.has(url) ? ['wasm'] : providers
  let created: ort.InferenceSession
  try {
    created = await ort.InferenceSession.create(buf, { executionProviders: eps, graphOptimizationLevel: 'all' })
  } catch (e) {
    if (eps[0] !== 'webgpu') throw e
    cpuOnly.add(url)
    // Some models / drivers fail on WebGPU: fall back to the CPU.
    created = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
  }
  sessions.set(url, created)
  return created
}

function pixels(src: CanvasImageSource, w: number, h: number): Uint8ClampedArray {
  const c = new OffscreenCanvas(w, h)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h).data
}

function imageDataCanvas(img: ImageData): OffscreenCanvas {
  const c = new OffscreenCanvas(img.width, img.height)
  c.getContext('2d')!.putImageData(img, 0, 0)
  return c
}

/** Resize a single-channel 0..255 map with bilinear filtering (through a canvas alpha channel). */
function resizeAlpha(a: Uint8ClampedArray | Float32Array, w: number, h: number, W: number, H: number, toByte: (v: number) => number): Uint8ClampedArray {
  const img = new ImageData(w, h)
  for (let i = 0; i < w * h; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255
    img.data[i * 4 + 3] = toByte(a[i])
  }
  if (w === W && h === H) {
    const out = new Uint8ClampedArray(W * H)
    for (let i = 0; i < W * H; i++) out[i] = img.data[i * 4 + 3]
    return out
  }
  const d = pixels(imageDataCanvas(img), W, H)
  const out = new Uint8ClampedArray(W * H)
  for (let i = 0; i < W * H; i++) out[i] = d[i * 4 + 3]
  return out
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

/* ------------------------------ background removal (IS-Net) ------------------------------ */

async function matte(url: string, image: ImageBitmap): Promise<{ alpha: Uint8ClampedArray; w: number; h: number }> {
  const s = await session(url)
  const S = 1024
  const d = pixels(image, S, S)
  // Same preparation as rembg: scale by the brightest value, then centre around 0.5.
  let peak = 1
  for (let i = 0; i < S * S; i++) peak = Math.max(peak, d[i * 4], d[i * 4 + 1], d[i * 4 + 2])
  const f = new Float32Array(3 * S * S)
  for (let i = 0; i < S * S; i++) {
    for (let c = 0; c < 3; c++) f[c * S * S + i] = d[i * 4 + c] / peak - 0.5
  }
  const out = await run(url, { [s.inputNames[0]]: new ort.Tensor('float32', f, [1, 3, S, S]) })
  const o = (await out[s.outputNames[0]].getData()) as Float32Array
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < o.length; i++) {
    if (o[i] < min) min = o[i]
    if (o[i] > max) max = o[i]
  }
  const logits = min < -0.05 || max > 1.05
  const range = logits ? 1 : Math.max(1e-6, max - min)
  const alpha = resizeAlpha(o, S, S, image.width, image.height, (v) => (logits ? sigmoid(v) : (v - min) / range) * 255)
  return { alpha, w: image.width, h: image.height }
}

/* ------------------------------ click to select (MobileSAM) ------------------------------ */

async function samEncode(url: string, image: ImageBitmap, origW: number, origH: number, key: string): Promise<void> {
  if (sam?.key === key) return
  const keep = [...sessions.keys()].filter((u) => u.includes('decoder'))
  const s = await session(url, keep)
  const w = image.width
  const h = image.height
  const d = pixels(image, w, h)
  const f = new Float32Array(w * h * 3)
  for (let i = 0; i < w * h; i++) {
    f[i * 3] = d[i * 4]
    f[i * 3 + 1] = d[i * 4 + 1]
    f[i * 3 + 2] = d[i * 4 + 2]
  }
  const out = await run(url, { [s.inputNames[0]]: new ort.Tensor('float32', f, [h, w, 3]) }, keep)
  sam = { key, emb: out[s.outputNames[0]], w: origW, h: origH, scale: w / origW }
}

async function samDecode(url: string, key: string, points: { x: number; y: number; label: number }[]) {
  if (!sam || sam.key !== key) throw new Error('Picture not analysed yet')
  const keep = [...sessions.keys()].filter((u) => u.includes('encoder'))
  const n = points.length + 1
  const coords = new Float32Array(n * 2)
  const labels = new Float32Array(n)
  points.forEach((p, i) => {
    coords[i * 2] = p.x * sam!.scale
    coords[i * 2 + 1] = p.y * sam!.scale
    labels[i] = p.label
  })
  labels[n - 1] = -1 // padding point (no box prompt)
  const out = await run(url, {
    image_embeddings: sam.emb,
    point_coords: new ort.Tensor('float32', coords, [1, n, 2]),
    point_labels: new ort.Tensor('float32', labels, [1, n]),
    mask_input: new ort.Tensor('float32', new Float32Array(256 * 256), [1, 1, 256, 256]),
    has_mask_input: new ort.Tensor('float32', new Float32Array([0]), [1]),
    orig_im_size: new ort.Tensor('float32', new Float32Array([sam.h, sam.w]), [2])
  }, keep, ['masks', 'iou_predictions'])
  const all = (await out.masks.getData()) as Float32Array
  const iou = (await out.iou_predictions.getData()) as Float32Array
  const [, count, mh, mw] = out.masks.dims
  // A single click is ambiguous (a patch of the ball? the ball? the player?). Among the
  // confident answers, prefer the largest one: people usually mean the whole object.
  const best = Math.max(...Array.from(iou).slice(0, count))
  let pick = 0
  let pickArea = -1
  for (let k = 0; k < count; k++) {
    if (iou[k] < best - 0.08) continue
    let area = 0
    const off = k * mw * mh
    for (let i = 0; i < mw * mh; i += 7) if (all[off + i] > 0) area++
    if (area > pickArea) {
      pickArea = area
      pick = k
    }
  }
  const m = all.subarray(pick * mw * mh, (pick + 1) * mw * mh)
  // Soft 1-2 px edge instead of a hard stair-step.
  const alpha = resizeAlpha(m, mw, mh, sam.w, sam.h, (v) => sigmoid(v * 3) * 255)
  return { alpha, w: sam.w, h: sam.h }
}

/* ------------------------------ object removal (LaMa) ------------------------------ */

async function inpaint(url: string, image: ImageData, mask: Uint8ClampedArray): Promise<ImageData> {
  const s = await session(url)
  const S = 512
  const w = image.width
  const h = image.height
  const d = pixels(imageDataCanvas(image), S, S)
  const mk = resizeAlpha(mask, w, h, S, S, (v) => v)
  const f = new Float32Array(3 * S * S)
  const fm = new Float32Array(S * S)
  for (let i = 0; i < S * S; i++) {
    f[i] = d[i * 4] / 255
    f[S * S + i] = d[i * 4 + 1] / 255
    f[2 * S * S + i] = d[i * 4 + 2] / 255
    fm[i] = mk[i] > 10 ? 1 : 0
  }
  const out = await run(url, {
    image: new ort.Tensor('float32', f, [1, 3, S, S]),
    mask: new ort.Tensor('float32', fm, [1, 1, S, S])
  })
  const o = (await out[s.outputNames[0]].getData()) as Float32Array
  // Model output is 0..255; if it looks like 0..1 scale it up.
  let max = 0
  for (let i = 0; i < o.length; i += 101) max = Math.max(max, o[i])
  const k = max <= 1.5 ? 255 : 1
  const res = new ImageData(S, S)
  for (let i = 0; i < S * S; i++) {
    res.data[i * 4] = o[i] * k
    res.data[i * 4 + 1] = o[S * S + i] * k
    res.data[i * 4 + 2] = o[2 * S * S + i] * k
    res.data[i * 4 + 3] = 255
  }
  const back = pixels(imageDataCanvas(res), w, h)
  return new ImageData(new Uint8ClampedArray(back), w, h)
}

/* ------------------------------ upscale (Real-ESRGAN) ------------------------------ */

async function upscale(id: number, url: string, image: ImageData, scale: 2 | 4): Promise<ImageData> {
  const s = await session(url)
  const T = 240 // tile size
  const P = 8 // overlap on each side (hides tile seams)
  const I = T + P * 2 // fixed model input size
  const W = image.width
  const H = image.height
  const OW = W * scale
  const OH = H * scale
  const out = new Uint8ClampedArray(OW * OH * 4)
  const src = image.data
  const cols = Math.ceil(W / T)
  const rows = Math.ceil(H / T)
  const f = new Float32Array(3 * I * I)
  let done = 0
  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      const x0 = tx * T - P
      const y0 = ty * T - P
      for (let y = 0; y < I; y++) {
        const sy = Math.min(H - 1, Math.max(0, y0 + y))
        for (let x = 0; x < I; x++) {
          const sx = Math.min(W - 1, Math.max(0, x0 + x))
          const si = (sy * W + sx) * 4
          const di = y * I + x
          f[di] = src[si] / 255
          f[I * I + di] = src[si + 1] / 255
          f[2 * I * I + di] = src[si + 2] / 255
        }
      }
      const r = await run(url, { [s.inputNames[0]]: new ort.Tensor('float32', f, [1, 3, I, I]) })
      const o = (await r[s.outputNames[0]].getData()) as Float32Array
      const O = I * 4
      const tw = Math.min(T, W - tx * T)
      const th = Math.min(T, H - ty * T)
      const k = 4 / scale // output pixels per written pixel (1 or 2)
      for (let y = 0; y < th * scale; y++) {
        for (let x = 0; x < tw * scale; x++) {
          const ox = (tx * T) * scale + x
          const oy = (ty * T) * scale + y
          let rr = 0
          let gg = 0
          let bb = 0
          for (let yy = 0; yy < k; yy++) {
            for (let xx = 0; xx < k; xx++) {
              const mi = (P * 4 + y * k + yy) * O + (P * 4 + x * k + xx)
              rr += o[mi]
              gg += o[O * O + mi]
              bb += o[2 * O * O + mi]
            }
          }
          const n = k * k
          const di = (oy * OW + ox) * 4
          out[di] = (rr / n) * 255
          out[di + 1] = (gg / n) * 255
          out[di + 2] = (bb / n) * 255
          out[di + 3] = 255
        }
      }
      done++
      progress(id, done / (cols * rows))
    }
  }
  return new ImageData(out, OW, OH)
}

self.onmessage = async (e: MessageEvent<Msg>) => {
  const m = e.data
  try {
    switch (m.type) {
      case 'init':
        return post(m.id, await init())
      case 'matte': {
        const r = await matte(m.url, m.image)
        m.image.close()
        return post(m.id, r, [r.alpha.buffer])
      }
      case 'samEncode':
        await samEncode(m.url, m.image, m.origW, m.origH, m.key)
        m.image.close()
        return post(m.id, true)
      case 'samDecode': {
        const r = await samDecode(m.url, m.key, m.points)
        return post(m.id, r, [r.alpha.buffer])
      }
      case 'inpaint': {
        const r = await inpaint(m.url, m.image, m.mask)
        return post(m.id, r, [r.data.buffer])
      }
      case 'upscale': {
        const r = await upscale(m.id, m.url, m.image, m.scale)
        return post(m.id, r, [r.data.buffer])
      }
      case 'release':
        for (const s of sessions.values()) await s.release()
        sessions.clear()
        sam = null
        return post(m.id, true)
    }
  } catch (err) {
    self.postMessage({ id: m.id, ok: false, error: (err as Error)?.message ?? String(err) })
  }
}
