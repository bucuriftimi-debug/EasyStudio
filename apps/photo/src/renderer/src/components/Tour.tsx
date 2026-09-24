import { useEffect, useLayoutEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@easystudio/ui'
import { useEditor } from '../state/store'

/** First-run tips: a spotlight on the main parts of the editor, one at a time. */

const DONE_KEY = 'easystudio.photo.tourDone'

const STEPS = [
  { target: '.toolrail', key: 'tools', side: 'right' },
  { target: '.rightpanel', key: 'panel', side: 'left' },
  { target: '.ai-btn', key: 'ai', side: 'below' },
  { target: '.topbar-right .es-seg', key: 'mode', side: 'below' },
  { target: '.topbar-right > .es-btn.primary', key: 'export', side: 'below' }
] as const

export function tourDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1'
  } catch {
    return true
  }
}

function finish(): void {
  try {
    localStorage.setItem(DONE_KEY, '1')
  } catch {
    /* ignore */
  }
  useEditor.setState({ tour: null })
}

/** Show the tips the first time a picture is opened. */
export function useFirstRunTour(): void {
  const hasDoc = useEditor((s) => !!s.hist)
  useEffect(() => {
    if (!hasDoc || tourDone() || new URLSearchParams(location.search).has('selftest')) return
    const id = setTimeout(() => useEditor.getState().tour === null && useEditor.setState({ tour: 0 }), 800)
    return () => clearTimeout(id)
  }, [hasDoc])
}

export function Tour() {
  const { t } = useTranslation()
  const step = useEditor((s) => s.tour)
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
      if (e.key === 'Escape') finish()
      if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      if (e.key === 'ArrowLeft' && step > 0) useEditor.setState({ tour: step - 1 })
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  if (step === null) return null
  const s = STEPS[step]
  const next = () => (step + 1 < STEPS.length ? useEditor.setState({ tour: step + 1 }) : finish())

  const pad = 6
  const box = rect ?? new DOMRect(window.innerWidth / 2 - 1, window.innerHeight / 2 - 1, 2, 2)
  const cardW = 320
  let left: number
  let top: number
  if (s.side === 'right') {
    left = box.right + 16
    top = box.top + 40
  } else if (s.side === 'left') {
    left = box.left - cardW - 16
    top = box.top + 60
  } else {
    left = Math.min(window.innerWidth - cardW - 12, Math.max(12, box.left + box.width / 2 - cardW / 2))
    top = box.bottom + 14
  }

  return (
    <div className="tour">
      <div
        className="tour-spot"
        style={{ left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2 }}
      />
      <div className="tour-card" style={{ left, top, width: cardW }} role="dialog" aria-label={t(`tour.${s.key}Title`)}>
        <small>
          {step + 1} / {STEPS.length}
        </small>
        <strong>{t(`tour.${s.key}Title`)}</strong>
        <p>{t(`tour.${s.key}Text`)}</p>
        <div className="tour-foot">
          <button type="button" className="link" onClick={finish}>
            {t('tour.skip')}
          </button>
          <div className="spacer" />
          {step > 0 && (
            <Button size="sm" onClick={() => useEditor.setState({ tour: step - 1 })}>
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
