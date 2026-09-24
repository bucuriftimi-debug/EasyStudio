import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal } from '@easystudio/ui'
import { formatBytes } from '@easystudio/core'
import { getRenderer } from '../../gpuHost'
import { MODELS } from '../../ai/models'

const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: 'keys.tools',
    items: [
      ['V', 'keys.moveTool'],
      ['M / L / W', 'keys.selectTool'],
      ['C', 'keys.cropTool'],
      ['B / E / S', 'keys.brushTool'],
      ['G', 'keys.fillTool'],
      ['T / U', 'keys.textTool'],
      ['I', 'keys.pickerTool'],
      ['H', 'keys.handTool'],
      ['Space', 'keys.tempHand'],
      ['[  ]', 'keys.brushSize'],
      ['X / D', 'keys.colors']
    ]
  },
  {
    group: 'keys.selection',
    items: [
      ['Ctrl+A', 'menu.selectAll'],
      ['Ctrl+D', 'menu.deselect'],
      ['Ctrl+Shift+I', 'menu.invert'],
      ['Ctrl+J', 'menu.copyLayer'],
      ['Delete', 'menu.clear']
    ]
  },
  {
    group: 'keys.file',
    items: [
      ['Ctrl+N', 'menu.new'],
      ['Ctrl+O', 'menu.open'],
      ['Ctrl+S', 'menu.save'],
      ['Ctrl+Shift+E', 'menu.export'],
      ['Ctrl+V', 'menu.paste']
    ]
  },
  {
    group: 'keys.editing',
    items: [
      ['Ctrl+Z', 'menu.undo'],
      ['Ctrl+Shift+Z', 'menu.redo'],
      ['Ctrl+J', 'menu.duplicate'],
      ['Delete', 'menu.delete'],
      ['← ↑ → ↓', 'keys.nudge'],
      ['Enter / Esc', 'keys.applyCrop']
    ]
  },
  {
    group: 'keys.viewing',
    items: [
      ['Wheel', 'keys.zoomWheel'],
      ['Ctrl+0', 'menu.fit'],
      ['Ctrl+1', 'menu.actual'],
      ['\\', 'keys.compare']
    ]
  }
]

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const [info, setInfo] = useState<{ version: string; dataDir: string } | null>(null)
  useEffect(() => {
    window.easyStudio?.appInfo().then(setInfo)
  }, [])
  const gpu = getRenderer()?.gpuName()
  return (
    <Modal title={t('app.name')} onClose={onClose} width={620} footer={<Button onClick={onClose}>{t('dialog.ok')}</Button>}>
      <p className="dialog-hint">{t('dialog.aboutText')}</p>
      <p className="about-meta">
        {info && <span>{t('dialog.version', { v: info.version })}</span>}
        {gpu && <span>{t('welcome.gpu', { name: gpu })}</span>}
        {info && <span>{t('dialog.dataDir', { dir: info.dataDir })}</span>}
      </p>
      <h3 className="dialog-h3">{t('ai.modelsTitle')}</h3>
      <p className="dialog-hint">{t('ai.modelsText')}</p>
      <ul className="ai-models">
        {Object.values(MODELS).map((m) => (
          <li key={m.id}>
            <b>{m.credit}</b> · {m.license} · {formatBytes(m.bytes)}
          </li>
        ))}
      </ul>
      <h3 className="dialog-h3">{t('dialog.shortcutsTitle')}</h3>
      <div className="shortcut-grid">
        {SHORTCUTS.map((g) => (
          <div key={g.group}>
            <h4>{t(g.group)}</h4>
            {g.items.map(([k, label]) => (
              <div className="shortcut" key={k + label}>
                <span>{t(label)}</span>
                <kbd className="es-kbd">{k}</kbd>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  )
}
