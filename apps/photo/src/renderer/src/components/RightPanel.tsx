import { useTranslation } from 'react-i18next'
import { History, Layers, Shapes, SlidersHorizontal, Type, Wand2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { activeLayer } from '../state/docOps'
import { useDoc, useEditor } from '../state/store'
import type { Panel } from '../state/types'
import { AdjustPanel } from './AdjustPanel'
import { FiltersPanel } from './FiltersPanel'
import { LayersPanel } from './LayersPanel'
import { HistoryPanel } from './HistoryPanel'
import { PropsPanel } from './PropsPanel'

export function RightPanel() {
  const { t } = useTranslation()
  const doc = useDoc()
  const layer = doc ? activeLayer(doc) : undefined
  const propsKind = layer?.type === 'text' ? 'text' : layer?.type === 'shape' ? 'shape' : null
  const stored = useEditor((s) => s.panel)
  const panel: Panel = stored === 'props' && !propsKind ? 'adjust' : stored

  const tabs: { id: Panel; icon: ReactNode; label: string }[] = [
    ...(propsKind ? [{ id: 'props' as Panel, icon: propsKind === 'text' ? <Type size={16} /> : <Shapes size={16} />, label: t(`panel.${propsKind}`) }] : []),
    { id: 'adjust', icon: <SlidersHorizontal size={16} />, label: t('panel.adjust') },
    { id: 'filters', icon: <Wand2 size={16} />, label: t('panel.filters') },
    { id: 'layers', icon: <Layers size={16} />, label: t('panel.layers') },
    { id: 'history', icon: <History size={16} />, label: t('panel.history') }
  ]

  return (
    <aside className="rightpanel">
      <div className="tabs" role="tablist" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            role="tab"
            aria-selected={panel === tb.id}
            className={`tab${panel === tb.id ? ' on' : ''}`}
            onClick={() => useEditor.setState({ panel: tb.id })}
          >
            {tb.icon}
            <span>{tb.label}</span>
          </button>
        ))}
      </div>
      <div className="panel-body">
        {panel === 'props' && <PropsPanel />}
        {panel === 'adjust' && <AdjustPanel />}
        {panel === 'filters' && <FiltersPanel />}
        {panel === 'layers' && <LayersPanel />}
        {panel === 'history' && <HistoryPanel />}
      </div>
    </aside>
  )
}
