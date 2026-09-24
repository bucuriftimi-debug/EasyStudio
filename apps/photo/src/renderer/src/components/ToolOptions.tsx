import { useTranslation } from 'react-i18next'
import {
  ArrowLeftRight,
  Check,
  Circle,
  Copy,
  Crop as CropIcon,
  FlipHorizontal2,
  FlipVertical2,
  Lasso,
  Maximize,
  Minus,
  MoveRight,
  PaintBucket,
  RefreshCcw,
  RotateCw,
  Square,
  SquareDashed,
  Star,
  Trash2,
  Triangle,
  Wand2,
  X,
  Blend,
  MousePointerClick,
  Sparkles
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Button, Segmented, Switch } from '@easystudio/ui'
import { CROP_RATIOS } from '@easystudio/core'
import * as A from '../state/actions'
import * as paint from '../state/paint'
import * as AI from '../state/ai'
import { setSettings, useDoc, useEditor } from '../state/store'
import type { FillKind, SelectShape, SelOp, ShapeKind, ToolSettings } from '../state/types'

export function ToolOptions() {
  const tool = useEditor((s) => s.tool)
  const body = (() => {
    switch (tool) {
      case 'move':
        return <MoveOptions />
      case 'crop':
        return <CropOptions />
      case 'select':
        return <SelectOptions />
      case 'brush':
      case 'eraser':
      case 'clone':
        return <BrushOptions tool={tool} />
      case 'magic':
        return <MagicOptions />
      case 'fill':
        return <FillOptions />
      case 'shape':
        return <ShapeOptions />
      case 'text':
        return <Hint k="tool.textHint" />
      case 'eyedropper':
        return <Hint k="tool.eyedropperHint" />
      default:
        return <Hint k="tool.handHint" />
    }
  })()
  return <div className="tooloptions">{body}</div>
}

function Hint({ k }: { k: string }) {
  const { t } = useTranslation()
  return <span className="hint">{t(k)}</span>
}

