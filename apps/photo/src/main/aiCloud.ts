import Anthropic from '@anthropic-ai/sdk'
import { ipcMain, net, safeStorage } from 'electron'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tr } from './lang'
import { AI_TOOLS, OLLAMA_VISION, SUGGEST_PROMPT, SYSTEM_PROMPT, type AiAction, type AiReply, type AiRequest, type AiSettings, type ProviderId } from '../shared/aiTools'

/**
 * Optional cloud AI ("bring your own key") + local Ollama. Runs in the main process so API
 * keys never reach the web UI; keys are encrypted with Windows DPAPI (Electron safeStorage).
 */

type KeyProvider = 'claude' | 'openai' | 'gemini'

const DEFAULTS: Omit<AiSettings, 'keys'> = {
  provider: 'off',
  models: { claude: 'claude-opus-5', openai: 'gpt-6-astra', gemini: 'gemini-3.8-flash', ollama: 'qwen2.5:7b' },
  imageModels: { openai: 'gpt-image-2.5-sunburst', gemini: 'gemini-3.1-flash-image' },
  ollamaUrl: 'http://127.0.0.1:11434',
  sendImage: true
}

/** USD per million tokens (input, output) — shown in the settings and used for cost estimates. */
export const CLAUDE_PRICES: Record<string, [number, number]> = {
  'claude-opus-5': [5, 25],
  'claude-sonnet-5': [2, 10],
  'claude-haiku-4-5': [1, 5]
}

interface Stored {
  settings: Omit<AiSettings, 'keys'>
  secrets: Partial<Record<KeyProvider, string>>
}

let file = ''
let stored: Stored = { settings: { ...DEFAULTS }, secrets: {} }

async function load(): Promise<void> {
  if (!existsSync(file)) return
  try {
    const s = JSON.parse(await readFile(file, 'utf8')) as Partial<Stored>
    stored = {
      settings: { ...DEFAULTS, ...s.settings, models: { ...DEFAULTS.models, ...s.settings?.models }, imageModels: { ...DEFAULTS.imageModels, ...s.settings?.imageModels } },
      secrets: s.secrets ?? {}
    }
  } catch {
    /* corrupt file: start fresh */
  }
}

const save = () => writeFile(file, JSON.stringify(stored, null, 1))

function key(p: KeyProvider): string {
  const enc = stored.secrets[p]
  if (!enc) throw new Error(tr('noKey', { who: label(p) }))
  return safeStorage.decryptString(Buffer.from(enc, 'base64'))
}

function publicSettings(): AiSettings {
  const keys: AiSettings['keys'] = {}
  for (const p of ['claude', 'openai', 'gemini'] as KeyProvider[]) {
    if (!stored.secrets[p]) continue
    try {
      keys[p] = key(p).slice(-4)
    } catch {
      keys[p] = '????'
    }
  }
  return { ...stored.settings, keys }
}

const label = (p: ProviderId) => ({ off: 'AI', ollama: 'Ollama', claude: 'Claude', openai: 'OpenAI', gemini: 'Gemini' })[p]

function userText(req: AiRequest): string {
  const ask = req.mode === 'suggest' ? SUGGEST_PROMPT : `User request: ${req.prompt}`
  return `Current state of the document:\n${req.context}\n\n${ask}`
}

function parseArgs(a: unknown): Record<string, unknown> {
  if (typeof a === 'string') {
    try {
      return JSON.parse(a) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return (a && typeof a === 'object' ? a : {}) as Record<string, unknown>
}

/* ------------------------------ Claude (official SDK) ------------------------------ */

async function askClaude(req: AiRequest, model: string): Promise<AiReply> {
  const client = new Anthropic({ apiKey: key('claude'), maxRetries: 2, timeout: 120_000 })
  const content: Anthropic.Beta.BetaContentBlockParam[] = []
  if (req.image) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: req.image } })
  content.push({ type: 'text', text: userText(req) })
  const haiku = model.startsWith('claude-haiku')
  try {
    const res = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      // On a policy decline, Anthropic re-runs the request on a suitable model instead of refusing.
      ...(model === 'claude-opus-5' ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      // Picking editor actions is a simple task: low effort keeps it fast and cheap (suggestions think a bit more).
      ...(haiku ? {} : { thinking: { type: 'adaptive' as const }, output_config: { effort: req.mode === 'suggest' ? ('medium' as const) : ('low' as const) } }),
      system: SYSTEM_PROMPT,
      tools: AI_TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
      messages: [{ role: 'user', content }]
    })
    if (res.stop_reason === 'refusal') throw new Error(tr('claudeRefused'))
    const text: string[] = []
    const actions: AiAction[] = []
    for (const b of res.content) {
      if (b.type === 'text') text.push(b.text)
      else if (b.type === 'tool_use') actions.push({ name: b.name, args: parseArgs(b.input) })
    }
    const price = CLAUDE_PRICES[model]
    const costUsd = price ? (res.usage.input_tokens * price[0] + res.usage.output_tokens * price[1]) / 1e6 : undefined
    return { text: text.join('\n').trim(), actions, model: res.model, costUsd }
  } catch (e) {
    const who = 'Claude'
    if (e instanceof Anthropic.AuthenticationError) throw new Error(tr('badKey', { who }))
    if (e instanceof Anthropic.PermissionDeniedError) throw new Error(tr('noModelAccess', { who }))
    if (e instanceof Anthropic.RateLimitError) throw new Error(tr('tooMany', { who }))
    if (e instanceof Anthropic.BadRequestError) throw new Error(`Claude: ${e.message}`)
    if (e instanceof Anthropic.APIConnectionError) throw new Error(tr('offline', { who }))
    if (e instanceof Anthropic.APIError) throw new Error(e.status === 529 ? tr('overloaded', { who }) : tr('apiError', { who, status: e.status ?? '', msg: e.message }))
    throw e
  }
}

