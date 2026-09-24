/**
 * The editor actions an AI assistant (Claude / OpenAI / Gemini / Ollama) may request.
 * One JSON-Schema definition is shared by every provider; the renderer validates every
 * call again before applying it (model output is never trusted blindly).
 */

export interface ToolDef {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, { type: 'string' | 'integer' | 'number'; description: string; enum?: string[] }>
    required: string[]
  }
}

export const ADJUST_KEYS = [
  'exposure',
  'brightness',
  'contrast',
  'highlights',
  'shadows',
  'temperature',
  'tint',
  'saturation',
  'vibrance',
  'hue',
  'clarity',
  'sharpen',
  'blur',
  'vignette',
  'grain',
  'fade'
] as const

export const FILTER_IDS = ['none', 'vivid', 'warm', 'cool', 'golden', 'matte', 'film', 'teal-orange', 'dramatic', 'vintage', 'mono', 'noir', 'sepia']
export const CROP_SHAPES = ['1:1', '4:5', '9:16', '16:9', '3:2', '4:3', 'a4']
export const TEXT_STYLES = ['title', 'subtitle', 'handwritten', 'neon', 'outline', 'label', 'classic', 'meme']

const slider = (what: string) => ({ type: 'integer' as const, description: `${what}, -100..100 (0 = neutral). Absolute target value.` })

export const AI_TOOLS: ToolDef[] = [
  {
    name: 'adjust_photo',
    description:
      'Set light/colour/effect sliders of the selected layer. Values are absolute targets between -100 and 100 (sharpen, blur, grain, fade: 0..100). Only include the sliders you want to change. Subtle values (5-30) usually look best.',
    parameters: {
      type: 'object',
      properties: {
        exposure: slider('Exposure'),
        brightness: slider('Brightness (midtones)'),
        contrast: slider('Contrast'),
        highlights: slider('Highlights (negative recovers bright areas)'),
        shadows: slider('Shadows (positive lifts dark areas)'),
        temperature: slider('Warmth (positive = warmer/yellow, negative = cooler/blue)'),
        tint: slider('Tint (positive = magenta, negative = green)'),
        saturation: slider('Saturation'),
        vibrance: slider('Vibrance (boosts muted colours)'),
        hue: slider('Hue shift'),
        clarity: slider('Clarity (local contrast)'),
        sharpen: { type: 'integer', description: 'Sharpen 0..100' },
        blur: { type: 'integer', description: 'Blur 0..100' },
        vignette: slider('Vignette: positive values (20-40) darken the corners — the classic vignette; negative values lighten them'),
        grain: { type: 'integer', description: 'Film grain 0..100' },
        fade: { type: 'integer', description: 'Faded / matte look 0..100' }
      },
      required: []
    }
  },
  {
    name: 'apply_filter',
    description: 'Apply a one-click look (filter) to the selected layer. Use "none" to remove the filter.',
    parameters: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Look name', enum: FILTER_IDS },
        strength: { type: 'integer', description: 'Strength 0..100 (100 = full)' }
      },
      required: ['filter']
    }
  },
  {
    name: 'crop_to_shape',
    description: 'Crop the whole picture to a shape (centred). 1:1 = Instagram post, 4:5 = Instagram portrait, 9:16 = Story/TikTok/Reels, 16:9 = YouTube, a4 = A4 page.',
    parameters: { type: 'object', properties: { shape: { type: 'string', description: 'Aspect ratio', enum: CROP_SHAPES } }, required: ['shape'] }
  },
  {
    name: 'rotate_image',
    description: 'Rotate the whole picture by 90 degrees.',
    parameters: { type: 'object', properties: { direction: { type: 'string', description: 'left or right', enum: ['left', 'right'] } }, required: ['direction'] }
  },
  {
    name: 'flip_image',
    description: 'Mirror the whole picture.',
    parameters: {
      type: 'object',
      properties: { axis: { type: 'string', description: 'horizontal or vertical', enum: ['horizontal', 'vertical'] } },
      required: ['axis']
    }
  },
  {
    name: 'resize_image',
    description: 'Make the whole picture smaller or bigger so that its longest side has this many pixels (keeps proportions).',
    parameters: { type: 'object', properties: { long_edge: { type: 'integer', description: 'Pixels, 16..16384' } }, required: ['long_edge'] }
  },
  {
    name: 'add_text',
    description: 'Add a text layer on the picture.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text (can contain line breaks)' },
        position: { type: 'string', description: 'Where to put it', enum: ['top', 'center', 'bottom'] },
        style: { type: 'string', description: 'Look of the text', enum: TEXT_STYLES },
        color: { type: 'string', description: 'Optional text colour as #rrggbb' }
      },
      required: ['text', 'position', 'style']
    }
  },
  {
    name: 'enhance_automatically',
    description: 'Let the editor improve exposure, contrast and colour balance of the selected layer automatically.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'remove_background',
    description: 'Remove the background of the selected picture layer with the local AI (keeps the main subject).',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'enlarge_image',
    description: 'Make the picture bigger with AI detail (super-resolution).',
    parameters: { type: 'object', properties: { factor: { type: 'string', description: '2 or 4 times', enum: ['2', '4'] } }, required: ['factor'] }
  }
]

export interface AiAction {
  name: string
  args: Record<string, unknown>
}

export interface AiRequest {
  mode: 'command' | 'suggest'
  prompt: string
  /** Short description of the document state for the model. */
  context: string
  /** JPEG, base64 without data: prefix (optional). */
  image?: string
}

export interface AiReply {
  text: string
  actions: AiAction[]
  model: string
  /** Rough cost in USD when known (Claude). */
  costUsd?: number
}

export type ProviderId = 'off' | 'ollama' | 'claude' | 'openai' | 'gemini'

/** Ollama models that can look at pictures (the others only get the text description). */
export const OLLAMA_VISION = /llava|vision|moondream|gemma3|qwen2\.5-?vl|minicpm-v|bakllava/i

/** Does this provider/model get to see the picture? */
export const seesPicture = (s: Pick<AiSettings, 'provider' | 'models' | 'sendImage'>): boolean =>
  s.sendImage && s.provider !== 'off' && (s.provider !== 'ollama' || OLLAMA_VISION.test(s.models.ollama))

export interface AiSettings {
  provider: ProviderId
  models: Record<Exclude<ProviderId, 'off'>, string>
  imageModels: { openai: string; gemini: string }
  ollamaUrl: string
  /** Which providers have a saved key, and its last 4 characters. */
  keys: Partial<Record<'claude' | 'openai' | 'gemini', string>>
  /** Send a small copy of the picture so the AI can see it (vision). */
  sendImage: boolean
}

export const SYSTEM_PROMPT = `You are the assistant inside EasyStudio Photo, an easy photo editor for people who are not experts.
The user tells you in plain words (often Romanian or English) what they want. Do it by calling the editor tools.
Guidelines:
- Prefer few, tasteful changes; subtle slider values (5-30) usually look better than extreme ones.
- Slider values are absolute targets for the selected layer; keep the ones already set unless asked to change them.
- If the request is not possible with the tools, say so briefly instead of guessing.
- Always finish with one short sentence, in the user's language, saying what you did.`

export const SUGGEST_PROMPT =
  'Look at this photo and improve how it looks with 1 to 4 tool calls. Use only adjust_photo, apply_filter or enhance_automatically — do not crop, rotate, resize, add text or remove the background (the user did not ask for that). Keep it natural and subtle. Then explain in one or two short sentences what you changed and why.'
