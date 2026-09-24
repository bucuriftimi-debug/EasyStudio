import { ipcMain } from 'electron'

/**
 * The texts produced by the main process itself (native dialogs, AI and download errors), in
 * the page's language. `{name}` placeholders are filled by `tr`.
 */
const TEXTS = {
  en: {
    images: 'Images (incl. Photoshop .psd)',
    project: 'EasyStudio Photo project',
    imagesAndProjects: 'Images and projects',
    unsavedTitle: 'Unsaved changes',
    unsavedMessage: 'You have unsaved changes.',
    unsavedDetail: 'If you close now, your changes will be lost.',
    closeAnyway: 'Close without saving',
    cancel: 'Cancel',
    noKey: 'No API key saved for {who}. Add it in AI settings.',
    claudeRefused: 'Claude declined this request.',
    badKey: '{who}: the API key is not valid.',
    badKeyDetail: '{who}: the API key is not valid or has no access ({msg}).',
    noModelAccess: '{who}: this key is not allowed to use this model.',
    tooMany: '{who}: too many requests right now — wait a moment and try again.',
    noCredit: '{who}: rate limit reached or no credit left ({msg}).',
    offline: '{who}: no internet connection.',
    overloaded: '{who} is overloaded right now — try again in a minute.',
    apiError: '{who} error {status}: {msg}',
    ollamaOff: 'Ollama is not running. Start the Ollama app (it is free and local) and try again.',
    chooseProvider: 'Choose an AI provider in AI settings first.',
    noImage: '{who} returned no picture (try a different description).',
    fillNeeds: 'Generative fill needs OpenAI or Gemini (choose it in AI settings).',
    noSecureStorage: 'Secure storage is not available on this computer.',
    openWithDialog: 'This file can only be opened with File → Open.',
    modelHost: 'AI models can only be downloaded from huggingface.co.',
    downloadFailed: 'Download failed (HTTP {status}).',
    downloadIncomplete: 'The download was interrupted. Try again.'
  },
  ro: {
    images: 'Imagini (inclusiv Photoshop .psd)',
    project: 'Proiect EasyStudio Photo',
    imagesAndProjects: 'Imagini și proiecte',
    unsavedTitle: 'Modificări nesalvate',
    unsavedMessage: 'Ai modificări nesalvate.',
    unsavedDetail: 'Dacă închizi acum, modificările se pierd.',
    closeAnyway: 'Închide fără să salvez',
    cancel: 'Anulează',
    noKey: 'Nu e salvată nicio cheie API pentru {who}. Adaug-o în Setări AI.',
    claudeRefused: 'Claude a refuzat această cerere.',
    badKey: '{who}: cheia API nu e validă.',
    badKeyDetail: '{who}: cheia API nu e validă sau nu are acces ({msg}).',
    noModelAccess: '{who}: această cheie nu are voie să folosească modelul ales.',
    tooMany: '{who}: prea multe cereri acum — așteaptă puțin și încearcă din nou.',
    noCredit: '{who}: limită atinsă sau nu mai ai credit ({msg}).',
    offline: '{who}: nu există conexiune la internet.',
    overloaded: '{who} e supraîncărcat acum — încearcă din nou peste un minut.',
    apiError: 'Eroare {who} {status}: {msg}',
    ollamaOff: 'Ollama nu rulează. Pornește aplicația Ollama (e gratuită și locală) și încearcă din nou.',
    chooseProvider: 'Alege mai întâi un furnizor AI în Setări AI.',
    noImage: '{who} nu a trimis nicio poză (încearcă altă descriere).',
    fillNeeds: 'Generarea în selecție are nevoie de OpenAI sau Gemini (alege-l în Setări AI).',
    noSecureStorage: 'Stocarea securizată nu e disponibilă pe acest calculator.',
    openWithDialog: 'Acest fișier se poate deschide doar din Fișier → Deschide.',
    modelHost: 'Modelele AI se pot descărca doar de pe huggingface.co.',
    downloadFailed: 'Descărcarea a eșuat (HTTP {status}).',
    downloadIncomplete: 'Descărcarea s-a întrerupt. Încearcă din nou.'
  }
}

type Key = keyof (typeof TEXTS)['en']
let lang: keyof typeof TEXTS = 'en'

export function tr(k: Key, vars: Record<string, string | number> = {}): string {
  return TEXTS[lang][k].replace(/\{(\w+)\}/g, (_m, v: string) => String(vars[v] ?? ''))
}

export function registerLang(): void {
  ipcMain.on('app:lang', (_e, l: string) => {
    lang = l === 'ro' ? 'ro' : 'en'
  })
}
