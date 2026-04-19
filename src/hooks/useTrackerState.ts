import { useState, useEffect } from 'react'
import type { MutableRefObject } from 'react'
import { getTrackerByChannelId, getTrackerFields } from '../db/trackers'
import { ALL_MESSAGES_ID, SCRATCH_ID, ALBUM_ID } from '../types'
import type { Tracker, TrackerField } from '../types'

export function useTrackerState(
  channelId: number | null,
  isFrontLogChannel: boolean,
  pendingOpenRef: MutableRefObject<'record' | 'report' | null>
) {
  const [tracker, setTracker] = useState<Tracker | null>(null)
  const [trackerFields, setTrackerFields] = useState<TrackerField[]>([])
  const [showRecordForm, setShowRecordForm] = useState(false)
  const [showReport, setShowReport] = useState(false)

  useEffect(() => {
    if (!channelId || channelId === ALL_MESSAGES_ID || channelId === SCRATCH_ID || channelId === ALBUM_ID) {
      setTracker(null); setTrackerFields([]); setShowRecordForm(false); setShowReport(false); return
    }
    if (isFrontLogChannel) {
      setTracker(null); setTrackerFields([]); setShowRecordForm(false); return
    }
    getTrackerByChannelId(channelId).then(async tr => {
      setTracker(tr)
      if (tr) {
        setTrackerFields(await getTrackerFields(tr.id))
        const pending = pendingOpenRef.current
        pendingOpenRef.current = null
        if (pending === 'record') { setShowRecordForm(true); setShowReport(false) }
        else if (pending === 'report') { setShowReport(true); setShowRecordForm(false) }
        else { setShowRecordForm(false); setShowReport(false) }
      } else {
        setTrackerFields([])
        setShowRecordForm(false)
        setShowReport(false)
        pendingOpenRef.current = null
      }
    })
  }, [channelId, isFrontLogChannel])

  return { tracker, trackerFields, showRecordForm, setShowRecordForm, showReport, setShowReport }
}
