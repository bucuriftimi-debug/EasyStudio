import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@easystudio/draw/fonts'
import '@easystudio/ui/theme.css'
import './app.css'
import { initI18n } from '@easystudio/ui'
import en from './locales/en.json'
import ro from './locales/ro.json'
import { App } from './App'
import { setLang } from './platform'
import { setFontLoadedListener } from '@easystudio/draw'
import { recompose } from './state/editor'
import { initSession } from './state/session'

const i18n = initI18n({ en: { translation: en }, ro: { translation: ro } })
const syncLang = (l: string) => {
  document.documentElement.lang = l
  setLang(l)
}
syncLang(i18n.language)
i18n.on('languageChanged', syncLang)
// Titles are redrawn once their web font has loaded.
setFontLoadedListener(() => recompose())
initSession()

// Hook for automated checks (development, or the app's own `--selftest` mode).
if (import.meta.env.DEV || new URLSearchParams(location.search).has('selftest')) {
  Promise.all([import('mediabunny'), import('./engine/engine'), import('./state/store'), import('./state/library'), import('./platform'), import('./state/editor'), import('./state/project'), import('./state/projectFile'), import('./state/exportJob'), import('./state/session')]).then(
    ([mediabunny, engineMod, store, library, platform, editor, project, projectFile, exportJob, session]) => {
      ;(window as unknown as Record<string, unknown>).__ev = { mediabunny, engine: engineMod.engine, store, library, platform, editor, project, projectFile, exportJob, session }
    }
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
