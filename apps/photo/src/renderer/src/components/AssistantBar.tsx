import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lightbulb, Settings2, Sparkles, X } from 'lucide-react'
import { Button } from '@easystudio/ui'
import { seesPicture, type AiSettings } from '../../../shared/aiTools'
import { cloudAi, cleanError } from '../platform'
import * as AS from '../state/assistant'
import { useEditor } from '../state/store'

const PROVIDER_NAME: Record<string, string> = { ollama: 'Ollama', claude: 'Claude', openai: 'ChatGPT (OpenAI)', gemini: 'Gemini' }

/** Floating "tell the AI what you want" bar with a live preview of the proposed changes. */
export function AssistantBar() {
  const { t } = useTranslation()
  const open = useEditor((s) => s.assistantOpen)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<AS.AssistantResult | null>(null)
  const [actions, setActions] = useState<AS.Planned[]>([])
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const runRef = useRef<(mode: 'command' | 'suggest') => Promise<void>>(async () => {})

  useEffect(() => {
    if (!open) return
    setError(null)
    cloudAi()
      ?.settings()
      .then(setSettings)
      .catch(() => setSettings(null))
    setTimeout(() => input.current?.focus(), 30)
    // Opened from "Suggest improvements": start right away.
    if (open === 'suggest') {
      useEditor.setState({ assistantOpen: 'ask' })
      void runRef.current('suggest')
    }
  }, [open])

  if (!open) return null

  const close = () => {
    if (result) AS.discard()
    setResult(null)
    setActions([])
    useEditor.setState({ assistantOpen: null })
  }

  const run = async (mode: 'command' | 'suggest') => {
    if (mode === 'command' && !prompt.trim()) return
    if (result) AS.discard()
    setResult(null)
    setError(null)
    setBusy(mode === 'suggest' ? t('assist.looking') : t('assist.thinking'))
    try {
      const r = await AS.ask(mode, prompt.trim())
      setResult(r)
      setActions(r.actions)
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(null)
    }
  }
  runRef.current = run

  const toggle = (i: number) => {
    const next = actions.map((a, j) => (j === i ? { ...a, enabled: !a.enabled } : a))
    setActions(next)
    AS.preview(next)
  }

  const apply = async () => {
    const list = actions
    setResult(null)
    setActions([])
    useEditor.setState({ assistantOpen: null })
    await AS.apply(list, prompt.trim())
    setPrompt('')
  }

  const provider = settings?.provider && settings.provider !== 'off' ? settings.provider : null
  const model = provider ? settings!.models[provider] : ''

  return (
    <div className="assist" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <div className="assist-row">
        <Sparkles size={17} className="assist-icon" />
        <input
          ref={input}
          className="assist-input"
          placeholder={t('assist.placeholder')}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void run('command')
            if (e.key === 'Escape') close()
          }}
          disabled={!!busy}
        />
        <Button variant="primary" size="sm" disabled={!!busy || !prompt.trim() || !provider} onClick={() => void run('command')}>
          {t('assist.ask')}
        </Button>
        <Button variant="outline" size="sm" disabled={!!busy || !provider} tip={t('assist.suggestTip')} onClick={() => void run('suggest')}>
          <Lightbulb size={14} /> {t('assist.suggest')}
        </Button>
        <Button variant="ghost" size="sm" icon tip={t('assist.settings')} onClick={() => useEditor.setState({ dialog: 'aisettings' })}>
          <Settings2 size={15} />
        </Button>
        <Button variant="ghost" size="sm" icon tip={t('dialog.cancel')} onClick={close}>
          <X size={15} />
        </Button>
      </div>
      <div className="assist-meta">
        {!cloudAi() ? (
          t('assist.desktopOnly')
        ) : provider ? (
          <>
            {PROVIDER_NAME[provider]} · {model}
            {settings && seesPicture(settings) && ` · ${t('assist.seesPicture')}`}
          </>
        ) : (
          <button type="button" className="link" onClick={() => useEditor.setState({ dialog: 'aisettings' })}>
            {t('assist.noProvider')}
          </button>
        )}
      </div>
      {busy && (
        <div className="assist-busy">
          <div className="es-spinner" /> {busy}
        </div>
      )}
      {error && <div className="assist-error">{error}</div>}
      {result && (
        <div className="assist-result">
          {(result.reply.text || actions.length > 0) && (
            <p className={result.reply.text ? 'assist-text' : 'assist-empty'}>{result.reply.text || t('assist.proposal')}</p>
          )}
          {actions.length ? (
            <ul className="assist-actions">
              {actions.map((a, i) => (
                <li key={i}>
                  <label>
                    <input type="checkbox" checked={a.enabled} onChange={() => toggle(i)} />
                    <span>{a.label}</span>
                    {!a.instant && <em>{t('assist.afterApply')}</em>}
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="assist-empty">{t('assist.nothing')}</p>
          )}
          <div className="assist-foot">
            <span className="assist-cost">
              {result.reply.costUsd !== undefined && t('assist.cost', { usd: result.reply.costUsd < 0.01 ? '<0.01' : result.reply.costUsd.toFixed(2) })}
            </span>
            <div className="spacer" />
            <Button size="sm" onClick={close}>
              {t('dialog.cancel')}
            </Button>
            <Button size="sm" variant="primary" disabled={!actions.some((a) => a.enabled)} onClick={() => void apply()}>
              {t('assist.apply')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