/* ------------------------------ OpenAI (Responses API) ------------------------------ */

/** The server could not be reached at all (as opposed to answering with an error). */
class OfflineError extends Error {}

async function httpJson(url: string, init: RequestInit, who: string): Promise<Record<string, unknown>> {
  let res: Response
  try {
    res = await net.fetch(url, init)
  } catch {
    throw new OfflineError(tr('offline', { who }))
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const err = body.error as { message?: string } | undefined
    // Gemini answers 400 "API key not valid" instead of 401.
    const badKey = res.status === 401 || res.status === 403 || /api key not valid/i.test(err?.message ?? '')
    if (badKey) throw new Error(tr('badKeyDetail', { who, msg: err?.message ?? res.status }))
    if (res.status === 429) throw new Error(tr('noCredit', { who, msg: err?.message ?? 429 }))
    throw new Error(tr('apiError', { who, status: res.status, msg: err?.message ?? res.statusText }))
  }
  return body
}

async function askOpenAI(req: AiRequest, model: string): Promise<AiReply> {
  const content: unknown[] = [{ type: 'input_text', text: userText(req) }]
  if (req.image) content.push({ type: 'input_image', image_url: `data:image/jpeg;base64,${req.image}` })
  const body = await httpJson(
    'https://api.openai.com/v1/responses',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${key('openai')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        instructions: SYSTEM_PROMPT,
        input: [{ role: 'user', content }],
        tools: AI_TOOLS.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters, strict: false }))
      })
    },
    'OpenAI'
  )
  const text: string[] = []
  const actions: AiAction[] = []
  for (const item of (body.output as Record<string, unknown>[]) ?? []) {
    if (item.type === 'function_call') actions.push({ name: String(item.name), args: parseArgs(item.arguments) })
    if (item.type === 'message') for (const c of (item.content as { type: string; text?: string }[]) ?? []) if (c.type === 'output_text' && c.text) text.push(c.text)
  }
  return { text: text.join('\n').trim(), actions, model }
}

/* ------------------------------ Gemini (generateContent) ------------------------------ */

async function askGemini(req: AiRequest, model: string): Promise<AiReply> {
  const parts: unknown[] = [{ text: userText(req) }]
  if (req.image) parts.push({ inlineData: { mimeType: 'image/jpeg', data: req.image } })
  const body = await httpJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': key('gemini'), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts }],
        // Gemini rejects empty object schemas: tools without inputs get no `parameters`.
        tools: [
          {
            functionDeclarations: AI_TOOLS.map((t) =>
              Object.keys(t.parameters.properties).length ? { name: t.name, description: t.description, parameters: t.parameters } : { name: t.name, description: t.description }
            )
          }
        ]
      })
    },
    'Gemini'
  )
  const text: string[] = []
  const actions: AiAction[] = []
  const cand = (body.candidates as { content?: { parts?: Record<string, unknown>[] } }[] | undefined)?.[0]
  for (const p of cand?.content?.parts ?? []) {
    if (typeof p.text === 'string') text.push(p.text)
    const fc = p.functionCall as { name?: string; args?: unknown } | undefined
    if (fc?.name) actions.push({ name: fc.name, args: parseArgs(fc.args) })
  }
  return { text: text.join('\n').trim(), actions, model }
}

/* ------------------------------ Ollama (local, free) ------------------------------ */

