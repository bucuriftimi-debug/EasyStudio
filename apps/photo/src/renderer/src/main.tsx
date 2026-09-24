import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './fonts'
import '@easystudio/ui/theme.css'
import './app.css'
import { initI18n } from '@easystudio/ui'
import en from './locales/en.json'
import ro from './locales/ro.json'
import { initLicense } from '@easystudio/license'
import { desktop, licenseApi } from './platform'
import { initFiles } from './state/files'
import { App } from './App'
import { setFontLoadedListener } from './state/gen'
import { bumpFontEpoch } from './state/store'

const i18n = initI18n({ en: { translation: en }, ro: { translation: ro } })
// The main process shows a few native dialogs (unsaved changes, file types) in the same language.
const syncLang = (l: string) => {
  document.documentElement.lang = l
  desktop()?.setLang(l)
}
syncLang(i18n.language)
i18n.on('languageChanged', syncLang)
initFiles()
initLicense(licenseApi())
// Web fonts load lazily: redraw text layers once their font is ready.
setFontLoadedListener(bumpFontEpoch)

// Hook for automated checks (development, or the app's own `--selftest` mode).
if (import.meta.env.DEV || new URLSearchParams(location.search).has('selftest')) {
  Promise.all([
    import('./state/actions'),
    import('./state/store'),
    import('./gpuHost'),
    import('./state/bitmaps'),
    import('./state/paint'),
    import('./state/project'),
    import('./state/ai'),
    import('./state/assistant'),
    import('./state/files'),
    import('./state/templates'),
    import('@easystudio/license')
  ]).then(([actions, store, gpu, bitmaps, paint, project, ai, assistant, files, templates, license]) => {
    ;(window as unknown as Record<string, unknown>).__es = { actions, store, gpu, bitmaps, paint, project, ai, assistant, files, templates, license }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
