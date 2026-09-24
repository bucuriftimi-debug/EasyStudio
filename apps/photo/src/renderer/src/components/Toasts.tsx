import { useEditor } from '../state/store'

export function Toasts() {
  const toasts = useEditor((s) => s.toasts)
  return (
    <div className="es-toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`es-toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
