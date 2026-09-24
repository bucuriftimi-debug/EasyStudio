import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, RotateCcw, Sparkles } from 'lucide-react'
import { Button, Slider } from '@easystudio/ui'
import { ADJUSTMENTS, type AdjustGroup } from '@easystudio/gpu'
import * as A from '../state/actions'
import { activeLayer } from '../state/docOps'
import { beginGesture, endGesture, useDoc, useEditor } from '../state/store'

const GROUPS: AdjustGroup[] = ['light', 'color', 'effects']

export function AdjustPanel() {
  const { t } = useTranslation()
  const doc = useDoc()
  const mode = useEditor((s) => s.mode)
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const layer = doc ? activeLayer(doc) : undefined
  if (!layer) return <p className="empty">{t('adjust.noLayer')}</p>
  const hasChanges = Object.keys(layer.adjust).length > 0 || !!layer.look

  return (
    <div className="adjust">
      <div className="panel-head">
        <span className="panel-sub">{t('adjust.editing', { name: layer.name })}</span>
      </div>
      <div className="adjust-actions">
        <Button variant="outline" size="sm" tip={t('adjust.autoTip')} onClick={A.applyAuto}>
          <Sparkles size={14} /> {t('adjust.auto')}
        </Button>
        <Button variant="ghost" size="sm" tip={t('adjust.resetTip')} disabled={!hasChanges} onClick={A.resetAdjustments}>
          <RotateCcw size={14} /> {t('adjust.resetAll')}
        </Button>
      </div>

      {GROUPS.map((g) => {
        const defs = ADJUSTMENTS.filter((d) => d.group === g && (mode === 'pro' || d.simple))
        if (!defs.length) return null
        return (
          <section key={g} className="group">
            <button type="button" className="group-head" onClick={() => setClosed((c) => ({ ...c, [g]: !c[g] }))}>
              <span>{t(`adjust.${g}`)}</span>
              <ChevronDown size={15} className={closed[g] ? 'rot' : ''} />
            </button>
            {!closed[g] &&
              defs.map((d) => (
                <Slider
                  key={d.key}
                  label={t(`adjust.${d.key}`)}
                  min={d.min}
                  max={d.max}
                  value={layer.adjust[d.key] ?? 0}
                  onStart={beginGesture}
                  onChange={(v) => A.setAdjust(d.key, v)}
                  onCommit={() => endGesture(t(`adjust.${d.key}`))}
                />
              ))}
          </section>
        )
      })}
      {mode === 'simple' && <p className="hint-box">{t('adjust.proHint')}</p>}
    </div>
  )
}
