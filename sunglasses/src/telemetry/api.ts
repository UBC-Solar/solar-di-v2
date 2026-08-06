import { API_BASE_URL, PALETTE } from './constants'
import { getState, push, replaceSignals, setSelectedEvent, setSourceStatus } from './store'
import type { ApiEvent, ApiSignal, SignalDef, StageDef, StreamBatch } from './types'

function assignColors(signals: ApiSignal[]): Record<string, string> {
  const sources = [...new Set(signals.map(s => s.source).filter((s): s is string => Boolean(s)))]
  const map: Record<string, string> = {}
  sources.forEach((src, i) => { map[src] = PALETTE[i % PALETTE.length] })
  return map
}

function apiSignalToSignal(s: ApiSignal, colorMap: Record<string, string>): SignalDef {
  const src = s.source || ''
  return {
    field: s.name,
    stage: src.toLowerCase(),
    label: s.name,
    unit: s.unit || '',
    color: colorMap[src] || PALETTE[0],
    decimals: 1,
    yMin: 0, // TODO: GRAPHING YAXIS ISSUE
    yMax: 1,
    help: src ? `Source: ${src}` : '',
  }
}

async function fetchEvents(): Promise<ApiEvent[]> {
  const res = await fetch(`${API_BASE_URL}/events`)
  return res.ok ? await res.json() : []
}

async function fetchSignals(eventName: string): Promise<ApiSignal[]> {
  const res = await fetch(`${API_BASE_URL}/events/${encodeURIComponent(eventName)}/signals`)
  return res.ok ? await res.json() : []
}

async function loadEvents() {
  const events = await fetchEvents()
  if (events.length === 1) onEventSelected(events[0].name)
}

async function onEventSelected(eventName: string) {
  console.log('Selected event:', eventName)
  if (!eventName) return
  const apiSignals = await fetchSignals(eventName)
  console.log('Signals returned:', apiSignals)
  if (!apiSignals.length) return

  const colorMap = assignColors(apiSignals)
  const newSignals = apiSignals.map(s => apiSignalToSignal(s, colorMap))
  const newStages: StageDef[] = Object.keys(colorMap).map(src => ({
    id: src.toLowerCase(),
    label: src,
    color: colorMap[src],
  }))

  replaceSignals(newSignals, newStages)
  setSelectedEvent(eventName)
  connectStream()
}

// ─── LIVE STREAM (SSE) ───────────────────────────────────────────────────────
//TODO: integrate backfilling?

let telemetrySource: EventSource | null = null

function disconnectStream() {
  if (telemetrySource) { telemetrySource.close(); telemetrySource = null }
}

function connectStream() {
  disconnectStream()
  const { signals, selectedEvent } = getState()
  const names = signals.map(m => m.field)
  if (!names.length) return                             // signals= is required (422 if empty)

  const url = `${API_BASE_URL}/events/${encodeURIComponent(selectedEvent ?? '')}/data/stream?signals=${names.join(',')}`
  const source = new EventSource(url)
  telemetrySource = source

  source.addEventListener('meta', (e) => {
    // Sent exactly once. signal_id/unit/frequency per signal — you already got
    // units from GET /events/{event}/signals, so this is a sanity check.
    console.log('[stream] meta', JSON.parse((e as MessageEvent<string>).data))
  })

  source.addEventListener('data', (e) => {
    const batch = JSON.parse((e as MessageEvent<string>).data) as StreamBatch
    // Every subscribed signal is always present (empty arrays if nothing new).
    for (const field of Object.keys(batch)) {
      const { timestamps, values } = batch[field]
      for (let i = 0; i < timestamps.length; i++) push(field, timestamps[i], values[i])
    }
    if (getState().sourceStatus !== 'live') setSourceStatus('live')
  })

  source.onerror = () => {
    // Do NOT write reconnect logic. EventSource retries automatically and sends
    // the last id: back as Last-Event-ID; the server resumes with no gaps/dupes.
    if (getState().sourceStatus !== 'standby') setSourceStatus('connecting')
  }
}

export {
  assignColors,
  apiSignalToSignal,
  connectStream,
  disconnectStream,
  fetchEvents,
  fetchSignals,
  loadEvents,
  onEventSelected,
}
