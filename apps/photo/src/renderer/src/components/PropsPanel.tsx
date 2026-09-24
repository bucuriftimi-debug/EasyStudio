import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlignCenter, AlignLeft, AlignRight, ChevronDown, Italic, Search } from 'lucide-react'
import { Button, ColorButton, Popover, Segmented, Slider, Switch } from '@easystudio/ui'
import * as A from '../state/actions'
import { activeLayer } from '../state/docOps'
import { beginGesture, endGesture, rememberColor, useDoc, useEditor } from '../state/store'
import type { ShapeKind, ShapeLayer, ShapeStyle, TextLayer, TextStyle } from '../state/types'
import { BUNDLED_FONTS, fontWeights, loadSystemFonts } from '../fonts'
import { SHAPE_ICONS } from './ToolOptions'
import { STYLE_PRESETS } from '../state/textStyles'

export function PropsPanel() {
  const { t } = useTranslation()
  const doc = useDoc()
  const layer = doc ? activeLayer(doc) : undefined
  if (layer?.type === 'text') return <TextProps layer={layer} />
  if (layer?.type === 'shape') return <ShapeProps layer={layer} />
  return <p className="empty">{t('tool.textHint')}</p>
}

/* ------------------------------ helpers ------------------------------ */

function useColorLabels() {
  const { t } = useTranslation()
  return { hex: t('colors.hex'), recent: t('colors.recent'), palette: t('colors.palette'), eyedropper: t('colors.eyedropper') }
}

