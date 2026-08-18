import { API_BASE_URL, PALETTE, SIGNALS } from './constants'
import { getState, push, pushGPS, replaceSignals, setEvents, setSelectedEvent, setSourceStatus } from './store'
import type { ApiEvent, ApiSignal, SignalDef, StageDef, StreamBatch, StreamGps } from './types'

function assignColors(signals: ApiSignal[]): Record<string, string> {
  const sources = [...new Set(signals.map(s => s.source).filter((s): s is string => Boolean(s)))]
  const map: Record<string, string> = {}
  sources.forEach((src, i) => { map[src] = PALETTE[i % PALETTE.length] })
  return map
}

function apiSignalToSignal(s: ApiSignal, colorMap: Record<string, string>): SignalDef {
  const src = s.source || ''
  const known = SIGNALS.find(sig => sig.field === s.name)
  return {
    key: known ? known.key : s.name.replace(/^[A-Z]/, c => c.toLowerCase()),
    field: s.name,
    stage: src.toLowerCase(),
    label: s.name,
    unit: s.unit || '',
    color: colorMap[src] || PALETTE[0],
    decimals: 1,
    // Nominal defaults for dynamically-adopted car signals — real ranges aren't
    // known until data arrives. PlotCanvas zooms into the visible data and
    // widens the domain when values exceed these bounds, so a 90 V pack still
    // plots correctly despite the 0..1 default.
    yMin: 0,
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
  const src = getState().dataSource
  const events = await fetchEvents()
  setEvents(events)
  if (getState().dataSource !== src) return // switched source mid-flight — ignore stale result
  const { selectedEvent } = getState()
  if (events.length === 1) {
    onEventSelected(events[0].name)
  } else if (selectedEvent && events.some(e => e.name === selectedEvent)) {
    // Returning to Car mode: reconnect the previously selected event so the
    // stream resumes without the user having to re-pick it in the dropdown.
    onEventSelected(selectedEvent)
  } else if (selectedEvent && !events.some(e => e.name === selectedEvent)) {
    setSelectedEvent('') // remembered event no longer available — reset picker
  }
}

// Monotonic token so a slower, stale fetchSignals never clobbers a newer event
// selection (or a different source) that happened while it was in flight.
let eventSelectionSeq = 0

async function onEventSelected(eventName: string) {
  const src = getState().dataSource
  const seq = ++eventSelectionSeq
  console.log('Selected event:', eventName)
  if (!eventName) return
  const apiSignals = await fetchSignals(eventName)
  if (getState().dataSource !== src || seq !== eventSelectionSeq) return
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
// No client-side backfill: EventSource reconnects automatically and sends the
// server's last `id:` as Last-Event-ID, so the stream resumes without gaps or
// duplicates. Revisit only if real-car testing shows missed data on reconnect.

let telemetrySource: EventSource | null = null

// GPS coordinates may arrive either inside a `data` batch as lat/lon keys, or on
// a dedicated `gps` SSE event. Both are routed to GPS history (consumed by the
// map tab), not the signal pipeline. Shape confirmed against real Sunbeam
// output during first live-car test; both formats are handled defensively.
const GPS_KEYS = ['lat', 'lon']

function extractGps(batch: StreamBatch): Array<{ t: number; lat: number; lon: number }> {
  const lat = batch['lat']
  const lon = batch['lon']
  if (!lat || !lon) return []
  const n = Math.min(lat.timestamps.length, lat.values.length, lon.timestamps.length, lon.values.length)
  const out: Array<{ t: number; lat: number; lon: number }> = []
  for (let i = 0; i < n; i++) out.push({ t: lat.timestamps[i], lat: lat.values[i], lon: lon.values[i] })
  return out
}

function pushStreamBatch(batch: StreamBatch) {
  extractGps(batch).forEach(g => pushGPS(g.t, g.lat, g.lon))
  for (const field of Object.keys(batch)) {
    if (GPS_KEYS.includes(field)) continue
    const { timestamps, values } = batch[field]
    for (let i = 0; i < timestamps.length; i++) push(field, timestamps[i], values[i])
  }
}

function disconnectStream() {
  if (telemetrySource) { telemetrySource.close(); telemetrySource = null }
}

function connectStream() {
  disconnectStream()
  const { signals, selectedEvent } = getState()
  const names = signals.map(m => m.field)
  if (!names.length) return                             // signals= is required (422 if empty)
  // Every manifest field is subscribed, which includes LapIndex when the event
  // provides it — that's what lap-based tabs rely on for real data now that
  // LapIndexSpreadsheet is gone.

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
    pushStreamBatch(batch)
    if (getState().sourceStatus !== 'live') setSourceStatus('live')
  })

  source.addEventListener('gps', (e) => {
    const g = JSON.parse((e as MessageEvent<string>).data) as StreamGps
    if (!g.timestamps || !g.lat || !g.lon) return
    const n = Math.min(g.timestamps.length, g.lat.length, g.lon.length)
    for (let i = 0; i < n; i++) pushGPS(g.timestamps[i], g.lat[i], g.lon[i])
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
  extractGps,
  fetchEvents,
  fetchSignals,
  loadEvents,
  onEventSelected,
  pushStreamBatch,
}
