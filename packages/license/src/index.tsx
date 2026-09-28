import { Button, Modal } from '@easystudio/ui'
import i18next from 'i18next'
import { Check, Crown, ExternalLink, RefreshCw, Sparkles, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { create } from 'zustand'
import './license.css'
import type { BuyResult, LicenseApi, LicenseStatus } from './types'

export type { BuyResult, LicenseApi, LicenseStatus } from './types'

/*
 * Free / Pro, page side. `requirePro()` guards a Pro feature: it returns true for Pro users and
 * otherwise opens the "Get Pro" dialog. `canUseFree()` / `spendFreeUse()` give Free users a few
 * tries per day of a limited feature.
 */

interface LicenseState {
  status: LicenseStatus
  /**
   * Open dialog: the feature that asked for Pro ('' = opened from the Pro button); `limit`
   * when the feature is free but today's free tries are used up.
   */
  dialog: { feature: string; limit: boolean } | null
  /** The "My account" window is open. */
  account: boolean
}

export const useLicense = create<LicenseState>(() => ({
  status: { pro: false, store: false, price: null, checked: false },
  dialog: null,
  account: false
}))

export const PRIVACY_URL = 'https://github.com/bucuriftimi-debug/EasyStudio/blob/main/PRIVACY.md'
export const TERMS_URL = 'https://github.com/bucuriftimi-debug/EasyStudio/blob/main/TERMS.md'
/** Problems, questions and reports of inappropriate AI results (Store policy 11.16). */
export const REPORT_URL = 'https://github.com/bucuriftimi-debug/EasyStudio/issues/new'
// Microsoft account: orders, receipts and refund requests.
const ORDERS_URL = 'https://account.microsoft.com/billing/orders'

let api: LicenseApi | undefined

const STRINGS = {
  en: {
    license: {
      getPro: 'Get Pro',
      proActive: 'Pro',
      proActiveTip: 'EasyStudio Pro is active. Thank you!',
      title: '{{app}} Pro',
      needs: '“{{feature}}” is part of Pro.',
      intro: 'Unlock everything, on every PC where you use your Microsoft account.',
      buy: 'Get Pro',
      buyPrice: 'Get Pro – {{price}}',
      openStore: 'Open Microsoft Store',
      storeOnly: 'Pro can be bought in the Microsoft Store version of the app.',
      safe: 'Payment, receipts and refunds are handled by Microsoft Store.',
      notNow: 'Not now',
      close: 'Close',
      thanks: 'Thank you! Pro is unlocked.',
      failed: 'The purchase did not go through: {{msg}}',
      freeLeft_one: '{{count}} free try left today',
      freeLeft_other: '{{count}} free tries left today',
      freeUsedUp: 'You used today’s free tries of the AI tools. They come back tomorrow, or get Pro for unlimited use.',
      badge: 'PRO',
      account: 'My account',
      plan: 'Plan',
      planFree: 'Free',
      planPro: 'Pro',
      accountHow: 'EasyStudio has no separate sign-in: it uses the Microsoft account you are signed in with in the Microsoft Store. Pro turns on by itself on every PC where you use that account.',
      accountNotStore: 'This copy was not installed from the Microsoft Store, so it always works as the free version. Install the app from the Store to use Pro.',
      recheck: 'Check again',
      rechecking: 'Checking…',
      foundPro: 'Pro is active on your Microsoft account.',
      noPro: 'Pro was not found on the Microsoft account used in the Store.',
      orders: 'Orders and refunds',
      privacy: 'Privacy policy',
      terms: 'Terms of use',
      report: 'Report a problem',
      reportAi: 'Report a problem with AI results…',
      trialTry_one: 'Try free for {{count}} day',
      trialTry_other: 'Try free for {{count}} days',
      trialStarted_one: 'Pro is on for {{count}} day. Enjoy!',
      trialStarted_other: 'Pro is on for {{count}} days. Enjoy!',
      trialLeft_one: 'Your Pro trial ends tomorrow. Get Pro to keep everything unlocked.',
      trialLeft_other: 'Your Pro trial: {{count}} days left. Get Pro to keep everything unlocked.',
      trialChip_one: 'Pro trial · {{count}} day',
      trialChip_other: 'Pro trial · {{count}} days',
      planTrial_one: 'Pro (trial, {{count}} day left)',
      planTrial_other: 'Pro (trial, {{count}} days left)',
      reviewTitle: 'Enjoying {{app}}?',
      reviewText: 'A rating in the Microsoft Store helps other people find the app. It takes ten seconds.',
      reviewYes: 'Rate it',
      reviewLater: 'Later',
      reviewNever: 'No, thanks',
      whatsNew: 'What’s new in {{app}} {{version}}',
      whatsNewOk: 'Got it'
    }
  },
  ro: {
    license: {
      getPro: 'Ia Pro',
      proActive: 'Pro',
      proActiveTip: 'EasyStudio Pro e activ. Mulțumim!',
      title: '{{app}} Pro',
      needs: '„{{feature}}” face parte din Pro.',
      intro: 'Deblochezi tot, pe orice PC unde folosești contul tău Microsoft.',
      buy: 'Ia Pro',
      buyPrice: 'Ia Pro – {{price}}',
      openStore: 'Deschide Microsoft Store',
      storeOnly: 'Pro se cumpără din versiunea aplicației din Microsoft Store.',
      safe: 'Plata, factura și eventualele rambursări sunt gestionate de Microsoft Store.',
      notNow: 'Nu acum',
      close: 'Închide',
      thanks: 'Mulțumim! Pro e deblocat.',
      failed: 'Cumpărarea nu s-a finalizat: {{msg}}',
      freeLeft_one: 'Îți mai rămâne {{count}} încercare gratuită azi',
      freeLeft_few: 'Îți mai rămân {{count}} încercări gratuite azi',
      freeLeft_other: 'Îți mai rămân {{count}} de încercări gratuite azi',
      freeUsedUp: 'Ai folosit încercările gratuite de azi pentru uneltele AI. Revin mâine, sau ia Pro pentru folosire nelimitată.',
      badge: 'PRO',
      account: 'Contul meu',
      plan: 'Plan',
      planFree: 'Gratuit',
      planPro: 'Pro',
      accountHow: 'EasyStudio nu are o autentificare separată: folosește contul Microsoft cu care ești conectat în Microsoft Store. Pro se activează singur pe orice PC unde folosești acel cont.',
      accountNotStore: 'Această copie nu e instalată din Microsoft Store, așa că merge mereu ca versiune gratuită. Instalează aplicația din Store ca să folosești Pro.',
      recheck: 'Verifică din nou',
      rechecking: 'Se verifică…',
      foundPro: 'Pro e activ pe contul tău Microsoft.',
      noPro: 'Nu am găsit Pro pe contul Microsoft folosit în Store.',
      orders: 'Comenzi și rambursări',
      privacy: 'Politica de confidențialitate',
      terms: 'Termeni de utilizare',
      report: 'Raportează o problemă',
      reportAi: 'Raportează o problemă cu rezultatele AI…',
      trialTry_one: 'Încearcă gratuit {{count}} zi',
      trialTry_few: 'Încearcă gratuit {{count}} zile',
      trialTry_other: 'Încearcă gratuit {{count}} de zile',
      trialStarted_one: 'Pro e activ {{count}} zi. Spor!',
      trialStarted_few: 'Pro e activ {{count}} zile. Spor!',
      trialStarted_other: 'Pro e activ {{count}} de zile. Spor!',
      trialLeft_one: 'Proba Pro se termină mâine. Ia Pro ca să rămână totul deblocat.',
      trialLeft_few: 'Proba Pro: mai ai {{count}} zile. Ia Pro ca să rămână totul deblocat.',
      trialLeft_other: 'Proba Pro: mai ai {{count}} de zile. Ia Pro ca să rămână totul deblocat.',
      trialChip_one: 'Probă Pro · {{count}} zi',
      trialChip_few: 'Probă Pro · {{count}} zile',
      trialChip_other: 'Probă Pro · {{count}} de zile',
      planTrial_one: 'Pro (probă, {{count}} zi rămasă)',
      planTrial_few: 'Pro (probă, {{count}} zile rămase)',
      planTrial_other: 'Pro (probă, {{count}} de zile rămase)',
      reviewTitle: 'Îți place {{app}}?',
      reviewText: 'O notă în Microsoft Store îi ajută pe alții să găsească aplicația. Durează zece secunde.',
      reviewYes: 'Dă o notă',
      reviewLater: 'Mai târziu',
      reviewNever: 'Nu, mulțumesc',
      whatsNew: 'Ce e nou în {{app}} {{version}}',
      whatsNewOk: 'Am înțeles'
    }
  }
}

/* ------------------------------ 7-day trial ------------------------------ */

export const TRIAL_DAYS = 7
const DAY = 24 * 3600 * 1000
let appKey = 'app'
const trialKey = () => `easystudio.${appKey}.trial`

function trialStart(): number | null {
  try {
    const v = Number(localStorage.getItem(trialKey()))
    return v > 0 ? v : null
  } catch {
    return null
  }
}

/** The status with the trial applied: Pro while the 7 days last (unless Pro was bought). */
function withTrial(s: LicenseStatus): LicenseStatus {
  const start = trialStart()
  const trialEnds = start ? start + TRIAL_DAYS * DAY : null
  const trial = !s.pro && !!trialEnds && Date.now() < trialEnds
  return { ...s, pro: s.pro || trial, trial, trialEnds }
}

/** Can the free trial still be started (once per app and computer)? */
export const trialAvailable = (): boolean => !useLicense.getState().status.pro && trialStart() === null

/** Start the 7-day trial of Pro. */
export function startTrial(): boolean {
  if (!trialAvailable()) return false
  try {
    localStorage.setItem(trialKey(), String(Date.now()))
  } catch {
    return false
  }
  useLicense.setState((s) => ({ status: withTrial(s.status) }))
  return true
}

/** Whole days of trial left (0 when none). */
export const trialDaysLeft = (s: LicenseStatus): number => (s.trial && s.trialEnds ? Math.max(1, Math.ceil((s.trialEnds - Date.now()) / DAY)) : 0)

/** Call once at start-up, after `initI18n`. `app` names the app ("photo", "video"). */
export function initLicense(licenseApi: LicenseApi | undefined, app = 'app'): void {
  api = licenseApi
  appKey = app
  for (const [lng, bundle] of Object.entries(STRINGS)) i18next.addResourceBundle(lng, 'translation', bundle, true, false)
  useLicense.setState((s) => ({ status: withTrial(s.status) }))
  const refresh = (force: boolean) =>
    api
      ?.status(force)
      .then((status) => useLicense.setState({ status: withTrial(status) }))
      .catch((e) => console.warn('[license]', e))
  refresh(false)
  // Someone may buy Pro on the Store page while the app is open: look again when it comes back.
  // The trial also ends while the app is open.
  let last = Date.now()
  window.addEventListener('focus', () => {
    const st = useLicense.getState().status
    if (st.trial) useLicense.setState({ status: withTrial({ ...st, pro: false }) })
    if (Date.now() - last < 60_000 || (st.pro && !st.trial)) return
    last = Date.now()
    refresh(true)
  })
}

/** Ask for a rating in the Microsoft Store (see engage.tsx). */
export const requestReview = (): Promise<string> => api?.review() ?? Promise.resolve('no-app')

export const isPro = (): boolean => useLicense.getState().status.pro

/** True for Pro users; otherwise shows the "Get Pro" dialog for `feature` and returns false. */
export function requirePro(feature: string): boolean {
  if (isPro()) return true
  useLicense.setState({ dialog: { feature, limit: false } })
  return false
}

export const openProDialog = (): void => useLicense.setState({ dialog: { feature: '', limit: false }, account: false })
export const openAccount = (): void => useLicense.setState({ account: true })

/* ------------------------------ free tries per day ------------------------------ */

const today = () => new Date().toISOString().slice(0, 10)

function usesToday(kind: string): number {
  try {
    const v = JSON.parse(localStorage.getItem(`easystudio.free.${kind}`) ?? 'null') as { day: string; n: number } | null
    return v?.day === today() ? v.n : 0
  } catch {
    return 0
  }
}

/** How many free tries of `kind` are left today (Infinity for Pro). */
export function freeUsesLeft(kind: string, perDay: number): number {
  return isPro() ? Infinity : Math.max(0, perDay - usesToday(kind))
}

/** Before a limited feature: true if it may run now; otherwise explains and offers Pro. */
export function canUseFree(kind: string, perDay: number, feature: string): boolean {
  if (freeUsesLeft(kind, perDay) > 0) return true
  useLicense.setState({ dialog: { feature, limit: true } })
  return false
}

/** After a limited feature succeeded: count it (no-op for Pro). Returns the tries left. */
export function spendFreeUse(kind: string, perDay: number): number {
  if (isPro()) return Infinity
  const n = usesToday(kind) + 1
  try {
    localStorage.setItem(`easystudio.free.${kind}`, JSON.stringify({ day: today(), n }))
  } catch {
    /* storage unavailable */
  }
  return Math.max(0, perDay - n)
}

/* ------------------------------ UI ------------------------------ */

/** Small "PRO" mark next to a locked feature (hidden for Pro users). */
export function ProBadge({ className }: { className?: string }) {
  const pro = useLicense((s) => s.status.pro)
  const { t } = useTranslation()
  if (pro) return null
  return <span className={'es-pro-badge' + (className ? ' ' + className : '')}>{t('license.badge')}</span>
}

/** Top-bar button: "Get Pro" for Free users, a quiet "Pro" mark for Pro users. */
export function ProButton() {
  const pro = useLicense((s) => s.status.pro)
  const status = useLicense((s) => s.status)
  const { t } = useTranslation()
  if (status.trial)
    return (
      <Button className="es-pro-btn" size="sm" onClick={openProDialog}>
        <Crown size={14} /> {t('license.trialChip', { count: trialDaysLeft(status) })}
      </Button>
    )
  if (pro)
    return (
      <button type="button" className="es-pro-active" data-tip={t('license.proActiveTip')} data-tip-pos="bottom" onClick={openAccount}>
        <Crown size={14} /> {t('license.proActive')}
      </button>
    )
  return (
    <Button className="es-pro-btn" size="sm" onClick={openProDialog}>
      <Crown size={14} /> {t('license.getPro')}
    </Button>
  )
}

export interface ProDialogProps {
  /** Product name, e.g. "EasyStudio Photo". */
  app: string
  /** What Pro adds, already translated (one line each). */
  benefits: string[]
}

/** Mount once in the app; it opens itself through `requirePro()` / `openProDialog()`. */
export function ProDialog({ app, benefits }: ProDialogProps) {
  const { t } = useTranslation()
  const dialog = useLicense((s) => s.dialog)
  const status = useLicense((s) => s.status)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  useEffect(() => setMsg(null), [dialog])
  if (dialog === null) return null
  const close = () => !busy && useLicense.setState({ dialog: null })

  async function buy() {
    if (!api) return
    setBusy(true)
    setMsg(null)
    try {
      const r: BuyResult = await api.buy()
      useLicense.setState({ status: withTrial(r.status) })
      if (r.result === 'bought') setMsg({ kind: 'ok', text: t('license.thanks') })
      else if (r.result === 'error') setMsg({ kind: 'error', text: t('license.failed', { msg: r.error ?? '?' }) })
    } catch (e) {
      setMsg({ kind: 'error', text: t('license.failed', { msg: (e as Error).message }) })
    } finally {
      setBusy(false)
    }
  }

  // Bought (a trial still shows the offer).
  const done = status.pro && !status.trial
  const tryFree = () => {
    if (startTrial()) setMsg({ kind: 'ok', text: t('license.trialStarted', { count: TRIAL_DAYS }) })
  }
  return (
    <Modal
      title={
        <span className="es-pro-title">
          <Crown size={18} /> {t('license.title', { app })}
        </span>
      }
      onClose={close}
      width={460}
      footer={
        done ? (
          <Button variant="primary" onClick={close}>
            {t('license.close')}
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close} disabled={busy}>
              {t('license.notNow')}
            </Button>
            {trialAvailable() && (
              <Button onClick={tryFree} disabled={busy}>
                {t('license.trialTry', { count: TRIAL_DAYS })}
              </Button>
            )}
            <Button variant="primary" className="es-pro-buy" onClick={buy} disabled={busy || !api}>
              <Sparkles size={15} />
              {status.store ? (status.price ? t('license.buyPrice', { price: status.price }) : t('license.buy')) : t('license.openStore')}
            </Button>
          </>
        )
      }
    >
      <div className="es-pro">
        {dialog.feature && !done && (
          <p className="es-pro-needs">{dialog.limit ? t('license.freeUsedUp') : t('license.needs', { feature: dialog.feature })}</p>
        )}
        {!done && <p className="es-pro-intro">{status.trial ? t('license.trialLeft', { count: trialDaysLeft(status) }) : t('license.intro')}</p>}
        <ul className="es-pro-list">
          {benefits.map((b) => (
            <li key={b}>
              <Check size={15} /> {b}
            </li>
          ))}
        </ul>
        {msg && <p className={'es-pro-msg ' + msg.kind}>{msg.text}</p>}
        {!done && <p className="es-pro-note">{status.store ? t('license.safe') : t('license.storeOnly')}</p>}
        <LegalLinks />
      </div>
    </Modal>
  )
}

