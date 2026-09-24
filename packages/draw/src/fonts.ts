/**
 * Fonts bundled with the app (Google Fonts, SIL Open Font License — free to use and ship).
 * Only the Latin + Latin Extended subsets are included (covers Romanian ă â î ș ț).
 */
import '@fontsource/montserrat/latin-400.css'
import '@fontsource/montserrat/latin-ext-400.css'
import '@fontsource/montserrat/latin-700.css'
import '@fontsource/montserrat/latin-ext-700.css'
import '@fontsource/montserrat/latin-900.css'
import '@fontsource/montserrat/latin-ext-900.css'
import '@fontsource/poppins/latin-400.css'
import '@fontsource/poppins/latin-ext-400.css'
import '@fontsource/poppins/latin-700.css'
import '@fontsource/poppins/latin-ext-700.css'
import '@fontsource/poppins/latin-900.css'
import '@fontsource/poppins/latin-ext-900.css'
import '@fontsource/playfair-display/latin-400.css'
import '@fontsource/playfair-display/latin-ext-400.css'
import '@fontsource/playfair-display/latin-700.css'
import '@fontsource/playfair-display/latin-ext-700.css'
import '@fontsource/playfair-display/latin-400-italic.css'
import '@fontsource/playfair-display/latin-ext-400-italic.css'
import '@fontsource/bebas-neue/latin-400.css'
import '@fontsource/bebas-neue/latin-ext-400.css'
import '@fontsource/oswald/latin-400.css'
import '@fontsource/oswald/latin-ext-400.css'
import '@fontsource/oswald/latin-700.css'
import '@fontsource/oswald/latin-ext-700.css'
import '@fontsource/pacifico/latin-400.css'
import '@fontsource/pacifico/latin-ext-400.css'
import '@fontsource/lobster/latin-400.css'
import '@fontsource/lobster/latin-ext-400.css'
import '@fontsource/dancing-script/latin-400.css'
import '@fontsource/dancing-script/latin-ext-400.css'
import '@fontsource/dancing-script/latin-700.css'
import '@fontsource/dancing-script/latin-ext-700.css'
import '@fontsource/caveat/latin-400.css'
import '@fontsource/caveat/latin-ext-400.css'
import '@fontsource/caveat/latin-700.css'
import '@fontsource/caveat/latin-ext-700.css'
import '@fontsource/anton/latin-400.css'
import '@fontsource/anton/latin-ext-400.css'
import '@fontsource/roboto-slab/latin-400.css'
import '@fontsource/roboto-slab/latin-ext-400.css'
import '@fontsource/roboto-slab/latin-700.css'
import '@fontsource/roboto-slab/latin-ext-700.css'
import '@fontsource/permanent-marker/latin-400.css'

export interface FontInfo {
  family: string
  weights: number[]
  bundled: boolean
}

export const BUNDLED_FONTS: FontInfo[] = [
  { family: 'Montserrat', weights: [400, 700, 900], bundled: true },
  { family: 'Poppins', weights: [400, 700, 900], bundled: true },
  { family: 'Playfair Display', weights: [400, 700], bundled: true },
  { family: 'Bebas Neue', weights: [400], bundled: true },
  { family: 'Oswald', weights: [400, 700], bundled: true },
  { family: 'Anton', weights: [400], bundled: true },
  { family: 'Roboto Slab', weights: [400, 700], bundled: true },
  { family: 'Pacifico', weights: [400], bundled: true },
  { family: 'Lobster', weights: [400], bundled: true },
  { family: 'Dancing Script', weights: [400, 700], bundled: true },
  { family: 'Caveat', weights: [400, 700], bundled: true },
  { family: 'Permanent Marker', weights: [400], bundled: true },
  { family: 'Inter Variable', weights: [400, 700, 900], bundled: true }
]

/** Common Windows fonts, used when the system font list is not available. */
const WINDOWS_FONTS = [
  'Arial',
  'Arial Black',
  'Bahnschrift',
  'Calibri',
  'Cambria',
  'Candara',
  'Comic Sans MS',
  'Consolas',
  'Constantia',
  'Corbel',
  'Courier New',
  'Franklin Gothic Medium',
  'Gabriola',
  'Georgia',
  'Impact',
  'Ink Free',
  'Lucida Console',
  'Palatino Linotype',
  'Segoe Print',
  'Segoe Script',
  'Segoe UI',
  'Sitka Text',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana'
]

let systemFonts: string[] | null = null

/** Fonts installed on the computer (Local Font Access API when allowed, otherwise a known list). */
/** A font is installed if text measures differently than with the generic fallbacks. */
function installed(family: string): boolean {
  const ctx = new OffscreenCanvas(1, 1).getContext('2d')!
  const sample = 'mmmmmmmmmmlliWW@#1'
  return ['monospace', 'serif'].some((fb) => {
    ctx.font = `40px ${fb}`
    const a = ctx.measureText(sample).width
    ctx.font = `40px "${family}", ${fb}`
    return ctx.measureText(sample).width !== a
  })
}

export async function loadSystemFonts(): Promise<string[]> {
  if (systemFonts) return systemFonts
  const avail = (f: string) => installed(f)
  let list: string[] = []
  try {
    const q = (window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts
    if (q) list = [...new Set((await q()).map((f) => f.family))]
  } catch {
    /* permission denied or unsupported */
  }
  if (!list.length) list = WINDOWS_FONTS.filter(avail)
  const bundled = new Set(BUNDLED_FONTS.map((f) => f.family))
  systemFonts = list.filter((f) => !bundled.has(f)).sort((a, b) => a.localeCompare(b))
  return systemFonts
}

export function fontWeights(family: string): number[] {
  return BUNDLED_FONTS.find((f) => f.family === family)?.weights ?? [400, 700]
}
