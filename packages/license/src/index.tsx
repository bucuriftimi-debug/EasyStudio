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
      terms: 'Terms of use'
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
      terms: 'Termeni de utilizare'
    }
  }
}

/** Call once at start-up, after `initI18n`. */
export function initLicense(licenseApi: LicenseApi | undefined): void {
  api = licenseApi
  for (const [lng, bundle] of Object.entries(STRINGS)) i18next.addResourceBundle(lng, 'translation', bundle, true, false)
  const refresh = (force: boolean) =>
    api
      ?.status(force)
      .then((status) => useLicense.setState({ status }))
      .catch((e) => console.warn('[license]', e))
  refresh(false)
  // Someone may buy Pro on the Store page while the app is open: look again when it comes back.
  let last = Date.now()
  window.addEventListener('focus', () => {
    if (Date.now() - last < 60_000 || useLicense.getState().status.pro) return
    last = Date.now()
    refresh(true)
  })
}

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
  const { t } = useTranslation()
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
      useLicense.setState({ status: r.status })
      if (r.result === 'bought') setMsg({ kind: 'ok', text: t('license.thanks') })
      else if (r.result === 'error') setMsg({ kind: 'error', text: t('license.failed', { msg: r.error ?? '?' }) })
    } catch (e) {
      setMsg({ kind: 'error', text: t('license.failed', { msg: (e as Error).message }) })
    } finally {
      setBusy(false)
    }
  }

  const done = status.pro
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
        {!done && <p className="es-pro-intro">{t('license.intro')}</p>}
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

function LegalLinks() {
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
      useLicense.setState({ status: st })
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
            {status.pro && <Crown size={14} />} {t('license.plan')}: {status.pro ? t('license.planPro') : t('license.planFree')}
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
