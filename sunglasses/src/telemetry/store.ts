import { GPS_TELEPORT_THRESHOLD_M, MAX_MS, SIGNALS, STAGES } from './constants'
import type { ApiEvent, DataSource, Latest, Point, SignalDef, SourceStatus, StageDef, TelemetryBatch, TelemetryState } from './types'

// ─── STATE ───────────────────────────────────────────────────────────────────
const initialHistory: Record<string, Point[]> = {}
const initialLatest: Record<string, Latest> = {}
SIGNALS.forEach(m => {
  initialHistory[m.field] = []
  initialLatest[m.field] = { value: null, prev: null }
})

const state: TelemetryState = {
  signals: [...SIGNALS],
  stages: [...STAGES],
  events: [],
  history: initialHistory,
  latest: initialLatest,
  gpsHistory: [],
  activeFields: [],
  dataSource: 'sim',
  sourceStatus: 'sim',
  selectedEvent: null,
  dataVersion: 0,
  nowMs: Date.now(),
}

// ─── SUBSCRIPTION ────────────────────────────────────────────────────────────
// Mutations write into `state`; `scheduleEmit` coalesces notifications to a
// microtask so a 38-signal tick produces exactly one React re-render. Each emit
// cycle bumps dataVersion so derived-data hooks can react to data arrival.
let snapshot: TelemetryState = { ...state }
const listeners = new Set<() => void>()
let emitScheduled = false

function bumpVersion() {
  state.dataVersion++
  state.nowMs = Date.now()
}

function scheduleEmit() {
  if (emitScheduled) return
  emitScheduled = true
  bumpVersion()
  queueMicrotask(() => {
    emitScheduled = false
    snapshot = { ...state }
    listeners.forEach(l => l())
  })
}

function notifyNow() {
  bumpVersion()
  snapshot = { ...state }
  listeners.forEach(l => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

// Stable between emits — safe for useSyncExternalStore.
function getSnapshot(): TelemetryState {
  return snapshot
}

// Direct read access for imperative renderers (canvas draw loops), which do
// not subscribe. Returns the live mutable state.
function getState(): TelemetryState {
  return state
}

// ─── DATA PIPELINE ───────────────────────────────────────────────────────────
function push(field: string, t: number, raw: number) {
  const m = state.signals.find(x => x.field === field)
  if (!m) return
  const v = m.transform ? m.transform(raw) : raw
  const h = state.history[field]
  if (!h) return
  if (h.length && t <= h[h.length - 1].t) {
    console.warn(`[push] non-increasing timestamp for "${field}": ${t} <= ${h[h.length - 1].t}, correcting to ${h[h.length - 1].t + 1}`)
    t = h[h.length - 1].t + 1
  }
  h.push({ t, v })
  const cut = Date.now() - MAX_MS
  while (h.length && h[0].t < cut) h.shift()

  const lat_ = state.latest[field]
  if (lat_) { lat_.prev = lat_.value; lat_.value = v }
  scheduleEmit()
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (x: number) => x * Math.PI / 180
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// GPS points flow to gpsHistory, consumed by the map tab (live marker + trace).
function pushGPS(t: number, lat: number, lon: number) {
  const gps = state.gpsHistory
  const prev = gps[gps.length - 1]
  if (prev && haversineMeters(prev.lat, prev.lon, lat, lon) > GPS_TELEPORT_THRESHOLD_M) {
    // Car teleported — wipe history and start fresh from new position
    gps.length = 0
  }
  if (gps.length && t <= gps[gps.length - 1].t) {
    console.warn(`[pushGPS] non-increasing timestamp: ${t} <= ${gps[gps.length - 1].t}, correcting to ${gps[gps.length - 1].t + 1}`)
    t = gps[gps.length - 1].t + 1
  }
  gps.push({ t, lat, lon })
  const cut = Date.now() - MAX_MS
  while (gps.length && gps[0].t < cut) gps.shift()
  scheduleEmit()
}

function ingest(data: TelemetryBatch) {
  const now = Date.now()
  state.signals.forEach(m => { if (data[m.field] !== undefined) push(m.field, now, data[m.field]!) })
  if (data.lat !== undefined && data.lon !== undefined) pushGPS(data.timestamp || now, data.lat, data.lon)
}

function flushHistory() {
  state.signals.forEach(m => {
    state.history[m.field] = []
    state.latest[m.field] = { value: null, prev: null }
  })
  state.gpsHistory.length = 0
  scheduleEmit()
}

// Raw writers used by the simulator's seedHistory, which bypasses the pipeline
// (fixed timestamps, no latest updates, no trimming).
function pushRawPoint(field: string, t: number, v: number) {
  const h = state.history[field]
  if (h) h.push({ t, v })
}

function pushRawGps(t: number, lat: number, lon: number) {
  state.gpsHistory.push({ t, lat, lon })
}

// ─── SIGNAL ADOPTION (car mode) ──────────────────────────────────────────────
function replaceSignals(newSignals: SignalDef[], newStages: StageDef[]) {
  state.signals = newSignals
  state.stages = newStages

  Object.keys(state.history).forEach(k => delete state.history[k])
  state.signals.forEach(m => {
    state.history[m.field] = []
    state.latest[m.field] = { value: null, prev: null }
  })
  scheduleEmit()
}

// ─── SOURCE STATE ────────────────────────────────────────────────────────────
function setDataSource(src: DataSource) {
  state.dataSource = src
  scheduleEmit()
}

function setSourceStatus(status: SourceStatus) {
  state.sourceStatus = status
  scheduleEmit()
}

function setSelectedEvent(eventName: string) {
  state.selectedEvent = eventName
  scheduleEmit()
}

function setEvents(events: ApiEvent[]) {
  state.events = [...events]
  scheduleEmit()
}

// ─── ACTIVE FIELDS ───────────────────────────────────────────────────────────
function setActiveFields(fields: string[]) {
  state.activeFields = [...fields].sort()
  scheduleEmit()
}

function toggleActiveField(field: string) {
  const set = new Set(state.activeFields)
  if (set.has(field)) set.delete(field)
  else set.add(field)
  state.activeFields = [...set].sort()
  scheduleEmit()
}

function clearActiveFields() {
  if (state.activeFields.length === 0) return
  state.activeFields = []
  scheduleEmit()
}

export {
  clearActiveFields,
  flushHistory,
  getSnapshot,
  getState,
  haversineMeters,
  ingest,
  notifyNow,
  push,
  pushGPS,
  pushRawGps,
  pushRawPoint,
  replaceSignals,
  setActiveFields,
  setDataSource,
  setEvents,
  setSelectedEvent,
  setSourceStatus,
  subscribe,
  toggleActiveField,
}
