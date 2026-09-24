import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { Segmented } from '@easystudio/ui'

export const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'ro', label: 'Română' }
] as const

/** English / Română switch (the choice is remembered). */
export function LanguageSwitch() {
  const { i18n } = useTranslation()
  return (
    <div className="lang-switch">
      <Languages size={15} />
      <Segmented<string> value={i18n.language} onChange={(l) => void i18n.changeLanguage(l)} options={LANGUAGES.map((l) => ({ ...l }))} />
    </div>
  )
}