function Section({ title, on, onToggle, children }: { title: string; on?: boolean; onToggle?: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <section className="props-section">
      <div className="props-head">
        <span>{title}</span>
        {onToggle && <Switch checked={!!on} onChange={onToggle} />}
      </div>
      {(on ?? true) && children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="props-row">
      <span>{label}</span>
      <div className="props-row-ctl">{children}</div>
    </div>
  )
}

/* ------------------------------ text ------------------------------ */


function TextProps({ layer }: { layer: TextLayer }) {
  const { t } = useTranslation()
  const s = layer.style
  const recent = useEditor((st) => st.recentColors)
  const focusText = useEditor((st) => st.focusText)
  const labels = useColorLabels()
  const area = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (focusText === layer.id && area.current) {
      area.current.focus()
      area.current.select()
      useEditor.setState({ focusText: null })
    }
  }, [focusText, layer.id])

  const slide = (key: keyof TextStyle, label: string, min: number, max: number, scale = 1) => (
    <Slider
      label={label}
      min={min}
      max={max}
      value={Math.round((s[key] as number) * scale)}
      defaultValue={Math.round((s[key] as number) * scale)}
      onStart={beginGesture}
      onChange={(v) => A.updateText({ [key]: v / scale } as Partial<TextStyle>, true)}
      onCommit={() => endGesture(t('history.text'))}
    />
  )
  const color = (key: 'color' | 'strokeColor' | 'shadowColor' | 'bgColor', tip: string) => (
    <ColorButton
      value={s[key]}
      recent={recent}
      tip={tip}
      labels={labels}
      onChange={(hex, final) => {
        // Dragging inside the picker is one undo step.
        beginGesture()
        A.updateText({ [key]: hex }, true)
        if (final) {
          endGesture(t('history.text'))
          rememberColor(hex)
        }
      }}
    />
  )
  const weights = fontWeights(s.font)

  return (
    <div className="props">
      <textarea
        ref={area}
        className="es-input text-area"
        value={s.text}
        placeholder={t('text.placeholder')}
        rows={3}
        onFocus={beginGesture}
        onChange={(e) => A.updateText({ text: e.target.value }, true)}
        onBlur={() => endGesture(t('history.text'))}
        onKeyDown={(e) => e.stopPropagation()}
      />

      <div className="props-label">{t('text.styles')}</div>
      <div className="style-grid">
        {STYLE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`style-card ${p.id}`}
            style={{ fontFamily: `"${p.font}"`, fontWeight: p.weight, fontStyle: p.italic ? 'italic' : 'normal' }}
            onClick={() => A.updateText(p.make(s))}
          >
            {t(`text.${p.id}`)}
          </button>
        ))}
      </div>

      <Section title={t('text.font')}>
        <FontSelect value={s.font} onChange={(font) => A.updateText({ font, weight: fontWeights(font).includes(s.weight) ? s.weight : fontWeights(font).includes(700) && s.weight >= 700 ? 700 : fontWeights(font)[0] })} />
        {slide('size', t('text.size'), 8, 600)}
        <div className="props-inline">
          {weights.length > 1 && (
            <Segmented<string>
              value={String(s.weight)}
              onChange={(v) => A.updateText({ weight: Number(v) })}
              options={weights.map((w) => ({ value: String(w), label: w >= 900 ? t('text.black') : w >= 700 ? t('text.bold') : t('text.regular') }))}
            />
          )}
          <Button size="sm" icon variant="ghost" active={s.italic} tip={t('text.italic')} onClick={() => A.updateText({ italic: !s.italic })}>
            <Italic size={14} />
          </Button>
          <Button size="sm" variant="ghost" active={s.uppercase} tip={t('text.uppercase')} onClick={() => A.updateText({ uppercase: !s.uppercase })}>
            AA
          </Button>
        </div>
        <div className="props-inline">
          <Segmented<TextStyle['align']>
            value={s.align}
            onChange={(v) => A.updateText({ align: v })}
            options={[
              { value: 'left', label: <AlignLeft size={14} /> },
              { value: 'center', label: <AlignCenter size={14} /> },
              { value: 'right', label: <AlignRight size={14} /> }
            ]}
          />
          <div className="spacer" />
          <span className="props-mini-label">{t('text.color')}</span>
          {color('color', t('text.color'))}
        </div>
        {slide('lineHeight', t('text.lineHeight'), 70, 250, 100)}
        {slide('letterSpacing', t('text.letterSpacing'), -20, 100)}
      </Section>

      <Section title={t('text.outline')} on={s.strokeWidth > 0} onToggle={(v) => A.updateText({ strokeWidth: v ? Math.max(2, Math.round(s.size * 0.04)) : 0, fill: v ? s.fill : true })}>
        <Row label={t('text.color')}>{color('strokeColor', t('text.color'))}</Row>
        {slide('strokeWidth', t('text.width'), 1, 60)}
        <Switch checked={s.fill} onChange={(v) => A.updateText({ fill: v })} label={t('text.fill')} />
      </Section>

      <Section
        title={t('text.shadow')}
        on={s.shadowBlur > 0 || s.shadowX !== 0 || s.shadowY !== 0}
        onToggle={(v) => A.updateText(v ? { shadowBlur: Math.round(s.size * 0.15), shadowX: 0, shadowY: Math.round(s.size * 0.04) } : { shadowBlur: 0, shadowX: 0, shadowY: 0 })}
      >
        <Row label={t('text.color')}>{color('shadowColor', t('text.color'))}</Row>
        {slide('shadowBlur', t('text.blur'), 0, 150)}
        <Slider
          label={t('text.offset')}
          min={0}
          max={80}
          value={Math.round(Math.hypot(s.shadowX, s.shadowY))}
          onStart={beginGesture}
          onChange={(v) => A.updateText({ shadowX: 0, shadowY: v }, true)}
          onCommit={() => endGesture(t('history.text'))}
        />
      </Section>

      <Section title={t('text.background')} on={s.bgEnabled} onToggle={(v) => A.updateText({ bgEnabled: v, bgPadding: s.bgPadding || Math.round(s.size * 0.35) })}>
        <Row label={t('text.color')}>{color('bgColor', t('text.color'))}</Row>
        {slide('bgRadius', t('text.radius'), 0, 300)}
        {slide('bgPadding', t('text.padding'), 0, 200)}
      </Section>
    </div>
  )
}

