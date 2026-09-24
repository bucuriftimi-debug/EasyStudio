import { app, ipcMain, shell, type BrowserWindow } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { BuyResult, LicenseStatus } from './types'

/*
 * Free / Pro, main-process side. Pro is an add-on ("durable", product id `pro`) of the app in the
 * Microsoft Store, so Microsoft handles accounts, payment, taxes and refunds, and a purchase
 * follows the user's Microsoft account to all their PCs. There is no server of ours.
 *
 * The Store API (Windows.Services.Store) is reached through build/StoreHelper.exe, a tiny
 * program started as a child process: inside the MSIX package it runs with the app's identity.
 * Outside the Store (installer, development) the app is always Free and "Get Pro" opens the
 * Store page instead.
 */

const OFFER_TOKEN = 'pro'
// A Pro user who is offline keeps Pro for this long after the last successful check.
const OFFLINE_GRACE_MS = 30 * 24 * 3600 * 1000

export interface LicenseOptions {
  dataDir: string
  /** The app's Store ID (Partner Center → Product identity), for the Store page link. */
  storeId: string
  window: () => BrowserWindow | null
}

interface Helper {
  ok: boolean
  pro?: boolean
  price?: string | null
  status?: string
  error?: string | null
}

function helperPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'StoreHelper.exe') : join(app.getAppPath(), '..', '..', 'build', 'StoreHelper.exe')
}

function runHelper(args: string[], timeout: number): Promise<Helper> {
  return new Promise((resolve) => {
    const exe = helperPath()
    if (!existsSync(exe)) return resolve({ ok: false, error: 'StoreHelper.exe missing' })
    execFile(exe, args, { timeout, windowsHide: true }, (err, stdout) => {
      const line = String(stdout).trim().split(/\r?\n/).pop() ?? ''
      try {
        return resolve(JSON.parse(line) as Helper)
      } catch {
        resolve({ ok: false, error: err ? String(err.message) : 'no answer' })
      }
    })
  })
}

/**
 * `--license pro|free` forces a state for automatic tests. It only works in development or
 * together with `--selftest`, which runs a test script and then closes the app.
 */
function testOverride(): 'pro' | 'free' | null {
  const i = process.argv.indexOf('--license')
  if (i < 0 || (app.isPackaged && !process.argv.includes('--selftest'))) return null
  const v = process.argv[i + 1]
  return v === 'pro' || v === 'free' ? v : null
}

export function registerLicense(opts: LicenseOptions): void {
  const cacheFile = join(opts.dataDir, 'license.json')
  const store = process.windowsStore === true
  const forced = testOverride()
  let status: LicenseStatus = { pro: forced === 'pro', store, price: null, checked: forced !== null }
  let pending: Promise<LicenseStatus> | null = null

  async function remember(pro: boolean): Promise<void> {
    try {
      await writeFile(cacheFile, JSON.stringify({ pro, at: Date.now() }))
    } catch {
      /* not important */
    }
  }

  async function lastKnownPro(): Promise<boolean> {
    try {
      const c = JSON.parse(await readFile(cacheFile, 'utf8')) as { pro?: boolean; at?: number }
      return c.pro === true && typeof c.at === 'number' && Date.now() - c.at < OFFLINE_GRACE_MS
    } catch {
      return false
    }
  }

  async function check(): Promise<LicenseStatus> {
    if (forced || !store) return (status = { ...status, checked: true })
    const r = await runHelper(['status', OFFER_TOKEN], 30_000)
    if (r.ok) {
      status = { pro: r.pro === true, store, price: r.price ?? null, checked: true }
      await remember(status.pro)
    } else {
      console.warn('[license] Store check failed:', r.error)
      status = { ...status, pro: status.pro || (await lastKnownPro()), checked: true }
    }
    return status
  }

  ipcMain.handle('license:status', (_e, refresh?: boolean) => {
    if (status.checked && !refresh) return status
    return (pending ??= check().finally(() => (pending = null)))
  })

  ipcMain.handle('license:buy', async (): Promise<BuyResult> => {
    if (forced) return { status, result: 'error', error: 'test mode' }
    if (!store) {
      await shell.openExternal(`ms-windows-store://pdp/?ProductId=${opts.storeId}`)
      return { status, result: 'opened-store' }
    }
    const win = opts.window()
    const hwnd = win ? win.getNativeWindowHandle().readBigUInt64LE(0).toString() : '0'
    const r = await runHelper(['buy', OFFER_TOKEN, hwnd], 30 * 60_000)
    if (!r.ok) return { status, result: 'error', error: r.error ?? undefined }
    status = { ...status, pro: r.pro === true, checked: true }
    await remember(status.pro)
    const result = status.pro ? 'bought' : r.status === 'NotPurchased' ? 'cancelled' : 'error'
    return { status, result, error: result === 'error' ? (r.error ?? r.status) : undefined }
  })
}
