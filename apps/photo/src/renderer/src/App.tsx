import { useEditor } from './state/store'
import { TopBar } from './components/TopBar'
import { Welcome } from './components/Welcome'
import { Editor } from './components/Editor'
import { Dialogs } from './components/dialogs/Dialogs'
import { QuestionDialog } from './components/dialogs/QuestionDialog'
import { Toasts } from './components/Toasts'
import { AssistantBar } from './components/AssistantBar'
import { Tour, useFirstRunTour } from './components/Tour'
import { useAppEffects } from './hooks'
import { AccountDialog, ProDialog, ReviewPrompt, WhatsNewDialog } from '@easystudio/license'
import { useEffect, useState } from 'react'
import { whatsNew } from './state/pro'
import { proBenefits } from './state/pro'
import { useTranslation } from 'react-i18next'

export function App() {
  const hasDoc = useEditor((s) => !!s.hist)
  const busy = useEditor((s) => s.busy)
  const progress = useEditor((s) => s.busyProgress)
  useAppEffects()
  useFirstRunTour()
  useTranslation()
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    window.easyStudio?.appInfo().then((i) => setVersion(i.version))
  }, [])
  return (
    <div className="app">
      <TopBar />
      {hasDoc ? <Editor /> : <Welcome />}
      {hasDoc && <AssistantBar />}
      <Dialogs />
      <QuestionDialog />
      <Toasts />
      <Tour />
      <ProDialog app="EasyStudio Photo" benefits={proBenefits()} />
      <AccountDialog app="EasyStudio Photo" />
      <WhatsNewDialog app="EasyStudio Photo" version={version} notes={whatsNew()} />
      <ReviewPrompt app="EasyStudio Photo" />
      {busy && <BusyOverlay text={busy} progress={progress} />}
    </div>
  )
}

function BusyOverlay({ text, progress }: { text: string; progress: number | null }) {
  return (
    <div className="busy">
      <div className="busy-box">
        <div className="busy-row">
          <div className="es-spinner" />
          {text}
        </div>
        {progress !== null && (
          <div className="busy-bar">
            <i style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}
