import i18next from 'i18next'
import { isPro, requirePro } from '@easystudio/license'
import type { ExportSettings } from '../engine/exporter'

/*
 * What the free version of EasyStudio Video includes. Everything else needs Pro (a Microsoft
 * Store add-on, see packages/license).
 *
 * Free exports: 720p clean, 1080p with a small "Made with EasyStudio" mark, up to 30 fps,
 * small or medium quality, MP4.
 */

export const FREE_CLEAN_SHORT_SIDE = 720
export const FREE_MAX_SHORT_SIDE = 1080
export const FREE_MAX_FPS = 30

const t = (k: string, o?: Record<string, unknown>) => i18next.t(k, o) as string
const shortSide = (s: { width: number; height: number }) => Math.min(s.width, s.height)

/** Why these export settings need Pro (a feature name for the dialog), or null if they are free. */
export function lockedReason(s: ExportSettings): string | null {
  if (isPro()) return null
  if (shortSide(s) > FREE_MAX_SHORT_SIDE) return t('proFeature.size')
  if (s.fps > FREE_MAX_FPS) return t('proFeature.fps')
  if (s.quality === 'high') return t('proFeature.quality')
  if (s.format === 'webm') return t('proFeature.webm')
  return null
}

export const sizeLocked = (shortSidePx: number): boolean => !isPro() && shortSidePx > FREE_MAX_SHORT_SIDE
export const fpsLocked = (fps: number): boolean => !isPro() && fps > FREE_MAX_FPS
export const qualityLocked = (q: string): boolean => !isPro() && q === 'high'
export const formatLocked = (f: string): boolean => !isPro() && f === 'webm'

/** Free exports above 720p carry the watermark. */
export const needsWatermark = (s: { width: number; height: number }): boolean => !isPro() && shortSide(s) > FREE_CLEAN_SHORT_SIDE

export const proBenefits = (): string[] => ['size', 'watermark', 'fps', 'quality', 'webm', 'future'].map((k) => t(`proBenefits.${k}`))

export { isPro, requirePro }
