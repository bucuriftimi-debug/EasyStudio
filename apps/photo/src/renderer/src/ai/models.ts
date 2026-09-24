/**
 * Local AI models (downloaded once, then everything runs offline on the graphics card).
 * Only permissively licensed models, so the app can later be sold or published.
 */
export interface ModelInfo {
  id: string
  file: string
  url: string
  /** Approximate download size in bytes (shown before downloading). */
  bytes: number
  license: string
  credit: string
}

export const MODELS = {
  matte: {
    id: 'matte',
    file: 'isnet-general.onnx',
    url: 'https://huggingface.co/skillsafe-ai/isnet-general-use/resolve/main/isnet-general-use.onnx',
    bytes: 178_648_008,
    license: 'Apache-2.0',
    credit: 'IS-Net / DIS (Xuebin Qin et al.) — general-use weights from rembg'
  },
  samEncoder: {
    id: 'samEncoder',
    file: 'mobilesam-encoder.onnx',
    url: 'https://huggingface.co/Acly/MobileSAM/resolve/main/mobile_sam_image_encoder.onnx',
    bytes: 28_157_093,
    license: 'Apache-2.0 / MIT',
    credit: 'MobileSAM (ChaoningZhang) — ONNX by Acly'
  },
  samDecoder: {
    id: 'samDecoder',
    file: 'sam-decoder-multi.onnx',
    url: 'https://huggingface.co/Acly/MobileSAM/resolve/main/sam_mask_decoder_multi.onnx',
    bytes: 16_496_559,
    license: 'Apache-2.0 / MIT',
    credit: 'Segment Anything (Meta) mask decoder — ONNX by Acly'
  },
  lama: {
    id: 'lama',
    file: 'lama.onnx',
    url: 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx',
    bytes: 208_044_816,
    license: 'Apache-2.0',
    credit: 'LaMa (Samsung AI) — ONNX by Carve'
  },
  upscale: {
    id: 'upscale',
    file: 'realesrgan-x4.onnx',
    url: 'https://huggingface.co/skillsafe-ai/realesr-general-x4v3/resolve/main/model.onnx',
    bytes: 4_870_000,
    license: 'BSD-3-Clause',
    credit: 'Real-ESRGAN general-x4v3 (xinntao)'
  }
} satisfies Record<string, ModelInfo>

export type ModelId = keyof typeof MODELS
