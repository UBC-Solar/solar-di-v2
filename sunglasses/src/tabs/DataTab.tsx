import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { getState, setActiveFields, useTelemetry } from '../telemetry'
import { MAX_MS } from '../telemetry/constants'
import type { SignalDef } from '../telemetry/types'
import DateTimePicker from '../components/DateTimePicker'
import { PlotCanvas } from '../components/PlotCanvas'
import type { View } from '../components/PlotCanvas'
import { buildCsv } from './exportCsv'

// Port of js/data.js + js/datetime-widget.js. React owns the toolbar/legend
// (rendered declaratively); the canvas draws imperatively in a rAF loop reading
// getState() + a `view` memo (see PlotCanvas).

const PRESETS = [
  { s: 30, label: '30s' },
  { s: 60, label: '1m' },
  { s: 300, label: '5m' },
  { s: 600, label: '10m' },
]

export interface JumpRequest {
  field: string
  from: number
  to: number
}

function DataTab({ jump }: { jump?: JumpRequest | null }) {
  const { signals, activeFields } = useTelemetry()
  const [staticMode, setStaticMode] = useState(false)
  const [windowSec, setWindowSec] = useState(60)
  const [staticFrom, setStaticFrom] = useState<number | null>(null)
  const [staticTo, setStaticTo] = useState<number | null>(null)
  const [fromDraft, setFromDraft] = useState(() => Date.now() - 60_000)
  const [toDraft, setToDraft] = useState(() => Date.now())
  const [winDraft, setWinDraft] = useState('60')
  const [flash, setFlash] = useState({ from: false, to: false })
  const flashTimer = useRef(0)

  useEffect(() => () => window.clearTimeout(flashTimer.current), [])

  // External jump request from the Calculations tab (mini-chart click): freeze
  // the plot to the requested range and sync the datetime pickers. Applied
  // during render (React's "adjusting state when a prop changes" pattern) to
  // avoid cascading setState from an effect. App clears `jump` when the user
  // switches tabs manually, so a stale range never re-applies on remount.
  const [prevJump, setPrevJump] = useState<JumpRequest | null | undefined>(undefined)
  if (jump && jump !== prevJump) {
    setPrevJump(jump)
    setStaticMode(true)
    setStaticFrom(jump.from)
    setStaticTo(jump.to)
    setFromDraft(jump.from)
    setToDraft(jump.to)
  }

  const activeMetrics = activeFields
    .map(f => signals.find(s => s.field === f))
    .filter((m): m is SignalDef => Boolean(m))

  // New object identity only when the view actually changes — PlotCanvas uses
  // that identity to know when a frozen (static) frame needs a redraw.
  const view = useMemo<View>(
    () => ({ staticMode, staticFrom, staticTo, windowSec, activeFields }),
    [staticMode, staticFrom, staticTo, windowSec, activeFields],
  )

  const enterLive = () => {
    setStaticMode(false)
    setStaticFrom(null)
    setStaticTo(null)
  }

  const enterStatic = () => {
    const to = staticTo ?? Date.now()
    const from = staticFrom ?? to - windowSec * 1000
    setStaticMode(true)
    setStaticFrom(from)
    setStaticTo(to)
    setFromDraft(from)
    setToDraft(to)
  }

  // Pan/zoom/dbl-click path (from PlotCanvas interactions): always frozen.
  const applyWindow = (f: number, t: number) => {
    const minSpan = 5000
    let span = t - f
    if (span < minSpan) {
      const mid = (f + t) / 2
      f = mid - minSpan / 2; t = mid + minSpan / 2
      span = minSpan
    }
    if (span > MAX_MS) {
      const mid = (f + t) / 2
      f = mid - MAX_MS / 2; t = mid + MAX_MS / 2
    }
    const dataEnd = Date.now()
    if (t > dataEnd) { f -= (t - dataEnd); t = dataEnd }
    setStaticMode(true)
    setStaticFrom(f)
    setStaticTo(t)
    setFromDraft(f)
    setToDraft(t)
  }

  const applyStaticRange = () => {
    if (fromDraft >= toDraft) {
      setFlash({ from: true, to: true })
      window.clearTimeout(flashTimer.current)
      flashTimer.current = window.setTimeout(() => setFlash({ from: false, to: false }), 1200)
      return
    }
    setStaticFrom(fromDraft)
    setStaticTo(toDraft)
  }

  const setWin = (sec: number) => {
    setWindowSec(sec)
    setWinDraft(String(sec))
  }

  const commitWin = () => {
    const v = parseInt(winDraft, 10)
    if (!isNaN(v) && v >= 5 && v <= 3600) setWindowSec(v)
    else setWinDraft(String(windowSec))
  }

  const toggleLegend = (field: string) => {
    const set = new Set(activeFields)
    if (set.has(field)) set.delete(field)
    else if (set.size < 3) set.add(field)
    setActiveFields([...set])
  }

  const exportCSV = () => {
    if (!staticFrom || !staticTo) return
    const csv = buildCsv(getState(), activeFields, staticFrom, staticTo)
    if (!csv) return
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const start = new Date(staticFrom).toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const end = new Date(staticTo).toISOString().replace(/[:.]/g, '-').slice(0, 19)
    a.href = url
    a.download = `telemetry_${start}_${end}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (activeFields.length === 0) {
    return (
      <div id="dataTab">
        <div id="mainArea">
          <div className="plot-panel">
            <div className="plot-empty">
              <div className="plot-empty-hint">Select a signal from the sidebar to view its plot</div>
              <div className="plot-empty-sub">Hold Ctrl / ⌘ to overlay up to 3 signals</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const titleColor = activeMetrics[0]?.color ?? 'var(--text)'
  const legendHint = activeFields.length === 1
    ? 'Ctrl+click to overlay up to 2 more signals'
    : 'Ctrl+click to overlay 1 more signal'

  return (
    <div id="dataTab">
      <div id="mainArea">
        <div className="plot-panel">
          <div className="plot-toolbar" style={{ '--card-color': titleColor } as CSSProperties}>
            <div id="chartLegend" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
              {activeMetrics.map(m => (
                <div
                  key={m.field}
                  className="plot-legend-chip"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '3px 8px 3px 6px', borderRadius: 4, border: `1px solid ${m.color}40`, background: `${m.color}10` }}
                  title={`Click to remove ${m.label}`}
                  onClick={() => toggleLegend(m.field)}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, flexShrink: 0 }}></span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: m.color, whiteSpace: 'nowrap' }}>{m.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 2 }}>{m.unit}</span>
                </div>
              ))}
              {activeFields.length < 3 && (
                <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>{legendHint}</span>
              )}
            </div>

            <div className="mode-toggle">
              <button className={`mode-btn${staticMode ? '' : ' on'}`} onClick={enterLive}>⬤ Live</button>
              <div className="mode-divider"></div>
              <button className={`mode-btn${staticMode ? ' on' : ''}`} onClick={enterStatic}>⬛ Static</button>
            </div>

            <div className={`static-inputs${staticMode ? '' : ' hidden'}`}>
              <span className="ts-label">From</span>
              <DateTimePicker value={fromDraft} onChange={setFromDraft} flash={flash.from} />
              <span className="ts-label">To</span>
              <DateTimePicker value={toDraft} onChange={setToDraft} flash={flash.to} />
              <button className="ts-apply" onClick={applyStaticRange}>Apply</button>
            </div>

            <div className={`static-inputs${staticMode ? ' hidden' : ''}`}>
              <div className="presets">
                {PRESETS.map(p => (
                  <button key={p.s} className={`preset${windowSec === p.s ? ' on' : ''}`} onClick={() => setWin(p.s)}>{p.label}</button>
                ))}
              </div>
              <div className="win-wrap">
                <input
                  className="win-num"
                  type="number"
                  min={5}
                  max={3600}
                  value={winDraft}
                  onChange={e => setWinDraft(e.target.value)}
                  onBlur={commitWin}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                />
                <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--muted)' }}>s</span>
              </div>
            </div>

            <span className={`static-badge${staticMode ? '' : ' hidden'}`}>FROZEN</span>
            <button className="export-btn" onClick={exportCSV} disabled={!staticMode} title="Export visible data to CSV">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 1v7M3 5l3 3 3-3" /><path d="M1 9v1a1 1 0 001 1h8a1 1 0 001-1V9" />
              </svg>
              Export CSV
            </button>
          </div>

          <div className="signal-desc-bar" style={{ display: 'flex' }}>
            {activeMetrics.map(m => (
              <div key={m.field} className="signal-desc-item">
                <span className="signal-desc-dot" style={{ background: m.color }}></span>
                <span className="signal-desc-name" style={{ color: m.color }}>{m.label}</span>
                <span className="signal-desc-sep">—</span>
                <span className="signal-desc-text">{m.help}</span>
              </div>
            ))}
          </div>

          <PlotCanvas view={view} onWindow={applyWindow} onReset={enterLive} />
        </div>
      </div>
    </div>
  )
}

export default DataTab