function FontSelect({ value, onChange }: { value: string; onChange: (f: string) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<HTMLElement | null>(null)
  const [q, setQ] = useState('')
  const [system, setSystem] = useState<string[]>([])
  useEffect(() => {
    if (open) loadSystemFonts().then(setSystem)
  }, [open])
  const bundled = useMemo(() => BUNDLED_FONTS.map((f) => f.family).filter((f) => f.toLowerCase().includes(q.toLowerCase())), [q])
  const sys = useMemo(() => system.filter((f) => f.toLowerCase().includes(q.toLowerCase())), [system, q])
  const pick = (f: string) => {
    onChange(f)
    setOpen(null)
  }
  return (
    <>
      <button type="button" className="font-select" style={{ fontFamily: `"${value}"` }} onClick={(e) => setOpen(open ? null : e.currentTarget)}>
        <span>{value}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <Popover anchor={open} onClose={() => setOpen(null)} side="bottom">
          <div className="font-pop">
            <label className="font-search">
              <Search size={14} />
              <input autoFocus placeholder={t('text.search')} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
            </label>
            <div className="font-list">
              {bundled.length > 0 && <div className="font-group">{t('text.popular')}</div>}
              {bundled.map((f) => (
                <button key={f} type="button" className={`font-item${f === value ? ' on' : ''}`} style={{ fontFamily: `"${f}"` }} onClick={() => pick(f)}>
                  {f === 'Inter Variable' ? 'Inter' : f}
                </button>
              ))}
              {sys.length > 0 && <div className="font-group">{t('text.system')}</div>}
              {sys.map((f) => (
                <button key={f} type="button" className={`font-item${f === value ? ' on' : ''}`} style={{ fontFamily: `"${f}"` }} onClick={() => pick(f)}>
                  {f}
                </button>
              ))}
            </div>
          </div>
        </Popover>
      )}
    </>
  )
}

/* ------------------------------ shapes ------------------------------ */

const CLOSED: ShapeKind[] = ['rect', 'ellipse', 'triangle', 'star']
const LINES: ShapeKind[] = ['line', 'arrow']

function ShapeProps({ layer }: { layer: ShapeLayer }) {
  const { t } = useTranslation()
  const s = layer.shape
  const recent = useEditor((st) => st.recentColors)
  const labels = useColorLabels()
  const isLine = LINES.includes(s.kind)
  const family = isLine ? LINES : CLOSED
  const slide = (key: keyof ShapeStyle, label: string, min: number, max: number) => (
    <Slider
      label={label}
      min={min}
      max={max}
      value={Math.round(s[key] as number)}
      defaultValue={Math.round(s[key] as number)}
      onStart={beginGesture}
      onChange={(v) => A.updateShape({ [key]: v } as Partial<ShapeStyle>, true)}
      onCommit={() => endGesture(t('history.shape'))}
    />
  )
  const color = (key: 'fill' | 'stroke', tip: string) => (
    <ColorButton
      value={s[key]}
      recent={recent}
      tip={tip}
      labels={labels}
      onChange={(hex, final) => {
        beginGesture()
        A.updateShape({ [key]: hex }, true)
        if (final) {
          endGesture(t('history.shape'))
          rememberColor(hex)
        }
      }}
    />
  )
  return (
    <div className="props">
      <Section title={t('shape.kind')}>
        <div className="chips">
          {family.map((k) => (
            <button key={k} type="button" className={`chip icon-chip${s.kind === k ? ' on' : ''}`} data-tip={t(`shape.${k}`)} onClick={() => A.updateShape({ kind: k })}>
              {SHAPE_ICONS[k]}
            </button>
          ))}
        </div>
      </Section>
      {isLine ? (
        <Section title={t('shape.line')}>
          <Row label={t('shape.color')}>{color('stroke', t('shape.color'))}</Row>
          {slide('strokeWidth', t('shape.lineWidth'), 1, 120)}
        </Section>
      ) : (
        <>
          <Section title={t('shape.fill')} on={s.fillEnabled} onToggle={(v) => A.updateShape({ fillEnabled: v, strokeWidth: !v && !s.strokeWidth ? 6 : s.strokeWidth })}>
            <Row label={t('shape.color')}>{color('fill', t('shape.color'))}</Row>
          </Section>
          <Section title={t('shape.stroke')} on={s.strokeWidth > 0} onToggle={(v) => A.updateShape({ strokeWidth: v ? 6 : 0, fillEnabled: v ? s.fillEnabled : true })}>
            <Row label={t('shape.color')}>{color('stroke', t('shape.color'))}</Row>
            {slide('strokeWidth', t('shape.strokeWidth'), 1, 120)}
          </Section>
          {s.kind === 'rect' && <Section title={t('shape.radius')}>{slide('radius', t('shape.radius'), 0, Math.round(Math.min(layer.width, layer.height) / 2))}</Section>}
        </>
      )}
    </div>
  )
}
