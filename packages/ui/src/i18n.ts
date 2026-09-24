import i18next, { type Resource } from 'i18next'
import { initReactI18next } from 'react-i18next'

const STORAGE_KEY = 'easystudio.lang'

/**
 * Initialise translations. English is the fallback; the user's choice is remembered per app,
 * and the first time the language of Windows decides (Romanian Windows → Romanian).
 */
export function initI18n(resources: Resource): typeof i18next {
  let lng = navigator.language?.toLowerCase().startsWith('ro') ? 'ro' : 'en'
  try {
    lng = localStorage.getItem(STORAGE_KEY) ?? lng
  } catch {
    /* storage unavailable */
  }
  if (!resources[lng]) lng = 'en'
  i18next.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false
  })
  i18next.on('languageChanged', (l) => {
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      /* ignore */
    }
  })
  return i18next
}