/** Compact slider for the options bar. */
export function MiniSlider({ label, value, min, max, unit = '', onChange }: { label: string; value: number; min: number; max: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label className="mini-slider">
      <span>{label}</span>
      <input
        type="range"
        className="es-range"
        min={min}
        max={max}
        value={value}
        style={{ '--fill-from': '0%', '--fill-to': `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <input
        className="mini-value"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, Math.round(n))))
        }}
        onKeyDown={(e) => e.stopPropagation()}
      />
      {unit && <em>{unit}</em>}
    </label>
  )
}

function MoveOptions() {
  const { t } = useTranslation()
  const doc = useDoc()
  const has = !!doc?.layers.length
  return (
    <>
      <Button size="sm" variant="ghost" disabled={!has} onClick={() => A.layerOp('flipH')}>
        <FlipHorizontal2 size={15} /> {t('tool.flipH')}
      </Button>
      <Button size="sm" variant="ghost" disabled={!has} onClick={() => A.layerOp('flipV')}>
        <FlipVertical2 size={15} /> {t('tool.flipV')}
      </Button>
      <Button size="sm" variant="ghost" disabled={!has} onClick={() => A.layerOp('rotate')}>
        <RotateCw size={15} /> {t('tool.rotate')}
      </Button>
      <Button size="sm" variant="ghost" disabled={!has} onClick={() => A.layerOp('fit')}>
        <Maximize size={15} /> {t('tool.fit')}
      </Button>
      <Button size="sm" variant="ghost" disabled={!has} onClick={() => A.layerOp('reset')}>
        <RefreshCcw size={15} /> {t('tool.reset')}
      </Button>
      <span className="hint">{t('tool.moveHint')}</span>
    </>
  )
}

function CropOptions() {
  const { t } = useTranslation()
  const doc = useDoc()
  const crop = useEditor((s) => s.crop)
  if (!doc || !crop) return null
  const ratioValue = (id: string) => A.cropRatioValue(id, doc, CROP_RATIOS)
  return (
    <>
      <span className="opt-label">{t('tool.ratio')}</span>
      <div className="chips">
        {CROP_RATIOS.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`chip${crop.ratioId === r.id ? ' on' : ''}`}
            onClick={() => A.setCropRatio(r.id, ratioValue(r.id))}
            data-tip={t(r.label)}
          >
            {r.id === 'free' ? t('crop.free') : r.id === 'original' ? t('crop.original') : r.id === 'a4' ? 'A4' : r.id}
          </button>
        ))}
      </div>
      <Button
        size="sm"
        variant="ghost"
        icon
        tip={t('tool.swap')}
        disabled={crop.ratioId === 'free' || crop.ratioId === '1:1'}
        onClick={() => {
          const r = ratioValue(crop.ratioId)
          if (r) A.setCropRatio(crop.ratioId, crop.w >= crop.h ? Math.min(r, 1 / r) : Math.max(r, 1 / r))
        }}
      >
        <ArrowLeftRight size={15} />
      </Button>
      <span className="crop-size">
        {Math.round(crop.w)} × {Math.round(crop.h)}
      </span>
      <div className="spacer" />
      <Button size="sm" variant="ghost" onClick={A.cancelCrop}>
        <X size={15} /> {t('tool.cancel')}
      </Button>
      <Button size="sm" variant="primary" onClick={A.applyCrop}>
        <Check size={15} /> {t('tool.apply')}
      </Button>
    </>
  )
}

function SelectOptions() {
  const { t } = useTranslation()
  const s = useEditor((st) => st.settings)
  const sel = useEditor((st) => st.selection)
  const fg = useEditor((st) => st.fg)
  const shapes: { value: SelectShape; label: ReactNode; tip: string }[] = [
    { value: 'rect', label: <Square size={14} />, tip: t('tool.rect') },
    { value: 'ellipse', label: <Circle size={14} />, tip: t('tool.ellipse') },
    { value: 'lasso', label: <Lasso size={14} />, tip: t('tool.lasso') },
    { value: 'wand', label: <Wand2 size={14} />, tip: t('tool.wand') },
    { value: 'object', label: <MousePointerClick size={14} />, tip: t('tool.object') }
  ]
  const ops: { value: SelOp; label: string; tip: string }[] = [
    { value: 'replace', label: '▢', tip: t('tool.opNew') },
    { value: 'add', label: '+', tip: t('tool.opAdd') },
    { value: 'sub', label: '−', tip: t('tool.opSub') },
    { value: 'int', label: '∩', tip: t('tool.opInt') }
  ]
  return (
    <>
      <Segmented<SelectShape> value={s.selectShape} options={shapes} onChange={(v) => setSettings({ selectShape: v })} />
      <Segmented<SelOp> value={s.selectOp} options={ops} onChange={(v) => setSettings({ selectOp: v })} />
      {s.selectShape === 'wand' && (
        <>
          <MiniSlider label={t('tool.tolerance')} min={0} max={100} value={s.wandTolerance} onChange={(v) => setSettings({ wandTolerance: v })} />
          <Switch checked={s.wandContiguous} onChange={(v) => setSettings({ wandContiguous: v })} label={t('tool.contiguous')} />
        </>
      )}
      <Button size="sm" variant="outline" className="ai-btn" tip={t('ai.selectSubject')} onClick={() => void AI.selectSubject(s.selectOp)}>
        <Sparkles size={14} /> {t('tool.subject')}
      </Button>
      <div className="spacer" />
      {sel ? (
        <>
          <Button size="sm" variant="ghost" onClick={() => A.deleteKey()} tip={t('menu.clear')}>
            <Trash2 size={14} /> {t('tool.deleteSel')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => paint.fillSelected(fg)} tip={t('menu.fillFg')}>
            <PaintBucket size={14} /> {t('tool.fillSel')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => paint.layerFromSelection(false)} tip={t('menu.copyLayer')}>
            <Copy size={14} /> {t('tool.copySel')}
          </Button>
          <Button size="sm" variant="ghost" onClick={A.cropToSelection} tip={t('menu.cropToSel')}>
            <CropIcon size={14} /> {t('tool.cropSel')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => useEditor.setState({ dialog: 'selmodify' })}>
            <Blend size={14} /> {t('tool.modify')}
          </Button>
          <Button size="sm" variant="ghost" onClick={A.invertSelection}>
            {t('tool.invert')}
          </Button>
          <Button size="sm" variant="outline" onClick={A.deselect}>
            <X size={14} /> {t('tool.deselect')}
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" onClick={A.selectAll}>
          <SquareDashed size={14} /> {t('tool.selectAll')}
        </Button>
      )}
    </>
  )
}

function BrushOptions({ tool }: { tool: 'brush' | 'eraser' | 'clone' }) {
  const { t } = useTranslation()
  const s = useEditor((st) => st.settings)
  const editMask = useEditor((st) => st.editMask)
  const key = (k: 'Size' | 'Hardness' | 'Opacity') => `${tool}${k}` as keyof ToolSettings
  const val = (k: 'Size' | 'Hardness' | 'Opacity') => s[key(k)] as number
  const setv = (k: 'Size' | 'Hardness' | 'Opacity', v: number) => setSettings({ [key(k)]: v } as Partial<ToolSettings>)
  return (
    <>
      <MiniSlider label={t('tool.size')} min={1} max={500} value={val('Size')} unit="px" onChange={(v) => setv('Size', v)} />
      <MiniSlider label={t('tool.hardness')} min={0} max={100} value={val('Hardness')} unit="%" onChange={(v) => setv('Hardness', v)} />
      <MiniSlider label={t('tool.opacity')} min={1} max={100} value={val('Opacity')} unit="%" onChange={(v) => setv('Opacity', v)} />
      {tool === 'brush' && <MiniSlider label={t('tool.smoothing')} min={0} max={100} value={s.brushSmoothing} unit="%" onChange={(v) => setSettings({ brushSmoothing: v })} />}
      <span className={`hint${editMask ? ' mask-hint' : ''}`}>{editMask ? t('tool.maskHint') : tool === 'clone' ? t('tool.cloneHint') : ''}</span>
    </>
  )
}

function MagicOptions() {
  const { t } = useTranslation()
  const size = useEditor((st) => st.settings.magicSize)
  const hasSel = useEditor((st) => !!st.selection)
  return (
    <>
      <MiniSlider label={t('tool.size')} min={4} max={400} value={size} unit="px" onChange={(v) => setSettings({ magicSize: v })} />
      {hasSel && (
        <Button size="sm" variant="outline" className="ai-btn" onClick={() => void AI.eraseObject([], 0)}>
          <Sparkles size={14} /> {t('ai.eraseSelection')}
        </Button>
      )}
      <span className="hint">{t('tool.magicHint')}</span>
    </>
  )
}

function FillOptions() {
  const { t } = useTranslation()
  const s = useEditor((st) => st.settings)
  return (
    <>
      <Segmented<FillKind>
        value={s.fillKind}
        onChange={(v) => setSettings({ fillKind: v })}
        options={[
          { value: 'bucket', label: t('tool.bucket') },
          { value: 'gradient', label: t('tool.gradient') }
        ]}
      />
      {s.fillKind === 'bucket' ? (
        <>
          <MiniSlider label={t('tool.tolerance')} min={0} max={100} value={s.fillTolerance} onChange={(v) => setSettings({ fillTolerance: v })} />
          <Switch checked={s.fillContiguous} onChange={(v) => setSettings({ fillContiguous: v })} label={t('tool.contiguous')} />
        </>
      ) : (
        <>
          <Segmented<'linear' | 'radial'>
            value={s.gradientType}
            onChange={(v) => setSettings({ gradientType: v })}
            options={[
              { value: 'linear', label: t('tool.linear') },
              { value: 'radial', label: t('tool.radial') }
            ]}
          />
          <Switch checked={s.gradientToTransparent} onChange={(v) => setSettings({ gradientToTransparent: v })} label={t('tool.toTransparent')} />
        </>
      )}
    </>
  )
}

export const SHAPE_ICONS: Record<ShapeKind, ReactNode> = {
  rect: <Square size={15} />,
  ellipse: <Circle size={15} />,
  triangle: <Triangle size={15} />,
  star: <Star size={15} />,
  line: <Minus size={15} />,
  arrow: <MoveRight size={15} />
}

function ShapeOptions() {
  const { t } = useTranslation()
  const kind = useEditor((st) => st.settings.shapeKind)
  return (
    <>
      <div className="chips">
        {(Object.keys(SHAPE_ICONS) as ShapeKind[]).map((k) => (
          <button key={k} type="button" className={`chip icon-chip${kind === k ? ' on' : ''}`} onClick={() => setSettings({ shapeKind: k })} data-tip={t(`shape.${k}`)}>
            {SHAPE_ICONS[k]}
          </button>
        ))}
      </div>
      <span className="hint">{t('tool.shapeHint')}</span>
    </>
  )
}
