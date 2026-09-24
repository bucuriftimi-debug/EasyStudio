import { useEffect, useLayoutEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { History } from 'lucide-react'
import { create } from 'zustand'
import { Button, Modal } from '@easystudio/ui'
import * as Sn from '../state/session'

/* ------------------------------ crash recovery ------------------------------ */

export function RecoveryBanner() {
  const { t } = useTranslation()
  const rec = Sn.useSession((s) => s.recovery)
  if (!rec) return null
  return (
    <div className="recover-banner">
      <History size={20} />
      <div>
        <strong>{t('rec.title')}</strong>
        <span>{t('rec.text', { name: rec.name, time: new Date(rec.time).toLocaleString() })}</span>
      </div>
      <div className="spacer" />
      <Button size="sm" onClick={() => void Sn.discardRecovered()}>
        {t('rec.discard')}
      </Button>
      <Button size="sm" variant="primary" onClick={() => void Sn.restoreRecovered()}>
        {t('rec.restore')}
      </Button>
    </div>
  )
}

/* ------------------------------ help ------------------------------ */

export const useHelp = create<{ open: boolean }>(() => ({ open: false }))

const KEYS: [string, string][] = [
  ['Space', 'help.k_play'],
  ['← / →', 'help.k_frame'],
  ['Shift + ← / →', 'help.k_frame10'],
  ['S', 'help.k_split'],
  ['Del', 'help.k_delete'],
  ['Ctrl + Z / Ctrl + Shift + Z', 'help.k_undo'],
  ['+ / −', 'help.k_zoom'],
  ['Ctrl + I', 'help.k_import'],
  ['Ctrl + S', 'help.k_save'],
  ['Ctrl + O', 'help.k_open'],
  ['Ctrl + E', 'help.k_export']
]

export function HelpDialog() {
  const { t } = useTranslation()
  const open = useHelp((s) => s.open)
  if (!open) return null
  const close = () => useHelp.setState({ open: false })
  return (
    <Modal
      title={t('help.title')}
      onClose={close}
      width={480}
      footer={
        <>
          <Button
            onClick={() => {
              close()
              useTour.setState({ step: 0 })
            }}
          >
            {t('help.tips')}
          </Button>
          <div className="spacer" />
          <Button variant="primary" onClick={close}>
            {t('help.close')}
          </Button>
        </>
      }
    >
      <table className="keys">
        <tbody>
          {KEYS.map(([k, label]) => (
            <tr key={k}>
              <td>
                <kbd>{k}</kbd>
              </td>
              <td>{t(label)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  )
}

/* ------------------------------ first-run tips ------------------------------ */

export const useTour = create<{ step: number | null }>(() => ({ step: null }))
const DONE_KEY = 'easystudio.video.tourDone'

const STEPS = [
  { target: '.library', key: 'media', side: 'right' },
  { target: '.timeline', key: 'timeline', side: 'above' },
  { target: '.player', key: 'player', side: 'below-in' },
  { target: '.inspector', key: 'inspector', side: 'left' },
  { target: '.topbar .export-btn', key: 'export', side: 'below' }
] as const

function finishTour(): void {
  try {
    localStorage.setItem(DONE_KEY, '1')
  } catch {
    /* ignore */
  }
  useTour.setState({ step: null })
}

/** Start the tips the first time the app opens (not in automated tests). */
export function useFirstRunTour(): void {
  useEffect(() => {
    let done = true
    try {
      done = localStorage.getItem(DONE_KEY) === '1'
    } catch {
      /* ignore */
    }
    if (done || new URLSearchParams(location.search).has('selftest')) return
    const id = setTimeout(() => useTour.setState({ step: 0 }), 900)
    return () => clearTimeout(id)
  }, [])
}

export function Tour() {
  const { t } = useTranslation()
  const step = useTour((s) => s.step)
  const [rect, setRect] = useState<DOMRect | null>(null)
  useLayoutEffect(() => {
    if (step === null) return
    const measure = () => setRect(document.querySelector(STEPS[step].target)?.getBoundingClientRect() ?? null)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [step])
  useEffect(() => {
    if (step === null) return
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Escape') finishTour()
      if (e.key === 'ArrowRight' || e.key === 'Enter') next()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  if (step === null) return null
  const s = STEPS[step]
  const next = () => (step + 1 < STEPS.length ? useTour.setState({ step: step + 1 }) : finishTour())
  const box = rect ?? new DOMRect(innerWidth / 2, innerHeight / 2, 1, 1)
  const W = 320
  const pos =
    s.side === 'right'
      ? { left: box.right + 16, top: box.top + 40 }
      : s.side === 'left'
        ? { left: box.left - W - 16, top: box.top + 40 }
        : s.side === 'above'
          ? { left: Math.max(12, box.left + 140), top: box.top - 190 }
          : s.side === 'below-in'
            ? { left: box.left + box.width / 2 - W / 2, top: box.top + 30 }
            : { left: Math.min(innerWidth - W - 12, box.right - W), top: box.bottom + 14 }
  return (
    <div className="tour">
      <div className="tour-spot" style={{ left: box.left - 4, top: box.top - 4, width: box.width + 8, height: box.height + 8 }} />
      <div className="tour-card" style={{ ...pos, width: W }} role="dialog">
        <small>
          {step + 1} / {STEPS.length}
        </small>
        <strong>{t(`tour.${s.key}Title`)}</strong>
        <p>{t(`tour.${s.key}Text`)}</p>
        <div className="tour-foot">
          <button type="button" className="link" onClick={finishTour}>
            {t('tour.skip')}
          </button>
          <div className="spacer" />
          {step > 0 && (
            <Button size="sm" onClick={() => useTour.setState({ step: step - 1 })}>
              {t('tour.back')}
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={next}>
            {step + 1 < STEPS.length ? t('tour.next') : t('tour.done')}
          </Button>
        </div>
      </div>
    </div>
  )
}
