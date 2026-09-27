import i18next from 'i18next'
import { create } from 'zustand'
import { DEFAULT_TEXT, type TextStyle } from '@easystudio/draw'
import { hasSound, mixAudio } from '../engine/exporter'
import type { AsrMessage, AsrModel, AsrRequest } from '../engine/asr.worker'
import { commit, compose, getProject, showTimeline } from './editor'
import { isPro } from './pro'
import * as P from './project'
import { addSubtitleTrack, splitCues, type Cue } from './subtitleCues'
import { toast } from './store'

/**
 * Automatic subtitles: the sound of the video clips (not the music tracks) is mixed, turned into
 * 16 kHz mono and handed to Whisper in a worker; what it hears becomes title clips on a new track.
 */

const t = (k: string, o?: Record<string, unknown>) => i18next.t(k, o) as string

export type SubtitleLook = 'classic' | 'box' | 'yellow'

/** Free version: subtitles for the first minute of the video. */
export const FREE_SUBTITLE_SECONDS = 60

export interface SubtitleState {
  open: boolean
  phase: 'setup' | 'audio' | 'download' | 'listen' | 'done' | 'error'
  /** 0…1 of the current phase, or null when unknown. */
  progress: number | null
  error: string | null
  count: number
}

export const useSubtitles = create<SubtitleState>(() => ({ open: false, phase: 'setup', progress: null, error: null, count: 0 }))
const set = useSubtitles.setState

export const openSubtitles = () => set({ open: true, phase: 'setup', progress: null, error: null, count: 0 })
export const closeSubtitles = () => {
  cancel()
  set({ open: false })
}

/** Text look of subtitles for a frame of this size. */
export function subtitleStyle(look: SubtitleLook, width: number, height: number): TextStyle {
  const size = Math.round(Math.min(width, height) * 0.055)
  const base: TextStyle = { ...DEFAULT_TEXT, font: 'Montserrat', weight: 700, size, align: 'center', lineHeight: 1.15, color: '#ffffff', fill: true, shadowBlur: 0, shadowX: 0, shadowY: 0 }
  if (look === 'box') return { ...base, strokeWidth: 0, bgEnabled: true, bgColor: '#000000cc', bgRadius: Math.round(size * 0.25), bgPadding: Math.round(size * 0.3) }
  const stroke = { strokeColor: '#000000', strokeWidth: Math.max(2, Math.round(size * 0.14)), bgEnabled: false }
  return look === 'yellow' ? { ...base, ...stroke, color: '#ffd400', weight: 900 } : { ...base, ...stroke }
}

const RATE = 16000

/**
 * The speech of the video, 16 kHz mono: the sound of the video clips, without the music tracks.
 * When the clips have no sound (a voice-over recorded separately), every track is used.
 */
export async function speechAudio(p: P.Project, seconds: number, onProgress?: (f: number) => void): Promise<Float32Array> {
  const visual = compose({ ...p, tracks: p.tracks.filter((tr) => tr.kind !== 'audio' && !tr.muted) })
  const comp = hasSound(visual) ? visual : compose(p)
  const out = new Float32Array(Math.ceil(seconds * RATE))
  const STEP = 30
  for (let from = 0; from < seconds; from += STEP) {
    const to = Math.min(seconds, from + STEP)
    const mixed = await mixAudio(comp, from, to)
    const n = Math.max(1, Math.round((to - from) * RATE))
    const ctx = new OfflineAudioContext(1, n, RATE)
    const src = ctx.createBufferSource()
    src.buffer = mixed
    src.connect(ctx.destination)
    src.start()
    const mono = (await ctx.startRendering()).getChannelData(0)
    out.set(mono.subarray(0, Math.min(mono.length, out.length - Math.round(from * RATE))), Math.round(from * RATE))
    onProgress?.(to / seconds)
  }
  return out
}

let worker: Worker | null = null
let running: ((m: AsrMessage) => void) | null = null

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../engine/asr.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<AsrMessage>) => running?.(e.data)
  }
  return worker
}

function cancel(): void {
  if (running) {
    // The model cannot be interrupted mid-way: start a fresh worker next time.
    worker?.terminate()
    worker = null
    running = null
  }
}

/** Ask Whisper for the words and their times (the worker downloads the model on first use). */
export function recognise(audio: Float32Array, language: string | null, model: AsrModel, onMessage: (m: AsrMessage) => void): Promise<Cue[]> {
  return new Promise((resolve, reject) => {
    running = (m) => {
      onMessage(m)
      if (m.type === 'result') {
        running = null
        resolve(m.chunks)
      } else if (m.type === 'error') {
        running = null
        reject(new Error(m.message))
      }
    }
    const req: AsrRequest = { type: 'transcribe', audio, language, model }
    getWorker().postMessage(req, [audio.buffer])
  })
}

/** The whole flow for the dialog. `language` null = detect. */
export async function makeSubtitles(opts: { language: string | null; model: AsrModel; look: SubtitleLook }): Promise<boolean> {
  const p = getProject()
  const total = P.projectDuration(p)
  if (!total) return false
  const seconds = isPro() ? total : Math.min(total, FREE_SUBTITLE_SECONDS)
  try {
    set({ phase: 'audio', progress: 0, error: null })
    const audio = await speechAudio(p, seconds, (f) => set({ progress: f }))
    const chunks = await recognise(audio, opts.language, opts.model, (m) => {
      if (m.type === 'download') set({ phase: 'download', progress: m.total ? m.loaded / m.total : null })
      else if (m.type === 'progress') set({ phase: 'listen', progress: m.total ? m.done / m.total : null })
    })
    const cues = splitCues(chunks)
    if (!cues.length) {
      set({ phase: 'error', error: t('subs.nothingHeard') })
      return false
    }
    const q = getProject()
    commit(t('hist.subtitles'), (pr) => addSubtitleTrack(pr, cues, subtitleStyle(opts.look, q.width, q.height)))
    showTimeline()
    set({ phase: 'done', count: cues.length })
    if (seconds < total) toast(t('subs.freeLimit', { count: FREE_SUBTITLE_SECONDS }), 'info', 8000)
    return true
  } catch (e) {
    console.error(e)
    if (useSubtitles.getState().open) set({ phase: 'error', error: String((e as Error)?.message ?? e) })
    return false
  }
}
