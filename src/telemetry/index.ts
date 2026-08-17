import { useSyncExternalStore } from 'react'
import {
  connectStream,
  disconnectStream,
  fetchEvents,
  fetchSignals,
  loadEvents,
  onEventSelected,
} from './api'
import { SIGNALS, STAGES } from './constants'
import { ensureSeeded, seedHistory, startSim, stopSim } from './sim'
import {
  clearActiveFields,
  flushHistory,
  getSnapshot,
  getState,
  ingest,
  push,
  pushGPS,
  replaceSignals,
  setActiveFields,
  setDataSource,
  setEvents,
  setSourceStatus,
  subscribe,
  toggleActiveField,
} from './store'
import type { ApiEvent, DataSource, GpsPoint, Latest, SignalDef, StageDef, TelemetryState } from './types'

// ─── REACT HOOKS ─────────────────────────────────────────────────────────────
// Subscribe to the singleton store. Re-renders at most once per emit (one per
// telemetry tick in sim mode).
function useTelemetry(): TelemetryState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

function useSignals(): SignalDef[] {
  return useTelemetry().signals
}

function useStages(): StageDef[] {
  return useTelemetry().stages
}

function useLatest(field: string): Latest {
  return useTelemetry().latest[field]
}

function useGpsHistory(): GpsPoint[] {
  return useTelemetry().gpsHistory
}

function useActiveFields(): string[] {
  return useTelemetry().activeFields
}

function useDataSource(): DataSource {
  return useTelemetry().dataSource
}

function useEvents(): ApiEvent[] {
  return useTelemetry().events
}

function useSourceStatus(): TelemetryState['sourceStatus'] {
  return useTelemetry().sourceStatus
}

// ─── SOURCE SWITCHING ────────────────────────────────────────────────────────
function setSource(src: DataSource) {
  const { dataSource } = getState()
  if (src === dataSource) return // if switching to the mode we are already on, do nothing

  stopSim()
  disconnectStream()
  setDataSource(src)

  // Wipe all stale data from the previous source
  flushHistory()

  if (src === 'sim') {
    // Car mode may have replaced the manifest via replaceSignals; restore the
    // simulator's own signal set before reseeding.
    replaceSignals([...SIGNALS], [...STAGES])
    setSourceStatus('sim')
    seedHistory()
    startSim()
  } else {
    setSourceStatus('connecting')
    loadEvents()
  }
}

// ─── BOOT ────────────────────────────────────────────────────────────────────
function boot() {
  ensureSeeded()
  startSim()
}

function shutdown() {
  stopSim()
  disconnectStream()
}

export {
  boot,
  clearActiveFields,
  connectStream,
  disconnectStream,
  fetchEvents,
  fetchSignals,
  flushHistory,
  getState,
  ingest,
  loadEvents,
  onEventSelected,
  push,
  pushGPS,
  setActiveFields,
  setDataSource,
  setEvents,
  setSource,
  setSourceStatus,
  shutdown,
  toggleActiveField,
  useActiveFields,
  useDataSource,
  useEvents,
  useGpsHistory,
  useLatest,
  useSignals,
  useSourceStatus,
  useStages,
  useTelemetry,
}
