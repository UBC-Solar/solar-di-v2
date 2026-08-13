import { useSyncExternalStore } from 'react'
import { getSnapshot, subscribe } from './store'
import type { SignalDef } from './types'

// Overview mapping: defines, for each Overview card, the field names it accepts
// from the current signal manifest. This is the single place aware of raw field
// naming — OverviewTab renders by mapping key, never by raw names. Resolution
// runs against the live manifest (state.signals), so event/source switches
// re-resolve automatically. Names are tried in order (exact first, then
// case-insensitive); the first hit wins. A key the manifest can't provide
// resolves to null, renders '—', and warns once.

export const OVERVIEW_MAPPING = [
  { key: 'soc',         names: ['SOC'] },
  { key: 'speed',       names: ['VehicleVelocity'] },
  { key: 'lap',         names: ['LapIndex'] },
  { key: 'trackDist',   names: ['TrackDistSpreadsheet'] },
  { key: 'trackIndex',  names: ['TrackIndex'] },
  { key: 'packVoltage', names: ['TotalPackVoltage'] },
  { key: 'packCurrent', names: ['PackCurrent'] },
  { key: 'weakCell',    names: ['VoltageofLeast'] },
  { key: 'packPower',   names: ['PackPower'] },
  { key: 'motorPower',  names: ['MotorPower'] },
  { key: 'brake',       names: ['MechBrakePressed'] },
  { key: 'ghi',         names: ['GHI'] },
  { key: 'eff5',        names: ['Efficiency5Minute'] },
  { key: 'eff1h',       names: ['Efficiency1Hour'] },
  { key: 'airTemp',     names: ['AirTemperature'] },
  { key: 'windSpeed',   names: ['WindSpeed'] },
  { key: 'windDir',     names: ['WindDirection'] },
  { key: 'zenith',      names: ['Zenith'] },
] as const

export type OverviewKey = (typeof OVERVIEW_MAPPING)[number]['key']

// Warn once per mapping key while it stays missing; if it later resolves and
// then disappears again, warn once more. Prevents console spam during live ticks.
const warned = new Set<OverviewKey>()

function findField(signals: SignalDef[], names: readonly string[]): string | null {
  for (const name of names) {
    const exact = signals.find(s => s.field === name)
    if (exact) return exact.field
    const lower = name.toLowerCase()
    const folded = signals.find(s => s.field.toLowerCase() === lower)
    if (folded) return folded.field
  }
  return null
}

function resolveFields(signals: SignalDef[]): Record<OverviewKey, string | null> {
  const available = signals.map(s => s.field)
  const out = {} as Record<OverviewKey, string | null>
  for (const c of OVERVIEW_MAPPING) {
    const f = findField(signals, c.names)
    out[c.key] = f
    if (f) {
      warned.delete(c.key)
    } else if (!warned.has(c.key)) {
      warned.add(c.key)
      console.warn(
        `[overview] "${c.key}" has no matching signal (tried: ${c.names.join(', ')}). ` +
          `Available fields: ${available.join(', ') || '(none)'}`,
      )
    }
  }
  return out
}

export function useOverviewMapping(): Record<OverviewKey, number | null> {
  const { signals, latest } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const fields = resolveFields(signals)
  const out = {} as Record<OverviewKey, number | null>
  for (const c of OVERVIEW_MAPPING) {
    const f = fields[c.key]
    const l = f ? latest[f] : undefined
    out[c.key] = l && l.value !== null && l.value !== undefined ? l.value : null
  }
  return out
}
