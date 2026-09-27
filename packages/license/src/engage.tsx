import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Star, X } from 'lucide-react'
import { Button, Modal } from '@easystudio/ui'
import { requestReview } from './index'

/*
 * Keeping in touch with users, politely:
 * - "What's new": once after each update, the highlights of the new version;
 * - a rating request in the Microsoft Store, only after the app was used a few times and
 *   something was made with it, at most every two weeks, and never again after an answer.
 */

interface Usage {
  first: number
  launches: number
  wins: number
  askedAt: number
  done: boolean
}

const DAY = 24 * 3600 * 1000
let key = 'easystudio.app.usage'

function read(): Usage {
  try {
    return { first: Date.now(), launches: 0, wins: 0, askedAt: 0, done: false, ...JSON.parse(localStorage.getItem(key) ?? '{}') }
  } catch {
    return { first: Date.now(), launches: 0, wins: 0, askedAt: 0, done: false }
  }
}

function write(u: Usage): void {
  try {
    localStorage.setItem(key, JSON.stringify(u))
  } catch {
    /* storage unavailable */
  }
}

/** Call once at start-up: counts the launch. */
export function initEngagement(app: string): void {
  key = `easystudio.${app}.usage`
  const u = read()
  write({ ...u, launches: u.launches + 1 })
}

/** Something was made (an export): counts towards asking for a rating. */
export function noteSuccess(): void {
  const u = read()
  write({ ...u, wins: u.wins + 1 })
}

/** Is it a good moment to ask for a rating? */
export function shouldAskReview(u = read(), now = Date.now()): boolean {
  return !u.done && now - u.first >= 2 * DAY && u.launches >= 3 && u.wins >= 2 && now - u.askedAt >= 14 * DAY
}

/**
 * The rating card (bottom corner). Mount once; it appears after an export when `shouldAskReview`
 * says so (the app calls `noteSuccess()` then `maybeAskReview()`).
 */
let showCard: (() => void) | null = null

export function maybeAskReview(): void {
  if (shouldAskReview()) showCard?.()
}

export function ReviewPrompt({ app }: { app: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    showCard = () => {
      write({ ...read(), askedAt: Date.now() })
      setOpen(true)
    }
    return () => {
      showCard = null
    }
  }, [])
  if (!open) return null
  const answer = (done: boolean) => {
    write({ ...read(), done })
    setOpen(false)
  }
  return (
    <div className="es-review" role="dialog">
      <button type="button" className="es-review-x" aria-label={t('license.reviewLater')} onClick={() => answer(false)}>
        <X size={14} />
      </button>
      <strong>
        <Star size={16} /> {t('license.reviewTitle', { app })}
      </strong>
      <span>{t('license.reviewText')}</span>
      <div className="es-review-actions">
        <Button size="sm" variant="ghost" onClick={() => answer(true)}>
          {t('license.reviewNever')}
        </Button>
        <Button size="sm" onClick={() => answer(false)}>
          {t('license.reviewLater')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            answer(true)
            void requestReview()
          }}
        >
          <Star size={14} /> {t('license.reviewYes')}
        </Button>
      </div>
    </div>
  )
}

/**
 * "What's new": shown once when the app starts in a new version (not on the very first start).
 * `notes` are the highlights, already translated.
 */
export function WhatsNewDialog({ app, version, notes }: { app: string; version: string | null; notes: string[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!version) return
    const k = `easystudio.${app.toLowerCase().replace(/\W+/g, '-')}.seenVersion`
    try {
      const seen = localStorage.getItem(k)
      localStorage.setItem(k, version)
      if (seen && seen !== version) setOpen(true)
    } catch {
      /* storage unavailable */
    }
  }, [app, version])
  if (!open || !notes.length) return null
  return (
    <Modal
      title={
        <span className="es-pro-title">
          <Sparkles size={18} /> {t('license.whatsNew', { app, version })}
        </span>
      }
      onClose={() => setOpen(false)}
      width={480}
      footer={
        <Button variant="primary" onClick={() => setOpen(false)}>
          {t('license.whatsNewOk')}
        </Button>
      }
    >
      <ul className="es-pro-list es-news">
        {notes.map((n) => (
          <li key={n}>
            <Sparkles size={15} /> {n}
          </li>
        ))}
      </ul>
    </Modal>
  )
}
