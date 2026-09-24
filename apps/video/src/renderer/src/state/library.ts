import i18next from 'i18next'
import { NEUTRAL_EFFECTS } from '@easystudio/gpu'
import { fitTransform, type Composition } from '../engine/engine'
import { disposeMedia, probeMedia, type MediaInfo } from '../media/media'
import { pickMedia, registerDropped, registerPaths, type MediaFile } from '../platform'
import { toast, useVideo } from './store'
import { commit, showMediaPreview, showTimeline, useEditor } from './editor'
import * as P from './project'

const t = (k: string, o?: Record<string, unknown>) => i18next.t(k, o) as string
const set = useVideo.setState
const get = useVideo.getState

/** How long a picture lasts when it is played on its own. */
export const IMAGE_SECONDS = 5

async function addFiles(files: MediaFile[]): Promise<MediaInfo[]> {
  const fresh = files.filter((f) => !get().media.some((m) => m.id === f.id))
  if (!fresh.length) return []
  set((s) => ({ importing: [...s.importing, ...fresh.map((f) => ({ key: f.id, name: f.name }))] }))
  const added: MediaInfo[] = []
  await Promise.all(
    fresh.map(async (f) => {
      try {
        const info = await probeMedia(f)
        added.push(info)
        set((s) => ({ media: [...s.media, info] }))
        if (!info.playable) toast(t('lib.cantPlay', { name: f.name }), 'error', 6000)
      } catch (e) {
        console.warn(e)
        toast(t('lib.notMedia', { name: f.name }), 'error', 6000)
      } finally {
        set((s) => ({ importing: s.importing.filter((i) => i.key !== f.id) }))
      }
    })
  )
  return added
}

export async function importDialog(): Promise<void> {
  await addFiles(await pickMedia())
}

export async function importDropped(files: File[]): Promise<void> {
  await addFiles(await registerDropped(files))
}

export async function importPaths(paths: string[]): Promise<MediaInfo[]> {
  return addFiles(await registerPaths(paths))
}

export function removeMedia(id: string): void {
  const m = get().media.find((x) => x.id === id)
  if (!m) return
  // Clips that use this file go too.
  const project = useEditor.getState().hist.present.state
  const used = project.tracks.flatMap((tr) => tr.clips.filter((c) => c.mediaId === id))
  if (used.length) {
    commit(t('hist.delete'), (p) => used.reduce((q, c) => P.removeClip(q, c.id), p))
  }
  if (get().selectedMedia === id) {
    set({ selectedMedia: null })
    showTimeline()
  }
  set((s) => ({ media: s.media.filter((x) => x.id !== id) }))
  if (m.thumb) URL.revokeObjectURL(m.thumb)
  disposeMedia(id)
}

/** Preview of one library item in the player. */
export function previewComposition(m: MediaInfo): Composition {
  const W = m.width || 1920
  const H = m.height || 1080
  const dur = m.kind === 'image' ? IMAGE_SECONDS : m.duration
  return {
    width: W,
    height: H,
    fps: m.fps || 30,
    duration: dur,
    clips: [
      {
        id: `preview:${m.id}`,
        media: m,
        transIn: null,
        transOut: null,
        start: 0,
        dur,
        in: 0,
        speed: 1,
        z: 0,
        transform: m.hasVideo ? fitTransform(m.width, m.height, W, H) : null,
        opacity: 1,
        blend: 'normal',
        effects: NEUTRAL_EFFECTS,
        volume: m.hasAudio ? 1 : 0,
        fadeIn: 0,
        fadeOut: 0
      }
    ]
  }
}

/** Click in the library: preview the file in the player (the timeline stays as it is). */
export function selectMedia(id: string | null): void {
  set({ selectedMedia: id })
  const m = get().media.find((x) => x.id === id)
  if (m) showMediaPreview(previewComposition(m))
  else showTimeline()
}
