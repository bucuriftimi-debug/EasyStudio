import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Slider } from '@easystudio/ui'
import { LOOKS, toEffectParams } from '@easystudio/gpu'
import * as A from '../state/actions'
import { activeLayer } from '../state/docOps'
import { beginGesture, endGesture, useDoc } from '../state/store'
import { getRenderer, syncSources } from '../gpuHost'
import { layerSource } from '../state/gen'

const OPTIONS = [{ id: null as string | null, label: 'look.none' }, ...LOOKS.map((l) => ({ id: l.id as string | null, label: l.label }))]

function pixelsToUrl(data: Uint8Array<ArrayBuffer>, w: number, h: number): string {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data.buffer), w, h), 0, 0)
  return c.toDataURL('image/jpeg', 0.85)
}

export function FiltersPanel() {
  const { t } = useTranslation()
  const doc = useDoc()
  const layer = doc ? activeLayer(doc) : undefined
  const [thumbs, setThumbs] = useState<string[]>([])
  const adjustKey = layer ? JSON.stringify(layer.adjust) : ''
  const sourceId = layer ? layerSource(layer).id : ''

  // Render one preview per filter on the GPU (debounced while sliders move).
  useEffect(() => {
    if (!layer || !doc) return
    const id = setTimeout(() => {
      const r = getRenderer()
      if (!r) return
      syncSources(r, doc)
      const list = OPTIONS.map((o) => toEffectParams(layer.adjust, o.id, 100))
      const px = r.renderPreviews(sourceId, list, 150)
      setThumbs(px.map((p) => pixelsToUrl(p.data, p.w, p.h)))
    }, 120)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, adjustKey])

  if (!layer) return <p className="empty">{t('adjust.noLayer')}</p>
  const current = layer.look?.id ?? null

  return (
    <div className="filters">
      <div className="look-grid">
        {OPTIONS.map((o, i) => (
          <button key={o.id ?? 'none'} type="button" className={`look${current === o.id ? ' on' : ''}`} onClick={() => A.setLook(o.id)}>
            <span className="look-img">{thumbs[i] ? <img src={thumbs[i]} alt="" draggable={false} /> : <i />}</span>
            <span className="look-name">{t(o.label)}</span>
          </button>
        ))}
      </div>
      {layer.look && (
        <div className="look-amount">
          <Slider
            label={t('look.strength')}
            min={0}
            max={100}
            defaultValue={100}
            value={layer.look.amount}
            unit="%"
            onStart={beginGesture}
            onChange={A.setLookAmount}
            onCommit={() => endGesture(t('history.lookAmount'))}
          />
        </div>
      )}
      <p className="hint-box">{t('look.hint')}</p>
    </div>
  )
}
