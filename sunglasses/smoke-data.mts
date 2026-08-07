import React from 'react'
import { renderToString } from 'react-dom/server'
import { boot, flushHistory, shutdown } from './src/telemetry/index.ts'
import { getState, pushRawPoint, setActiveFields } from './src/telemetry/store.ts'
import DataTab from './src/tabs/DataTab.tsx'
import { buildCsv } from './src/tabs/exportCsv.ts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).fetch = async (url: any) => ({ ok: true, json: async () => (String(url).endsWith('/events') ? [] : []) })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).EventSource = class { addEventListener() {} close() {} onerror: unknown = null }

boot()
setActiveFields(['SOC', 'GHI'])
await new Promise(r => setTimeout(r, 20))

const s = getState()
if (s.signals.length < 30) throw new Error('sim manifest missing')
if (s.history['SOC'].length === 0) throw new Error('no seeded SOC history')

const html = renderToString(React.createElement(DataTab))
const need = ['⬤ Live', '⬛ Static', '30s', '1m', '5m', '10m', 'Export CSV', 'FROZEN',
  'State of Charge', 'Total Irradiance', 'Ctrl+click to overlay 1 more signal',
  'scroll to zoom · drag to pan · dbl-click to reset', 'id="plotCanvas"']
need.forEach(x => { if (!html.includes(x)) throw new Error(`DataTab SSR missing: ${x}`) })
if (!html.includes('disabled=""')) throw new Error('export button should be disabled in live mode')
if ((html.match(/class="dt-picker"/g) || []).length !== 2) throw new Error('expected two dt-pickers')
if ((html.match(/class="dt-seg"/g) || []).length !== 12) throw new Error('expected 12 dt segments')
console.log('DATATAB RENDER OK')

setActiveFields([])
await new Promise(r => setTimeout(r, 20))
const emptyHtml = renderToString(React.createElement(DataTab))
if (!emptyHtml.includes('Select a signal from the sidebar to view its plot')) throw new Error('empty state missing')
console.log('DATATAB EMPTY OK')

// ── CSV builder (deterministic) ─────────────────────────────────────────────
flushHistory()
const t0 = Date.now()
pushRawPoint('SOC', t0, 0.5)
pushRawPoint('SOC', t0 + 1000, 0.51)
pushRawPoint('GHI', t0, 700)
pushRawPoint('GHI', t0 + 1000, 710)
setActiveFields(['SOC', 'GHI'])

const csv = buildCsv(getState(), ['SOC', 'GHI'], t0 - 1000, t0 + 2000)
if (csv === null) throw new Error('csv unexpectedly null')
const lines = csv.split('\n')
if (lines[0] !== 'timestamp_utc,elapsed_s,SOC,GHI') throw new Error(`bad header: ${lines[0]}`)
if (lines[1] !== 'ISO8601,s,,W/m²') throw new Error(`bad unit row: ${lines[1]}`)
if (lines.length !== 4) throw new Error(`expected 2 data rows, got ${lines.length - 2}`)
if (!lines[2].includes(',0.000,0.500,700.0')) throw new Error(`bad first row: ${lines[2]}`)
if (!lines[3].includes(',1.000,0.510,710.0')) throw new Error(`bad second row: ${lines[3]}`)

const none = buildCsv(getState(), ['SOC'], t0 + 100000, t0 + 200000)
if (none !== null) throw new Error('csv should be null for empty range')
console.log('CSV OK')

shutdown()
