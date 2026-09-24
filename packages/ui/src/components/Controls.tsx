import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface SegmentedProps<T extends string> {
  value: T
  options: { value: T; label: ReactNode; tip?: string }[]
  onChange: (v: T) => void
  accent?: boolean
}

export function Segmented<T extends string>({ value, options, onChange, accent }: SegmentedProps<T>) {
  return (
    <div className={`es-seg${accent ? ' accent' : ''}`} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : ''}
          data-tip={o.tip}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <label className="es-switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <i />
      {label}
    </label>
  )
}

export interface ModalProps {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}

export function Modal({ title, onClose, children, footer, width }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return createPortal(
    <div className="es-modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="es-modal" style={width ? { width } : undefined} role="dialog" aria-modal="true">
        <div className="es-modal-head">
          <h2>{title}</h2>
        </div>
        <div className="es-modal-body">{children}</div>
        {footer && <div className="es-modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}

export interface MenuItem {
  label?: string
  icon?: ReactNode
  kbd?: string
  disabled?: boolean
  onClick?: () => void
  separator?: boolean
}

/** Dropdown menu anchored under an element. Closes on outside click / Escape. */
export function Menu({ anchor, items, onClose }: { anchor: HTMLElement; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const r = anchor.getBoundingClientRect()
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
    <div ref={ref} className="es-menu" style={{ left: r.left, top: r.bottom + 4 }} role="menu">
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="es-menu-sep" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            className="es-menu-item"
            disabled={it.disabled}
            onClick={() => {
              onClose()
              it.onClick?.()
            }}
          >
            {it.icon}
            <span>{it.label}</span>
            {it.kbd && <span className="es-menu-kbd">{it.kbd}</span>}
          </button>
        )
      )}
    </div>,
    document.body
  )
}
