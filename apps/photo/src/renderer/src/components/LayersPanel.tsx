import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, ImagePlus, Plus, Trash2, Type, VenetianMask, Brush, X } from 'lucide-react'
import { Button, Slider } from '@easystudio/ui'
import { BLEND_MODES, type BlendMode } from '@easystudio/gpu'
import * as A from '../state/actions'
import { activeLayer } from '../state/docOps'
import { composeBitmap, getBitmap } from '../state/bitmaps'
import { beginGesture, endGesture, useDoc, useEditor } from '../state/store'
import type { Layer } from '../state/types'
import { SHAPE_ICONS } from './ToolOptions'

const thumbCache = new Map<string, string>()

function bitmapThumb(bitmapId: string, onBlack = false): string {
  const key = `${bitmapId}${onBlack ? ':m' : ''}`
  const hit = thumbCache.get(key)
  if (hit) return hit
  const bm = getBitmap(bitmapId)
  if (!bm) return ''
  const k = 44 / Math.max(bm.width, bm.height)
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bm.width * k))
  c.height = Math.max(1, Math.round(bm.height * k))
  const ctx = c.getContext('2d')!
  if (onBlack) {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, c.width, c.height)
  }
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(composeBitmap(bm), 0, 0, c.width, c.height)
  const url = c.toDataURL('image/png')
  thumbCache.set(key, url)
  if (thumbCache.size > 200) thumbCache.delete(thumbCache.keys().next().value!)
  return url
}

