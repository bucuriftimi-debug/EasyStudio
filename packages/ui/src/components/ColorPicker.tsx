import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { hexToHsv, hsvToHex, parseHex, toHex, type HSV } from '@easystudio/core'

export const PALETTE = [
  '#000000', '#434343', '#999999', '#ffffff',
  '#ff3b30', '#ff9500', '#ffcc00', '#34c759',
  '#00c7be', '#30b0ff', '#007aff', '#5856d6',
  '#af52de', '#ff2d55', '#a2845e', '#7b6bff'
]

export interface ColorPickerProps {
  value: string
  /** `final` is true when the user releases the pointer / picks a swatch (good moment for undo). */
  onChange: (hex: string, final: boolean) => void
  recent?: string[]
  labels?: { hex?: string; recent?: string; palette?: string; eyedropper?: string }
}

function useDrag(onMove: (x: number, y: number, final: boolean) => void) {
  return (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    const at = (ev: PointerEvent | React.PointerEvent, final: boolean) =>
      onMove(Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height)), final)
    at(e, false)
    const move = (ev: PointerEvent) => at(ev, false)
    const up = (ev: PointerEvent) => {
      at(ev, true)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
}

export function ColorPicker({ value, onChange, recent = [], labels = {} }: ColorPickerProps) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value))
  const [text, setText] = useState(value)
  const last = useRef(value)
  // Follow outside changes without losing the hue of greys.
  useEffect(() => {
    if (value.toLowerCase() !== last.current.toLowerCase()) {
      const n = hexToHsv(value)
      setHsv((h) => (n.s === 0 || n.v === 0 ? { ...n, h: h.h } : n))
      last.current = value
    }
    setText(value)
  }, [value])

  const emit = (n: HSV, final: boolean) => {
    setHsv(n)
    const hex = hsvToHex(n)
    last.current = hex
    setText(hex)
    onChange(hex, final)
  }
  const svDown = useDrag((x, y, final) => emit({ ...hsv, s: x, v: 1 - y }, final))
  const hueDown = useDrag((x, _y, final) => emit({ ...hsv, h: x * 360 }, final))

  const pickScreen = async () => {
    const ED = (window as unknown as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper
    if (!ED) return
    try {
      const r = await new ED().open()
      const c = parseHex(r.sRGBHex)
      if (c) {
        const hex = toHex(c)
        setHsv(hexToHsv(hex))
        last.current = hex
        onChange(hex, true)
      }
    } catch {
      /* cancelled */
    }
  }
  const hasEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window

  return (
    <div className="es-cp">
      <div className="es-cp-sv" style={{ '--hue': `hsl(${hsv.h}, 100%, 50%)` } as CSSProperties} onPointerDown={svDown}>
        <i style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hsvToHex(hsv) }} />
      </div>
      <div className="es-cp-hue" onPointerDown={hueDown}>
        <i style={{ left: `${(hsv.h / 360) * 100}%` }} />
      </div>
      <div className="es-cp-row">
        <span className="es-cp-preview" style={{ background: value }} />
        <input
          className="es-input es-cp-hex"
          value={text}
          aria-label={labels.hex ?? 'Hex'}
          onChange={(e) => {
            setText(e.target.value)
            const c = parseHex(e.target.value)
            if (c) {
              const hex = toHex(c)
              setHsv(hexToHsv(hex))
              last.current = hex
              onChange(hex, true)
            }
          }}
          onKeyDown={(e) => e.stopPropagation()}
        />
        {hasEyeDropper && (
          <button type="button" className="es-btn sm ghost" onClick={pickScreen} data-tip={labels.eyedropper ?? 'Pick from screen'}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m2 22 1-1h3l9-9" />
              <path d="M3 21v-3l9-9" />
              <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
            </svg>
          </button>
        )}
      </div>
      <div className="es-cp-label">{labels.palette ?? 'Palette'}</div>
      <div className="es-cp-swatches">
        {PALETTE.map((c) => (
          <button key={c} type="button" style={{ background: c }} aria-label={c} onClick={() => (setHsv(hexToHsv(c)), (last.current = c), onChange(c, true))} />
        ))}
      </div>
      {recent.length > 0 && (
        <>
          <div className="es-cp-label">{labels.recent ?? 'Recent'}</div>
          <div className="es-cp-swatches">
            {recent.map((c) => (
              <button key={c} type="button" style={{ background: c }} aria-label={c} onClick={() => (setHsv(hexToHsv(c)), (last.current = c), onChange(c, true))} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** A floating panel anchored next to an element; closes on outside click or Escape. */
export function Popover({ anchor, onClose, children, side = 'right' }: { anchor: HTMLElement; onClose: () => void; children: ReactNode; side?: 'right' | 'bottom' }) {
  const ref = useRef<HTMLDivElement>(null)
  const r = anchor.getBoundingClientRect()
  const [pos, setPos] = useState<{ left: number; top: number }>(side === 'right' ? { left: r.right + 8, top: r.top } : { left: r.left, top: r.bottom + 6 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const b = el.getBoundingClientRect()
    const left = Math.min(pos.left, window.innerWidth - b.width - 8)
    const top = Math.min(pos.top, window.innerHeight - b.height - 8)
    if (left !== pos.left || top !== pos.top) setPos({ left: Math.max(8, left), top: Math.max(8, top) })
  }, [pos])
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key)
    }
  }, [anchor, onClose])
  return createPortal(
    <div ref={ref} className="es-popover" style={pos}>
      {children}
    </div>,
    document.body
  )
}

/** A colour swatch button that opens a picker. */
export function ColorButton({
  value,
  onChange,
  recent,
  tip,
  size = 26,
  labels
}: {
  value: string
  onChange: (hex: string, final: boolean) => void
  recent?: string[]
  tip?: string
  size?: number
  labels?: ColorPickerProps['labels']
}) {
  const [open, setOpen] = useState<HTMLElement | null>(null)
  return (
    <>
      <button
        type="button"
        className="es-color-btn"
        style={{ width: size, height: size, background: value }}
        data-tip={tip}
        aria-label={tip}
        onClick={(e) => setOpen(open ? null : e.currentTarget)}
      />
      {open && (
        <Popover anchor={open} onClose={() => setOpen(null)} side="bottom">
          <ColorPicker value={value} onChange={onChange} recent={recent} labels={labels} />
        </Popover>
      )}
    </>
  )
}
