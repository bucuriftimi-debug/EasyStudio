import { useTranslation } from 'react-i18next'
import { Minus, Plus, SplitSquareHorizontal } from 'lucide-react'
import { Button } from '@easystudio/ui'
import { fitView, useDoc, useEditor, zoomStep, zoomTo } from '../state/store'

export function StatusBar() {
  const { t } = useTranslation()
  const doc = useDoc()
  const zoom = useEditor((s) => s.view.zoom)
  const compare = useEditor((s) => s.compare)
  const sel = useEditor((s) => s.selection?.bounds)
  if (!doc) return <footer className="statusbar" />
  return (
    <footer className="statusbar">
      <span className="status-size">{t('status.size', { w: doc.width, h: doc.height })}</span>
      {sel && <span className="status-sel">{t('status.selection', { w: sel.w, h: sel.h })}</span>}
      <div className="spacer" />
      <Button
        size="sm"
        variant="ghost"
        active={compare}
        tip={t('status.compareTip')}
        tipPos="top"
        onPointerDown={() => useEditor.setState({ compare: true })}
        onPointerUp={() => useEditor.setState({ compare: false })}
        onPointerLeave={() => compare && useEditor.setState({ compare: false })}
      >
        <SplitSquareHorizontal size={14} /> {t('status.compare')}
      </Button>
      <div className="divider" />
      <Button size="sm" variant="ghost" icon onClick={() => zoomStep(-1)} tip={t('menu.zoomOut')} tipPos="top">
        <Minus size={14} />
      </Button>
      <button type="button" className="zoom-value" onClick={() => zoomTo(1)} data-tip={t('menu.actual')} data-tip-pos="top">
        {Math.round(zoom * 100)}%
      </button>
      <Button size="sm" variant="ghost" icon onClick={() => zoomStep(1)} tip={t('menu.zoomIn')} tipPos="top">
        <Plus size={14} />
      </Button>
      <Button size="sm" variant="ghost" onClick={() => fitView(true)}>
        {t('status.fit')}
      </Button>
    </footer>
  )
}