const openUrl = (url: string) => window.open(url, '_blank')

/** Privacy policy · Terms · Report a problem (opened in the web browser). */
export function LegalLinks() {
  const { t } = useTranslation()
  return (
    <p className="es-legal">
      <a href={PRIVACY_URL} target="_blank" rel="noreferrer">
        {t('license.privacy')}
      </a>
      <span>·</span>
      <a href={TERMS_URL} target="_blank" rel="noreferrer">
        {t('license.terms')}
      </a>
      <span>·</span>
      <a href={REPORT_URL} target="_blank" rel="noreferrer">
        {t('license.report')}
      </a>
    </p>
  )
}

/** Top-bar button that opens "My account". */
export function AccountButton() {
  const { t } = useTranslation()
  return (
    <Button icon variant="ghost" className="es-account-btn" tip={t('license.account')} tipPos="bottom" onClick={openAccount}>
      <UserRound size={17} />
    </Button>
  )
}

/**
 * "My account": the plan (Free / Pro), how Pro follows the Microsoft account, a manual re-check
 * (e.g. after buying on another PC), orders and refunds, and the legal pages.
 */
export function AccountDialog({ app, version }: { app: string; version?: string }) {
  const { t } = useTranslation()
  const isOpen = useLicense((s) => s.account)
  const status = useLicense((s) => s.status)
  const [checking, setChecking] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => setMsg(null), [isOpen])
  if (!isOpen) return null
  const close = () => useLicense.setState({ account: false })

  async function recheck() {
    if (!api) return
    setChecking(true)
    try {
      const st = await api.status(true)
      useLicense.setState({ status: withTrial(st) })
      setMsg(st.pro ? t('license.foundPro') : t('license.noPro'))
    } finally {
      setChecking(false)
    }
  }

  return (
    <Modal
      title={
        <span className="es-pro-title">
          <UserRound size={18} /> {t('license.account')}
        </span>
      }
      onClose={close}
      width={460}
      footer={
        <>
          {!status.pro && (
            <Button className="es-pro-btn" onClick={openProDialog}>
              <Crown size={14} /> {t('license.getPro')}
            </Button>
          )}
          <div style={{ flex: 1 }} />
          <Button variant="primary" onClick={close}>
            {t('license.close')}
          </Button>
        </>
      }
    >
      <div className="es-pro es-account">
        <div className="es-account-plan">
          <span>{app}</span>
          <strong className={status.pro ? 'pro' : ''}>
            {status.pro && <Crown size={14} />} {t('license.plan')}: {status.trial ? t('license.planTrial', { count: trialDaysLeft(status) }) : status.pro ? t('license.planPro') : t('license.planFree')}
          </strong>
        </div>
        <p className="es-pro-intro">{status.store || status.pro ? t('license.accountHow') : t('license.accountNotStore')}</p>
        <div className="es-account-actions">
          <Button size="sm" onClick={recheck} disabled={checking || !api}>
            <RefreshCw size={14} className={checking ? 'es-spin' : undefined} /> {checking ? t('license.rechecking') : t('license.recheck')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => openUrl(ORDERS_URL)}>
            <ExternalLink size={14} /> {t('license.orders')}
          </Button>
        </div>
        {msg && <p className={'es-pro-msg ' + (status.pro ? 'ok' : 'error')}>{msg}</p>}
        <LegalLinks />
        {version && (
          <p className="es-pro-note">
            {app} {version}
          </p>
        )}
      </div>
    </Modal>
  )
}

export { initEngagement, maybeAskReview, noteSuccess, ReviewPrompt, shouldAskReview, WhatsNewDialog } from './engage'
