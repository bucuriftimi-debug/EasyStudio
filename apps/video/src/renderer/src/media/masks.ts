import { probeMedia } from './media'
import { registerPaths } from '../platform'

/**
 * Mask videos (made by "Remove background"): grey frames, white = keep. They live in the app's
 * data folder and are loaded like any media file, but never shown in the library.
 */

const ready = new Map<string, string>()
const loading = new Map<string, Promise<string | null>>()
let onLoaded: () => void = () => undefined

/** Called when a mask finished loading (the editor rebuilds what the player shows). */
export function setMaskListener(fn: () => void): void {
  onLoaded = fn
}

/** Media id of a loaded mask video, or null (and it starts loading). */
export function maskMedia(path: string): string | null {
  const id = ready.get(path)
  if (id) return id
  if (!loading.has(path)) {
    loading.set(
      path,
      (async () => {
        try {
          const [file] = await registerPaths([path])
          if (!file) return null
          await probeMedia(file)
          ready.set(path, file.id)
          onLoaded()
          return file.id
        } catch (e) {
          console.warn('[masks] could not load', path, e)
          return null
        }
      })()
    )
  }
  return null
}

/** Wait until a mask video is loaded (after making it). */
export async function loadMask(path: string): Promise<string | null> {
  return maskMedia(path) ?? (await loading.get(path)!)
}
