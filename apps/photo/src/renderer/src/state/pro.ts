import i18next from 'i18next'
import { canUseFree, isPro, requirePro, spendFreeUse } from '@easystudio/license'
import { toast } from './store'

/*
 * What the free version of EasyStudio Photo includes. Everything else needs Pro (a Microsoft
 * Store add-on, see packages/license).
 */

/** AI tools (remove background, select subject/object, erase objects, enlarge): tries per day. */
export const FREE_AI_PER_DAY = 3
/** Longest side of an exported picture. */
export const FREE_EXPORT_EDGE = 1920
/** The first templates are free. */
export const FREE_TEMPLATES = 3

const t = (k: string, o?: Record<string, unknown>) => i18next.t(k, o) as string

/** Before an AI tool runs: false (and the Pro dialog) when today's free tries are used up. */
export const aiAllowed = (feature: string): boolean => canUseFree('ai', FREE_AI_PER_DAY, feature)

/** After an AI tool succeeded: count it and say how many free tries are left. */
export function aiUsed(): void {
  const left = spendFreeUse('ai', FREE_AI_PER_DAY)
  if (left !== Infinity) toast(t('license.freeLeft', { count: left }), 'info', 5000)
}

export const exportLocked = (longEdge: number): boolean => !isPro() && longEdge > FREE_EXPORT_EDGE

export const templateLocked = (index: number): boolean => !isPro() && index >= FREE_TEMPLATES

export const proBenefits = (): string[] => ['ai', 'export', 'templates', 'psd', 'clone', 'future'].map((k) => t(`proBenefits.${k}`))

export { isPro, requirePro }
