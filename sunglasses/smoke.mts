import { setSource } from './src/telemetry/index.ts'
import { getState } from './src/telemetry/store.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).fetch = async (url: any) => {
  const u = String(url)
  if (u.endsWith('/events')) return { ok: true, json: async () => [{ name: 'test-event', status: 'active' }] }
  if (u.includes('/signals')) return { ok: true, json: async () => [{ name: 'Voltage', source: 'ingress', unit: 'V' }, { name: 'Speed', source: 'ingress', unit: 'm/s' }] }
  return { ok: false, json: async () => [] }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).EventSource = class { addEventListener() {} close() {} onerror: unknown = null }

await setSource('car')
await new Promise(r => setTimeout(r, 20))
const s = getState()
console.log('car:', s.dataSource, s.selectedEvent, s.signals.length)
if (s.signals.length !== 2) throw new Error('car signals not replaced')

await setSource('sim')
const s2 = getState()
console.log('sim:', s2.dataSource, s2.sourceStatus, s2.signals.length, 'signals, history:', Object.keys(s2.history).length)
if (s2.signals.length < 30) throw new Error('sim signals not restored')
if (Object.keys(s2.history).length !== s2.signals.length) throw new Error('history not rebuilt for sim manifest')
console.log('SWITCHING OK')
