import type { TextStyle } from './text'

/** One-click text looks (Text panel and the AI assistant). Values scale with the font size. */
export const STYLE_PRESETS: { id: string; font: string; weight: number; italic?: boolean; make: (s: TextStyle) => Partial<TextStyle> }[] = [
  {
    id: 'styleTitle',
    font: 'Montserrat',
    weight: 900,
    make: (s) => ({ font: 'Montserrat', weight: 900, italic: false, uppercase: false, fill: true, color: '#ffffff', strokeWidth: 0, shadowColor: '#000000', shadowBlur: Math.round(s.size * 0.18), shadowX: 0, shadowY: Math.round(s.size * 0.04), bgEnabled: false, letterSpacing: 0 })
  },
  {
    id: 'styleSubtitle',
    font: 'Poppins',
    weight: 400,
    make: (s) => ({ font: 'Poppins', weight: 400, italic: false, uppercase: true, fill: true, color: '#ffffff', strokeWidth: 0, shadowColor: '#000000', shadowBlur: Math.round(s.size * 0.1), shadowX: 0, shadowY: Math.round(s.size * 0.02), bgEnabled: false, letterSpacing: Math.round(s.size * 0.08) })
  },
  {
    id: 'styleHand',
    font: 'Pacifico',
    weight: 400,
    make: (s) => ({ font: 'Pacifico', weight: 400, italic: false, uppercase: false, fill: true, color: '#ffffff', strokeWidth: 0, shadowColor: '#000000', shadowBlur: Math.round(s.size * 0.12), shadowX: 0, shadowY: Math.round(s.size * 0.03), bgEnabled: false, letterSpacing: 0 })
  },
  {
    id: 'styleNeon',
    font: 'Montserrat',
    weight: 700,
    make: (s) => ({ font: 'Montserrat', weight: 700, italic: false, uppercase: false, fill: true, color: '#ffe8fb', strokeWidth: 0, shadowColor: '#ff2fd0', shadowBlur: Math.round(s.size * 0.35), shadowX: 0, shadowY: 0, bgEnabled: false, letterSpacing: Math.round(s.size * 0.02) })
  },
  {
    id: 'styleOutline',
    font: 'Anton',
    weight: 400,
    make: (s) => ({ font: 'Anton', weight: 400, italic: false, uppercase: true, fill: false, strokeColor: '#ffffff', strokeWidth: Math.max(2, Math.round(s.size * 0.035)), shadowBlur: 0, shadowX: 0, shadowY: 0, bgEnabled: false, letterSpacing: Math.round(s.size * 0.03) })
  },
  {
    id: 'styleLabel',
    font: 'Poppins',
    weight: 700,
    make: (s) => ({ font: 'Poppins', weight: 700, italic: false, uppercase: false, fill: true, color: '#ffffff', strokeWidth: 0, shadowBlur: 0, shadowX: 0, shadowY: 0, bgEnabled: true, bgColor: '#7b6bff', bgRadius: Math.round(s.size * 0.6), bgPadding: Math.round(s.size * 0.35), letterSpacing: 0 })
  },
  {
    id: 'styleClassic',
    font: 'Playfair Display',
    weight: 400,
    italic: true,
    make: (s) => ({ font: 'Playfair Display', weight: 400, italic: true, uppercase: false, fill: true, color: '#ffffff', strokeWidth: 0, shadowColor: '#000000', shadowBlur: Math.round(s.size * 0.08), shadowX: 0, shadowY: Math.round(s.size * 0.02), bgEnabled: false, letterSpacing: 0 })
  },
  {
    id: 'styleMeme',
    font: 'Anton',
    weight: 400,
    make: (s) => ({ font: 'Anton', weight: 400, italic: false, uppercase: true, fill: true, color: '#ffffff', strokeColor: '#000000', strokeWidth: Math.max(2, Math.round(s.size * 0.06)), shadowBlur: 0, shadowX: 0, shadowY: 0, bgEnabled: false, letterSpacing: 0 })
  }
]
