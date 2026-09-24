import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, ExternalLink, KeyRound, RefreshCw } from 'lucide-react'
import { Button, Modal, Switch } from '@easystudio/ui'
import type { AiSettings, ProviderId } from '../../../../shared/aiTools'
import { cloudAi, cleanError } from '../../platform'

type KeyP = 'claude' | 'openai' | 'gemini'

const PROVIDERS: { id: ProviderId; name: string; note: string }[] = [
  { id: 'off', name: 'aiset.off', note: 'aiset.offNote' },
  { id: 'ollama', name: 'Ollama', note: 'aiset.ollamaNote' },
  { id: 'claude', name: 'Claude', note: 'aiset.claudeNote' },
  { id: 'openai', name: 'ChatGPT (OpenAI)', note: 'aiset.openaiNote' },
  { id: 'gemini', name: 'Gemini', note: 'aiset.geminiNote' }
]

const KEY_LINKS: Record<KeyP, string> = {
  claude: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/apikey'
}

/** Claude models with their price per million tokens (input / output). */
const CLAUDE_MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5 — best · $5 / $25' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 — balanced · $2 / $10' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — fastest · $1 / $5' }
]
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-pro-preview']

export function AiSettingsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const bridge = cloudAi()
  const [s, setS] = useState<AiSettings | null>(null)
  const [key, setKey] = useState('')
  const [ollama, setOllama] = useState<string[]>([])
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    bridge?.settings().then(setS)
    bridge?.ollamaModels().then(setOllama)
  }, [bridge])

  if (!bridge)
    return (
      <Modal title={t('aiset.title')} onClose={onClose} footer={<Button onClick={onClose}>{t('dialog.ok')}</Button>}>
        <p className="dialog-hint">{t('assist.desktopOnly')}</p>
      </Modal>
    )
  if (!s) return null

  const update = async (patch: Partial<Omit<AiSettings, 'keys'>>) => {
    setTest(null)
    setS(await bridge.setSettings(patch))
  }
  const provider = s.provider
  const keyP = (['claude', 'openai', 'gemini'] as ProviderId[]).includes(provider) ? (provider as KeyP) : null

  const saveKey = async () => {
    if (!keyP || !key.trim()) return
    try {
      setS(await bridge.setKey(keyP, key.trim()))
      setKey('')
    } catch (e) {
      setTest({ ok: false, text: cleanError(e) })
    }
  }

  const runTest = async () => {
    setBusy(true)
    setTest(null)
    try {
      const r = await bridge.test()
      setTest({ ok: true, text: t('aiset.works', { model: r.model }) })
    } catch (e) {
      setTest({ ok: false, text: cleanError(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={t('aiset.title')}
      onClose={onClose}
      width={640}
      footer={
        <>
          {provider !== 'off' && (
            <Button onClick={() => void runTest()} disabled={busy || (!!keyP && !s.keys[keyP])}>
              {busy ? <div className="es-spinner" /> : <CheckCircle2 size={15} />} {t('aiset.test')}
            </Button>
          )}
          <div className="spacer" />
          <Button variant="primary" onClick={onClose}>
            {t('dialog.ok')}
          </Button>
        </>
      }
    >
      <p className="dialog-hint">{t('aiset.intro')}</p>
      <div className="provider-grid">
        {PROVIDERS.map((p) => (
          <button key={p.id} type="button" className={`provider${provider === p.id ? ' on' : ''}`} onClick={() => void update({ provider: p.id })}>
            <strong>{p.id === 'off' ? t(p.name) : p.name}</strong>
            <span>{t(p.note)}</span>
          </button>
        ))}
      </div>

      {keyP && (
        <div className="aiset-block">
          <div className="aiset-row">
            <KeyRound size={15} />
            {s.keys[keyP] ? (
              <span className="aiset-saved">{t('aiset.keySaved', { last: s.keys[keyP] })}</span>
            ) : (
              <span className="aiset-missing">{t('aiset.noKey')}</span>
            )}
            <div className="spacer" />
            <a className="link" href={KEY_LINKS[keyP]} target="_blank" rel="noreferrer">
              {t('aiset.getKey')} <ExternalLink size={12} />
            </a>
          </div>
          <div className="aiset-row">
            <input
              className="es-input"
              type="password"
              placeholder={t('aiset.pasteKey')}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void saveKey()}
              style={{ flex: 1 }}
            />
            <Button variant="primary" disabled={!key.trim()} onClick={() => void saveKey()}>
              {t('aiset.saveKey')}
            </Button>
            {s.keys[keyP] && (
              <Button variant="danger" onClick={async () => setS(await bridge.setKey(keyP, null))}>
                {t('aiset.removeKey')}
              </Button>
            )}
          </div>
          <p className="field-hint">{t('aiset.keySafe')}</p>
          {keyP === 'claude' && <p className="field-hint warn">{t('aiset.claudeCredits')}</p>}
        </div>
      )}

      {provider !== 'off' && (
        <div className="aiset-block">
          <label className="es-field">
            <span>{t('aiset.model')}</span>
            {provider === 'claude' ? (
              <select className="es-select" value={s.models.claude} onChange={(e) => void update({ models: { ...s.models, claude: e.target.value } })}>
                {CLAUDE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            ) : provider === 'ollama' ? (
              <div className="aiset-row">
                <select className="es-select" style={{ flex: 1 }} value={s.models.ollama} onChange={(e) => void update({ models: { ...s.models, ollama: e.target.value } })}>
                  {[...new Set([s.models.ollama, ...ollama])].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <Button icon variant="ghost" tip={t('aiset.refresh')} onClick={() => bridge.ollamaModels().then(setOllama)}>
                  <RefreshCw size={14} />
                </Button>
              </div>
            ) : (
              <>
                <input
                  className="es-input"
                  list={provider === 'gemini' ? 'gemini-models' : undefined}
                  defaultValue={s.models[provider]}
                  onBlur={(e) => e.target.value.trim() && void update({ models: { ...s.models, [provider]: e.target.value.trim() } })}
                />
                <datalist id="gemini-models">
                  {GEMINI_MODELS.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </>
            )}
          </label>
          {provider === 'claude' && <p className="field-hint">{t('aiset.claudePrice')}</p>}
          {provider === 'ollama' && <p className="field-hint">{ollama.length ? t('aiset.ollamaFound', { n: ollama.length }) : t('aiset.ollamaMissing')}</p>}
          {(provider === 'openai' || provider === 'gemini') && (
            <label className="es-field" style={{ marginTop: 10 }}>
              <span>{t('aiset.imageModel')}</span>
              <input
                className="es-input"
                defaultValue={s.imageModels[provider]}
                onBlur={(e) => e.target.value.trim() && void update({ imageModels: { ...s.imageModels, [provider]: e.target.value.trim() } })}
              />
            </label>
          )}
          <div style={{ marginTop: 12 }}>
            <Switch checked={s.sendImage} onChange={(v) => void update({ sendImage: v })} label={t('aiset.sendImage')} />
          </div>
          <p className="field-hint">{provider === 'ollama' ? t('aiset.privacyLocal') : t('aiset.privacyCloud')}</p>
        </div>
      )}

      {test && <div className={test.ok ? 'aiset-ok' : 'assist-error'}>{test.text}</div>}
    </Modal>
  )
}