export function LayersPanel() {
  const { t } = useTranslation()
  const doc = useDoc()
  const mode = useEditor((s) => s.mode)
  if (!doc) return null
  const act = activeLayer(doc)
  const list = [...doc.layers].reverse()
  const idx = act ? doc.layers.indexOf(act) : -1

  return (
    <div className="layers">
      {act && (
        <div className="layer-props">
          {mode === 'pro' && (
            <label className="es-field">
              <span>{t('layers.blend')}</span>
              <select
                className="es-select"
                value={act.blend}
                onChange={(e) => A.setLayerProp(act.id, 'blend', e.target.value as BlendMode, t('history.blend'))}
              >
                {BLEND_MODES.map((b) => (
                  <option key={b} value={b}>
                    {t(`blend.${b}`)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Slider
            label={t('layers.opacity')}
            min={0}
            max={100}
            defaultValue={100}
            value={act.opacity}
            unit="%"
            onStart={beginGesture}
            onChange={(v) => A.setLayerProp(act.id, 'opacity', v, t('history.opacity'), true)}
            onCommit={() => endGesture(t('history.opacity'))}
          />
        </div>
      )}

      <ul className="layer-list">
        {list.map((l) => (
          <LayerRow key={l.id} layer={l} active={l.id === act?.id} />
        ))}
      </ul>

      <div className="layer-tools">
        <Button size="sm" variant="ghost" icon tip={t('layers.add')} onClick={() => void A.addImageLayerDialog()}>
          <ImagePlus size={15} />
        </Button>
        <Button size="sm" variant="ghost" icon tip={t('menu.addText')} onClick={() => A.addText()}>
          <Type size={15} />
        </Button>
        <Button size="sm" variant="ghost" icon tip={t('layers.new')} onClick={A.newEmptyLayer}>
          <Plus size={15} />
        </Button>
        <Button size="sm" variant="ghost" icon tip={t('layers.duplicate')} disabled={!act} onClick={A.duplicateActive}>
          <Copy size={15} />
        </Button>
        {mode === 'pro' && (
          <Button size="sm" variant="ghost" icon tip={t('layers.addMask')} disabled={!act || !!act.mask} onClick={A.addMask}>
            <VenetianMask size={15} />
          </Button>
        )}
        {act && act.type !== 'raster' && (
          <Button size="sm" variant="ghost" icon tip={t('layers.rasterize')} onClick={A.rasterizeActive}>
            <Brush size={15} />
          </Button>
        )}
        <Button size="sm" variant="ghost" icon tip={t('layers.up')} disabled={!act || idx >= doc.layers.length - 1} onClick={() => A.moveActive(1)}>
          <ArrowUp size={15} />
        </Button>
        <Button size="sm" variant="ghost" icon tip={t('layers.down')} disabled={!act || idx <= 0} onClick={() => A.moveActive(-1)}>
          <ArrowDown size={15} />
        </Button>
        <div className="spacer" />
        <Button size="sm" variant="danger" icon tip={t('layers.delete')} disabled={!act} onClick={A.deleteActive}>
          <Trash2 size={15} />
        </Button>
      </div>
    </div>
  )
}

function LayerThumb({ layer }: { layer: Layer }) {
  if (layer.type === 'raster') return <img src={bitmapThumb(layer.bitmapId)} alt="" draggable={false} />
  if (layer.type === 'text')
    return (
      <span className="thumb-glyph" style={{ fontFamily: `"${layer.style.font}"`, color: layer.style.fill ? layer.style.color : layer.style.strokeColor }}>
        T
      </span>
    )
  return (
    <span className="thumb-glyph" style={{ color: layer.shape.fillEnabled ? layer.shape.fill : layer.shape.stroke }}>
      {SHAPE_ICONS[layer.shape.kind]}
    </span>
  )
}

function LayerRow({ layer, active }: { layer: Layer; active: boolean }) {
  const { t } = useTranslation()
  const editMask = useEditor((s) => s.editMask)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(layer.name)
  const finish = () => {
    setEditing(false)
    const n = name.trim()
    if (n && n !== layer.name) A.setLayerProp(layer.id, 'name', n, t('history.rename'))
    else setName(layer.name)
  }
  const onMask = active && editMask && !!layer.mask
  return (
    <li className={`layer-row${active ? ' on' : ''}${layer.visible ? '' : ' hidden'}`} onPointerDown={() => A.selectLayer(layer.id)}>
      <button
        type="button"
        className="eye"
        data-tip={layer.visible ? t('layers.hide') : t('layers.show')}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => A.setLayerProp(layer.id, 'visible', !layer.visible, t('history.visibility'))}
      >
        {layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}
      </button>
      <span className={`layer-thumb${active && !onMask && layer.mask ? ' target' : ''}`} onPointerDown={() => useEditor.setState({ editMask: false })}>
        <LayerThumb layer={layer} />
      </span>
      {layer.mask && (
        <span
          className={`layer-thumb mask-thumb${onMask ? ' target' : ''}${layer.mask.enabled ? '' : ' off'}`}
          data-tip={layer.mask.enabled ? t('layers.maskEdit') : t('layers.maskOff')}
          onPointerDown={(e) => {
            if (e.shiftKey) {
              e.stopPropagation()
              A.selectLayer(layer.id)
              A.toggleMask()
              return
            }
            useEditor.setState({ editMask: true })
          }}
        >
          <img src={bitmapThumb(layer.mask.bitmapId, true)} alt="" draggable={false} />
        </span>
      )}
      {editing ? (
        <input
          className="es-input layer-name-input"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={finish}
          onKeyDown={(e) => {
            if (e.key === 'Enter') finish()
            if (e.key === 'Escape') {
              setName(layer.name)
              setEditing(false)
            }
            e.stopPropagation()
          }}
        />
      ) : (
        <span className="layer-name" title={t('layers.rename')} onDoubleClick={() => (setName(layer.name), setEditing(true))}>
          {layer.type === 'text' && layer.name === t('layers.text') ? layer.style.text.split('\n')[0].slice(0, 32) || layer.name : layer.name}
          {onMask && <small className="layer-sub">{t('layers.editingMask')}</small>}
        </span>
      )}
      {(layer.opacity < 100 || layer.blend !== 'normal') && (
        <span className="layer-badge">{layer.blend !== 'normal' ? t(`blend.${layer.blend}`) : `${layer.opacity}%`}</span>
      )}
      {layer.mask && active && (
        <button
          type="button"
          className="eye"
          data-tip={t('menu.deleteMask')}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={A.deleteMask}
        >
          <X size={14} />
        </button>
      )}
    </li>
  )
}
