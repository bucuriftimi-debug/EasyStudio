import { useEffect, useState } from 'react'

export function NumberField({
  label,
  value,
  min,
  max,
  suffix,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  suffix?: string
  onChange: (v: number) => void
}) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const commit = (s: string) => {
    const n = Math.round(Number(s))
    if (Number.isFinite(n) && n >= min) onChange(Math.min(max, n))
  }
  return (
    <label className="es-field num-field">
      <span>{label}</span>
      <div className="num-wrap">
        <input
          className="es-input"
          type="number"
          min={min}
          max={max}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            commit(e.target.value)
          }}
          onBlur={() => setText(String(value))}
        />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  )
}
