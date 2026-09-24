import { useEffect, useState, type CSSProperties } from 'react'

export interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  /** Value restored by double-click. */
  defaultValue?: number
  unit?: string
  onChange: (v: number) => void
  /** Pointer down: start of a drag gesture (used to group undo steps). */
  onStart?: () => void
  /** Pointer up / keyboard commit: end of the gesture. */
  onCommit?: (v: number) => void
}

export function Slider({ label, value, min, max, step = 1, defaultValue = 0, unit = '', onChange, onStart, onCommit }: SliderProps) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])

  const pos = (v: number) => ((v - min) / (max - min)) * 100
  const origin = min < 0 && max > 0 ? pos(0) : pos(min)
  const cur = pos(value)
  const style = {
    '--fill-from': `${Math.min(origin, cur)}%`,
    '--fill-to': `${Math.max(origin, cur)}%`
  } as CSSProperties

  const commitText = () => {
    const n = Number(text.replace(',', '.'))
    if (Number.isFinite(n)) {
      const v = Math.max(min, Math.min(max, Math.round(n / step) * step))
      onStart?.()
      onChange(v)
      onCommit?.(v)
    } else setText(String(value))
  }

  return (
    <div className={`es-slider${value !== defaultValue ? ' changed' : ''}`}>
      <span className="es-slider-label" onDoubleClick={() => (onStart?.(), onChange(defaultValue), onCommit?.(defaultValue))}>
        {label}
      </span>
      <input
        className="es-slider-value"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') {
            setText(String(value))
            ;(e.target as HTMLInputElement).blur()
          }
          e.stopPropagation()
        }}
        aria-label={`${label} value${unit ? ` (${unit})` : ''}`}
      />
      <input
        className="es-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={style}
        onPointerDown={(e) => {
          onStart?.()
          // The pointer may be released outside the slider: listen on the window.
          const input = e.currentTarget
          const up = () => {
            window.removeEventListener('pointerup', up, true)
            onCommit?.(Number(input.value))
          }
          window.addEventListener('pointerup', up, true)
        }}
        onKeyDown={(e) => {
          if (e.key.startsWith('Arrow') || e.key === 'PageUp' || e.key === 'PageDown' || e.key === 'Home' || e.key === 'End') onStart?.()
          e.stopPropagation()
        }}
        onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        onDoubleClick={() => (onStart?.(), onChange(defaultValue), onCommit?.(defaultValue))}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </div>
  )
}
