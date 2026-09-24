/** Presets shared by the photo and video apps. Labels are i18n keys. */

export interface SizePreset {
  id: string
  label: string
  hint: string
  w: number
  h: number
}

export const NEW_DOC_PRESETS: SizePreset[] = [
  { id: 'ig-post', label: 'preset.igPost', hint: 'Instagram', w: 1080, h: 1080 },
  { id: 'ig-portrait', label: 'preset.igPortrait', hint: 'Instagram', w: 1080, h: 1350 },
  { id: 'story', label: 'preset.story', hint: 'Instagram · TikTok', w: 1080, h: 1920 },
  { id: 'yt-thumb', label: 'preset.ytThumb', hint: 'YouTube', w: 1280, h: 720 },
  { id: 'full-hd', label: 'preset.fullHd', hint: '1920 × 1080', w: 1920, h: 1080 },
  { id: 'a4', label: 'preset.a4', hint: '300 DPI', w: 2480, h: 3508 },
  { id: 'fb-cover', label: 'preset.fbCover', hint: 'Facebook', w: 1640, h: 624 },
  { id: 'wallpaper', label: 'preset.wallpaper', hint: '3840 × 2160', w: 3840, h: 2160 }
]

export interface RatioPreset {
  id: string
  label: string
  /** width / height; 0 = free, -1 = original image ratio */
  ratio: number
}

export const CROP_RATIOS: RatioPreset[] = [
  { id: 'free', label: 'crop.free', ratio: 0 },
  { id: 'original', label: 'crop.original', ratio: -1 },
  { id: '1:1', label: 'crop.square', ratio: 1 },
  { id: '4:5', label: 'crop.portrait45', ratio: 4 / 5 },
  { id: '9:16', label: 'crop.story', ratio: 9 / 16 },
  { id: '16:9', label: 'crop.wide', ratio: 16 / 9 },
  { id: '3:2', label: 'crop.photo32', ratio: 3 / 2 },
  { id: '4:3', label: 'crop.photo43', ratio: 4 / 3 },
  { id: 'a4', label: 'crop.a4', ratio: 1 / Math.SQRT2 }
]

export interface ExportSizePreset {
  id: string
  label: string
  /** Longest edge in px; 0 = original size. */
  longEdge: number
}

export const EXPORT_SIZES: ExportSizePreset[] = [
  { id: 'original', label: 'export.sizeOriginal', longEdge: 0 },
  { id: '4k', label: 'export.size4k', longEdge: 3840 },
  { id: 'large', label: 'export.sizeLarge', longEdge: 2560 },
  { id: 'hd', label: 'export.sizeHd', longEdge: 1920 },
  { id: 'medium', label: 'export.sizeMedium', longEdge: 1280 },
  { id: 'small', label: 'export.sizeSmall', longEdge: 800 }
]

export type ImageFormat = 'png' | 'jpeg' | 'webp'

export const IMAGE_FORMATS: { id: ImageFormat; label: string; ext: string; mime: string; lossy: boolean }[] = [
  { id: 'jpeg', label: 'JPG', ext: 'jpg', mime: 'image/jpeg', lossy: true },
  { id: 'png', label: 'PNG', ext: 'png', mime: 'image/png', lossy: false },
  { id: 'webp', label: 'WebP', ext: 'webp', mime: 'image/webp', lossy: true }
]

export function scaleToLongEdge(w: number, h: number, longEdge: number): { w: number; h: number } {
  if (!longEdge || Math.max(w, h) <= longEdge) return { w, h }
  const k = longEdge / Math.max(w, h)
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`
}
