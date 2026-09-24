// Descarcă modelele AI în .data/photo/models (pe E:) și afișează intrările/ieșirile lor.
// Folosire:  node tools/models.mjs            (descarcă ce lipsește + inspectează)
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, '.data', 'photo', 'models')
mkdirSync(dir, { recursive: true })

const MODELS = {
  'isnet-general.onnx': 'https://huggingface.co/skillsafe-ai/isnet-general-use/resolve/main/isnet-general-use.onnx',
  'mobilesam-encoder.onnx': 'https://huggingface.co/Acly/MobileSAM/resolve/main/mobile_sam_image_encoder.onnx',
  'sam-decoder-multi.onnx': 'https://huggingface.co/Acly/MobileSAM/resolve/main/sam_mask_decoder_multi.onnx',
  'lama.onnx': 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx',
  'realesrgan-x4.onnx': 'https://huggingface.co/skillsafe-ai/realesr-general-x4v3/resolve/main/model.onnx'
}

for (const [file, url] of Object.entries(MODELS)) {
  const dest = join(dir, file)
  if (existsSync(dest)) continue
  process.stdout.write(`Downloading ${file} … `)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest + '.part'))
  renameSync(dest + '.part', dest)
  console.log(`${(statSync(dest).size / 1e6).toFixed(1)} MB`)
}

const ort = await import('onnxruntime-web')
ort.env.wasm.numThreads = 1
for (const file of Object.keys(MODELS)) {
  const s = await ort.InferenceSession.create(join(dir, file))
  const fmt = (m) => m.map((x) => `${x.name}:${x.type ?? ''}[${(x.shape ?? []).join(',')}]`).join('  ')
  console.log(`\n${file}\n  in : ${fmt(s.inputMetadata ?? s.inputNames.map((n) => ({ name: n })))}\n  out: ${fmt(s.outputMetadata ?? s.outputNames.map((n) => ({ name: n })))}`)
  await s.release()
}
