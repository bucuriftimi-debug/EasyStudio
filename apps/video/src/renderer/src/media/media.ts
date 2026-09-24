import { ALL_FORMATS, CanvasSink, CustomSource, Input, type InputAudioTrack, type InputVideoTrack } from 'mediabunny'
import { readMedia, type MediaFile } from '../platform'

/**
 * A file in the media library, with what the editor needs to know about it. The Mediabunny
 * `Input` reads the file lazily (only the byte ranges it needs).
 */
export interface MediaInfo {
  id: string
  file: MediaFile
  kind: 'video' | 'audio' | 'image'
  name: string
  /** Seconds (pictures: 0 — they last as long as their clip). */
  duration: number
  /** Display size (after the rotation stored in the file). */
  width: number
  height: number
  fps: number
  /** Clockwise rotation stored in the file (phones), degrees. */
  rotation: 0 | 90 | 180 | 270
  hasVideo: boolean
  hasAudio: boolean
  videoCodec: string | null
  audioCodec: string | null
  /** Small picture for the library (object URL). */
  thumb: string | null
  /** Can this computer decode it? */
  playable: boolean
}

interface Handles {
  input: Input | null
  video: InputVideoTrack | null
  audio: InputAudioTrack | null
  /** Pictures: the decoded bitmap. */
  image: ImageBitmap | null
}

const handles = new Map<string, Handles>()

function openInput(file: MediaFile): Input {
  return new Input({
    formats: ALL_FORMATS,
    source: new CustomSource({
      getSize: () => file.size,
      read: (start, end) => readMedia(file, start, end),
      prefetchProfile: 'fileSystem',
      maxCacheSize: 32 * 1024 * 1024
    })
  })
}

export function mediaHandles(id: string): Handles {
  const h = handles.get(id)
  if (!h) throw new Error('Media not loaded')
  return h
}

async function blobUrl(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<string> {
  const blob = canvas instanceof OffscreenCanvas ? await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 }) : await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', 0.8))
  return URL.createObjectURL(blob)
}

async function imageThumb(bmp: ImageBitmap): Promise<string> {
  const k = Math.min(1, 320 / Math.max(bmp.width, bmp.height))
  const c = new OffscreenCanvas(Math.max(1, Math.round(bmp.width * k)), Math.max(1, Math.round(bmp.height * k)))
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return blobUrl(c)
}

/** Read everything the editor needs to know about a file (fast: only headers are parsed). */
export async function probeMedia(file: MediaFile): Promise<MediaInfo> {
  const base: MediaInfo = {
    id: file.id,
    file,
    kind: file.kind,
    name: file.name,
    duration: 0,
    width: 0,
    height: 0,
    fps: 30,
    rotation: 0,
    hasVideo: false,
    hasAudio: false,
    videoCodec: null,
    audioCodec: null,
    thumb: null,
    playable: true
  }

  if (file.kind === 'image') {
    const bytes = await readMedia(file, 0, file.size)
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart]), { imageOrientation: 'from-image', premultiplyAlpha: 'premultiply' })
    handles.set(file.id, { input: null, video: null, audio: null, image: bmp })
    return { ...base, width: bmp.width, height: bmp.height, hasVideo: true, thumb: await imageThumb(bmp) }
  }

  const input = openInput(file)
  const video = await input.getPrimaryVideoTrack()
  const audio = await input.getPrimaryAudioTrack()
  handles.set(file.id, { input, video, audio, image: null })
  if (!video && !audio) throw new Error('no-tracks')

  const info: MediaInfo = { ...base, kind: video ? 'video' : 'audio', hasVideo: !!video, hasAudio: !!audio }
  info.duration = (await input.getDurationFromMetadata()) ?? (await input.computeDuration())
  if (audio) {
    info.audioCodec = await audio.getCodec()
    if (!(await audio.canDecode())) info.hasAudio = false
  }
  if (video) {
    info.videoCodec = await video.getCodec()
    info.rotation = (await video.getRotation()) as MediaInfo['rotation']
    const w = await video.getSquarePixelWidth()
    const h = await video.getSquarePixelHeight()
    const sideways = info.rotation === 90 || info.rotation === 270
    info.width = sideways ? h : w
    info.height = sideways ? w : h
    try {
      const fps = (await video.computeFrameRateMetrics()).bestGuessFrameRate
      if (fps && isFinite(fps)) info.fps = Math.round(fps * 100) / 100
    } catch {
      /* keep 30 */
    }
    info.playable = await video.canDecode()
    if (info.playable) {
      try {
        const sink = new CanvasSink(video, { width: 320, height: Math.round((320 * info.height) / Math.max(1, info.width)), fit: 'cover' })
        const shot = await sink.getCanvas(Math.min(info.duration * 0.1, 1))
        if (shot) info.thumb = await blobUrl(shot.canvas)
      } catch {
        /* no thumbnail */
      }
    }
  }
  return info
}

export function disposeMedia(id: string): void {
  const h = handles.get(id)
  if (!h) return
  h.input?.dispose()
  h.image?.close()
  handles.delete(id)
}
