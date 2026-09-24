/** Order matters: the index is passed to the compositing shader. */
export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity'
] as const

export type BlendMode = (typeof BLEND_MODES)[number]

export function blendIndex(mode: BlendMode): number {
  const i = BLEND_MODES.indexOf(mode)
  return i < 0 ? 0 : i
}
