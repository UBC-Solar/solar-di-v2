import type { SignalDef, TelemetryState } from '../telemetry/types'

// Pure CSV builder — extracted from DataTab so it can be smoke-tested in Node
// without a browser. Mirrors js/data.js exportCSV.
export function buildCsv(
  state: TelemetryState,
  fields: string[],
  from: number,
  to: number,
): string | null {
  const metrics = fields
    .map(f => state.signals.find(s => s.field === f))
    .filter((m): m is SignalDef => Boolean(m))
  if (!metrics.length) return null

  const allTs = new Set<number>()
  metrics.forEach(m => {
    state.history[m.field].filter(p => p.t >= from && p.t <= to).forEach(p => allTs.add(p.t))
  })
  const timestamps = Array.from(allTs).sort((a, b) => a - b)
  if (!timestamps.length) return null
  const t0 = timestamps[0]

  const nameHeader = ['timestamp_utc', 'elapsed_s', ...metrics.map(m => m.field)]
  const unitHeader = ['ISO8601', 's', ...metrics.map(m => m.unit || '')]

  const rows = timestamps.map(t => {
    const iso = new Date(t).toISOString()
    const elapsed = ((t - t0) / 1000).toFixed(3)
    const vals = metrics.map(m => {
      const p = state.history[m.field].find(x => x.t === t)
      return p !== undefined ? p.v.toFixed(m.decimals <= 1 ? 1 : 3) : ''
    })
    return [iso, elapsed, ...vals]
  })

  return [nameHeader, unitHeader, ...rows].map(r => r.join(',')).join('\n')
}
