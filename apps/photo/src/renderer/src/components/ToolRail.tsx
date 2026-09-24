import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Brush, Crop, Eraser, Hand, MousePointer2, PaintBucket, Pipette, RefreshCw, Shapes, SquareDashed, Stamp, Type, ArrowLeftRight, WandSparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { ColorPicker, Popover } from '@easystudio/ui'
import { ProBadge } from '@easystudio/license'
import * as A from '../state/actions'
import { resetColors, setColor, setTool, swapColors, useEditor } from '../state/store'
import type { Tool } from '../state/types'

interface ToolDef {
  id: Tool
  icon: ReactNode
  pro?: boolean
}

const TOOLS: (ToolDef | 'sep')[] = [
  { id: 'move', icon: <MousePointer2 size={19} /> },
  { id: 'select', icon: <SquareDashed size={19} /> },
  { id: 'crop', icon: <Crop size={19} /> },
  'sep',
  { id: 'brush', icon: <Brush size={19} /> },
  { id: 'eraser', icon: <Eraser size={19} /> },
  { id: 'magic', icon: <WandSparkles size={19} /> },
  { id: 'clone', icon: <Stamp size={19} />, pro: true },
  { id: 'fill', icon: <PaintBucket size={19} /> },
  'sep',
  { id: 'text', icon: <Type size={19} /> },
  { id: 'shape', icon: <Shapes size={19} /> },
  { id: 'eyedropper', icon: <Pipette size={19} /> },
  { id: 'hand', icon: <Hand size={19} /> }
]

export function ToolRail() {
  const { t } = useTranslation()
  const tool = useEditor((s) => s.tool)
  const mode = useEditor((s) => s.mode)
  return (
    <aside className="toolrail">
      <div className="tool-list">
        {TOOLS.map((tl, i) =>
          tl === 'sep' ? (
            <div key={i} className="tool-sep" />
          ) : tl.pro && mode !== 'pro' ? null : (
            <button
              key={tl.id}
              type="button"
              className={`tool${tool === tl.id ? ' on' : ''}`}
              data-tip={t(`tool.${tl.id}Tip`)}
              data-tip-pos="right"
              onClick={() => (tl.id === 'crop' ? tool !== 'crop' && A.startCrop() : setTool(tl.id))}
            >
              {tl.icon}
              <span>{t(`tool.${tl.id}`)}</span>
              {tl.id === 'clone' && <ProBadge className="tool-pro" />}
            </button>
          )
        )}
      </div>
      <ColorWells />
    </aside>
  )
}

function ColorWells() {
  const { t } = useTranslation()
  const fg = useEditor((s) => s.fg)
  const bg = useEditor((s) => s.bg)
  const recent = useEditor((s) => s.recentColors)
  const [open, setOpen] = useState<{ which: 'fg' | 'bg'; el: HTMLElement } | null>(null)
  const labels = { hex: t('colors.hex'), recent: t('colors.recent'), palette: t('colors.palette'), eyedropper: t('colors.eyedropper') }
  return (
    <div className="wells">
      <div className="wells-pair">
        <button
          type="button"
          className="well bg"
          style={{ background: bg }}
          data-tip={t('colors.bg')}
          data-tip-pos="right"
          onClick={(e) => setOpen({ which: 'bg', el: e.currentTarget })}
        />
        <button
          type="button"
          className="well fg"
          style={{ background: fg }}
          data-tip={t('colors.fg')}
          data-tip-pos="right"
          onClick={(e) => setOpen({ which: 'fg', el: e.currentTarget })}
        />
      </div>
      <div className="wells-actions">
        <button type="button" data-tip={t('colors.swap')} data-tip-pos="right" onClick={swapColors}>
          <ArrowLeftRight size={12} />
        </button>
        <button type="button" data-tip={t('colors.reset')} data-tip-pos="right" onClick={resetColors}>
          <RefreshCw size={12} />
        </button>
      </div>
      {open && (
        <Popover anchor={open.el} onClose={() => setOpen(null)}>
          <ColorPicker value={open.which === 'fg' ? fg : bg} recent={recent} labels={labels} onChange={(hex) => setColor(open.which, hex)} />
        </Popover>
      )}
    </div>
  )
}
