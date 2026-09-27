import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Scissors } from 'lucide-react'
import { Button, Modal, Slider } from '@easystudio/ui'
import { canUseFree, spendFreeUse } from '@easystudio/license'
import { clipLoudness, LOUDNESS_STEP } from '../engine/loudness'
import * as E from '../state/editor'
import { cutPauses, DEFAULT_PAUSES, removedSeconds, speechRanges } from '../state/pauses'
import * as P from '../state/project'
import { toast } from '../state/store'

/** Free version: one clip a day. */
const FREE_PAUSES_PER_DAY = 1

/** "Cut out pauses" for one clip: measure, preview how much goes, apply as one undo step. */
export function PausesDialog({ clip, onClose }: { clip: P.Clip; onClose: () => void }) {
  const { t } = useTranslation()
  const [db, setDb] = useState<Float32Array | null>(null)
  const [sensitivity, setSensitivity] = useState(Math.round(DEFAULT_PAUSES.sensitivity * 100))
  const [minPause, setMinPause] = useState(DEFAULT_PAUSES.minPause)
  useEffect(() => {
    let alive = true
    void clipLoudness(clip).then((d) => alive && setDb(d))
    return () => {
      alive = false
    }
  }, [clip])
  const opts = { ...DEFAULT_PAUSES, sensitivity: sensitivity / 100, minPause }
  const ranges = useMemo(() => (db ? speechRanges(db, LOUDNESS_STEP, opts) : []), [db, sensitivity, minPause]) // eslint-disable-line react-hooks/exhaustive-deps
  const dur = P.clipDur(clip)
  const removed = removedSeconds(ranges, dur)
  const pauses = Math.max(0, ranges.length - 1) + (ranges[0]?.[0] > 0.05 ? 1 : 0) + (ranges.length && dur - ranges[ranges.length - 1][1] > 0.05 ? 1 : 0)

  const apply = () => {
    if (!canUseFree('pauses', FREE_PAUSES_PER_DAY, t('pauses.title'))) return
    E.commit(t('hist.pauses'), (p) => cutPauses(p, clip.id, ranges))
    spendFreeUse('pauses', FREE_PAUSES_PER_DAY)
    toast(t('pauses.done', { count: pauses, sec: removed.toFixed(1) }), 'success', 5000)
    onClose()
  }

  return (
    <Modal
      title={t('pauses.title')}
      onClose={onClose}
      width={480}
      footer={
        <>
          <div className="spacer" />
          <Button onClick={onClose}>{t('exp.cancel')}</Button>
          <Button variant="primary" disabled={!db || !ranges.length || removed < 0.1} onClick={apply}>
            <Scissors size={15} /> {t('pauses.apply')}
          </Button>
        </>
      }
    >
      <div className="exp-form">
        <p className="insp-hint">{t('pauses.intro')}</p>
        <div className="pause-strip">
          {db &&
            ranges.map(([a, b], i) => <i key={i} style={{ left: `${(a / dur) * 100}%`, width: `${((b - a) / dur) * 100}%` }} />)}
        </div>
        <Slider label={t('pauses.sensitivity')} min={0} max={100} defaultValue={Math.round(DEFAULT_PAUSES.sensitivity * 100)} value={sensitivity} unit="%" onChange={setSensitivity} />
        <Slider label={t('pauses.minPause')} min={0.3} max={2} step={0.1} defaultValue={DEFAULT_PAUSES.minPause} value={minPause} unit=" s" onChange={setMinPause} />
        <div className="exp-summary">
          <span>{db ? t('pauses.found', { count: pauses }) : t('pauses.measuring')}</span>
          <strong>{db ? t('pauses.shorter', { sec: removed.toFixed(1) }) : ''}</strong>
        </div>
      </div>
    </Modal>
  )
}
