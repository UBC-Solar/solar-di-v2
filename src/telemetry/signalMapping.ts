import { useSyncExternalStore } from 'react'
import { getSnapshot, subscribe } from './store'
import type { SignalDef } from './types'

// Signal mapping: concept keys live on each SignalDef in constants.ts. These
// tables simply list which keys each tab shows. resolveFields() maps keys →
// live field names against the current manifest. A key the manifest can't
// provide resolves to null, renders '—', and warns once.

// ─── Concept tables ───────────────────────────────────────────────────────────
export const OVERVIEW_MAPPING = [
  'soc', 'speed', 'lap', 'trackDist', 'trackIndex',
  'packVoltage', 'packCurrent', 'weakCell', 'packPower', 'motorPower',
  'brake', 'ghi', 'eff5', 'eff1h', 'airTemp', 'windSpeed', 'windDir', 'zenith',
  'nsm',
] as const

export const CALC_MAPPING = [
  'soc', 'speed', 'motorPower', 'packPower', 'eff5', 'eff1h', 'effLap', 'lap',
] as const

export type OverviewKey = (typeof OVERVIEW_MAPPING)[number]
export type CalcKey = (typeof CALC_MAPPING)[number]

// Warn once per key while it stays missing; if it later resolves and then
// disappears again, warn once more. Prevents console spam during live ticks.
const warned = new Set<string>()

export function resolveFields(
  signals: SignalDef[],
  keys: readonly string[],
): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const key of keys) {
    const signal = signals.find(s => s.key === key)
    out[key] = signal ? signal.field : null
    if (signal) {
      warned.delete(key)
    } else if (!warned.has(key)) {
      warned.add(key)
      console.warn(
        `[signalMapping] "${key}" has no matching signal in manifest.`,
      )
    }
  }
  return out
}

export function useConceptValues<T extends readonly string[]>(
  keys: T,
): Record<T[number], number | null> {
  const { signals, latest } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const out = {} as Record<T[number], number | null>
  const outStr = out as Record<string, number | null>
  for (const key of keys) {
    const signal = signals.find(s => s.key === key)
    const l = signal ? latest[signal.field] : undefined
    outStr[key] = l && l.value !== null && l.value !== undefined ? l.value : null
  }
  return out
}

export function useOverviewMapping(): Record<OverviewKey, number | null> {
  return useConceptValues(OVERVIEW_MAPPING)
}
