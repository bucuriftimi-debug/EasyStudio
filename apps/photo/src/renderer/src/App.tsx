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

export function App() {
  const hasDoc = useEditor((s) => !!s.hist)
  const busy = useEditor((s) => s.busy)
  const progress = useEditor((s) => s.busyProgress)
  useAppEffects()
  useFirstRunTour()
  return (
    <div className="app">
      <TopBar />
      {hasDoc ? <Editor /> : <Welcome />}
      {hasDoc && <AssistantBar />}
      <Dialogs />
      <QuestionDialog />
      <Toasts />
      <Tour />
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
