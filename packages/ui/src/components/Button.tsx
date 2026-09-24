import type { ButtonHTMLAttributes, ReactNode } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'outline' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: boolean
  active?: boolean
  tip?: string
  tipPos?: 'top' | 'bottom' | 'left' | 'right'
  children?: ReactNode
}

export function Button({ variant = 'default', size = 'md', icon, active, tip, tipPos, className, ...rest }: ButtonProps) {
  const cls = ['es-btn', variant !== 'default' && variant, size !== 'md' && size, icon && 'icon', active && 'active', className]
    .filter(Boolean)
    .join(' ')
  return <button type="button" className={cls} data-tip={tip} data-tip-pos={tip ? tipPos : undefined} aria-label={tip} {...rest} />
}
