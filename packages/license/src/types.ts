export interface LicenseStatus {
  /** The Pro add-on is owned. */
  pro: boolean
  /** Running as the Microsoft Store app (purchases possible from inside the app). */
  store: boolean
  /** The add-on's price in the user's currency, when the Store could be reached. */
  price: string | null
  /** False until the first answer arrived. */
  checked: boolean
}

export interface BuyResult {
  status: LicenseStatus
  result: 'bought' | 'cancelled' | 'opened-store' | 'error'
  error?: string
}

/** What the preload script exposes as `window.easyStudio.license`. */
export interface LicenseApi {
  status: (refresh?: boolean) => Promise<LicenseStatus>
  buy: () => Promise<BuyResult>
}