async function askOllama(req: AiRequest, model: string): Promise<AiReply> {
  const user: Record<string, unknown> = { role: 'user', content: userText(req) }
  if (req.image && OLLAMA_VISION.test(model)) user.images = [req.image]
  let body: Record<string, unknown>
  try {
    body = await httpJson(
      `${stored.settings.ollamaUrl.replace(/\/$/, '')}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, user],
          tools: AI_TOOLS.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
        })
      },
      'Ollama'
    )
  } catch (e) {
    if (e instanceof OfflineError) throw new Error(tr('ollamaOff'))
    throw e
  }
  const msg = body.message as { content?: string; tool_calls?: { function?: { name?: string; arguments?: unknown } }[] } | undefined
  const actions = (msg?.tool_calls ?? []).filter((c) => c.function?.name).map((c) => ({ name: c.function!.name!, args: parseArgs(c.function!.arguments) }))
  return { text: (msg?.content ?? '').trim(), actions, model }
}

async function ask(req: AiRequest): Promise<AiReply> {
  const s = stored.settings
  switch (s.provider) {
    case 'claude':
      return askClaude(req, s.models.claude)
    case 'openai':
      return askOpenAI(req, s.models.openai)
    case 'gemini':
      return askGemini(req, s.models.gemini)
    case 'ollama':
      return askOllama(req, s.models.ollama)
    default:
      throw new Error(tr('chooseProvider'))
  }
}

/* ------------------------------ generative fill ------------------------------ */

interface FillRequest {
  prompt: string
  /** PNG base64 of the picture (already resized to `size`). */
  image: string
  /** PNG base64 mask, same size: transparent = area to (re)generate. */
  mask: string
  size: '1024x1024' | '1536x1024' | '1024x1536'
  /** Where the area is, in % of the picture (for models without mask input). */
  area: string
}

async function fill(req: FillRequest): Promise<string> {
  const s = stored.settings
  if (s.provider === 'openai') {
    const form = new FormData()
    form.append('model', s.imageModels.openai)
    form.append('prompt', req.prompt)
    form.append('size', req.size)
    form.append('image[]', new Blob([Buffer.from(req.image, 'base64')], { type: 'image/png' }), 'image.png')
    form.append('mask', new Blob([Buffer.from(req.mask, 'base64')], { type: 'image/png' }), 'mask.png')
    const body = await httpJson('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key('openai')}` }, body: form }, 'OpenAI')
    const b64 = (body.data as { b64_json?: string }[] | undefined)?.[0]?.b64_json
    if (!b64) throw new Error(tr('noImage', { who: 'OpenAI' }))
    return b64
  }
  if (s.provider === 'gemini') {
    const body = await httpJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.imageModels.gemini)}:generateContent`,
      {
        method: 'POST',
        headers: { 'x-goog-api-key': key('gemini'), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: `Edit this photo. In the area ${req.area} (and only there): ${req.prompt}. Keep everything else exactly the same, same framing and size.` },
                { inlineData: { mimeType: 'image/png', data: req.image } }
              ]
            }
          ],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
        })
      },
      'Gemini'
    )
    const parts = (body.candidates as { content?: { parts?: { inlineData?: { data?: string } }[] } }[] | undefined)?.[0]?.content?.parts ?? []
    const img = parts.find((p) => p.inlineData?.data)?.inlineData?.data
    if (!img) throw new Error(tr('noImage', { who: 'Gemini' }))
    return img
  }
  throw new Error(tr('fillNeeds'))
}

/* ------------------------------ IPC ------------------------------ */

export async function registerAiCloud(dataDir: string): Promise<void> {
  file = join(dataDir, 'ai-settings.json')
  await load()

  ipcMain.handle('ai:settings', () => publicSettings())
  ipcMain.handle('ai:settings:set', async (_e, patch: Partial<Omit<AiSettings, 'keys'>>) => {
    const s = stored.settings
    stored.settings = {
      ...s,
      ...patch,
      models: { ...s.models, ...patch.models },
      imageModels: { ...s.imageModels, ...patch.imageModels }
    }
    await save()
    return publicSettings()
  })
  ipcMain.handle('ai:key:set', async (_e, provider: KeyProvider, value: string | null) => {
    if (!['claude', 'openai', 'gemini'].includes(provider)) throw new Error('Unknown provider')
    if (value) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error(tr('noSecureStorage'))
      stored.secrets[provider] = safeStorage.encryptString(value.trim()).toString('base64')
    } else delete stored.secrets[provider]
    await save()
    return publicSettings()
  })
  ipcMain.handle('ai:ask', (_e, req: AiRequest) => ask(req))
  ipcMain.handle('ai:test', async () => {
    const r = await ask({ mode: 'command', prompt: 'Reply with the single word OK. Do not call any tool.', context: '(test)' })
    return { model: r.model, text: r.text }
  })
  ipcMain.handle('ai:fill', (_e, req: FillRequest) => fill(req))
  ipcMain.handle('ai:ollama:models', async () => {
    try {
      const body = await httpJson(`${stored.settings.ollamaUrl.replace(/\/$/, '')}/api/tags`, {}, 'Ollama')
      return ((body.models as { name: string }[]) ?? []).map((m) => m.name)
    } catch {
      return []
    }
  })
}
