import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { getState, useDataSource } from '../telemetry'
import { CALC_MAPPING, resolveFields } from '../telemetry/signalMapping'
import type { Point, SignalDef } from '../telemetry/types'
import DateTimePicker from '../components/DateTimePicker'

// Port of js/calculations.js. React owns the toolbar and the collapsible
// sections; the mini time-series graphs draw imperatively to canvas (see
// MiniChart). Stats resolve through CALC_MAPPING against the live manifest at
// Analyse time, so car events that rename or omit fields render '—' for the
// missing stats instead of crashing. Switching source clears the results;
// nothing is shown until Analyse is clicked again.

// ─── ENGINE HELPERS ──────────────────────────────────────────────────────────
function metricAt(hist: Point[] | undefined, t: number): number | null {
  if (!hist || !hist.length) return null
  if (t <= hist[0].t) return hist[0].v
  if (t >= hist[hist.length - 1].t) return hist[hist.length - 1].v
  let lo = 0, hi = hist.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (hist[mid].t <= t) lo = mid
    else hi = mid
  }
  const frac = (t - hist[lo].t) / (hist[hi].t - hist[lo].t || 1)
  return hist[lo].v + frac * (hist[hi].v - hist[lo].v)
}

function integrate(hist: Point[] | undefined, tStart: number, tEnd: number): number {
  if (!hist || !hist.length) return 0
  const pts = hist.filter(p => p.t >= tStart && p.t <= tEnd)
  if (pts.length < 2) return 0
  let sum = 0
  for (let i = 1; i < pts.length; i++) {
    const dt = (pts[i].t - pts[i - 1].t) / 1000
    sum += 0.5 * (pts[i - 1].v + pts[i].v) * dt
  }
  return sum
}

function average(hist: Point[] | undefined, tStart: number, tEnd: number): number | null {
  const pts = hist ? hist.filter(p => p.t >= tStart && p.t <= tEnd) : []
  if (!pts.length) return null
  return pts.reduce((s, p) => s + p.v, 0) / pts.length
}

// ─── RESULT MODEL ────────────────────────────────────────────────────────────
interface LapRow {
  lap: number
  durMin: number
  avgSpeed: number | null
  deltaSocPct: number | null
  avgPackKw: number | null
  eff: number | null
}

interface CalcResults {
  rangeLabel: string
  durSec: number
  avgSpeed: number | null
  socStart: number | null
  socEnd: number | null
  deltaSoc: number | null
  motorEnergyWh: number
  packEnergyWh: number
  avgMotorKw: number | null
  avgPackKw: number | null
  avgEff5: number | null
  avgEff1h: number | null
  avgEffLap: number | null
  lapRows: LapRow[]
  lapRangeUsed: { min: number; max: number } | null
  from: number
  to: number
}

function fmt(v: number | null, dec: number): string {
  return v !== null && !isNaN(v) ? v.toFixed(dec) : '—'
}

function deltaFmt(v: number | null): string {
  return v !== null ? (v > 0 ? '−' : '+') + fmt(Math.abs(v), 1) : '—'
}

// ─── BUILDING BLOCKS ─────────────────────────────────────────────────────────
function StatCard({ color, label, value, unit }: {
  color: string
  label: string
  value: string
  unit: string
}) {
  return (
    <div className="stat-card" style={{ '--card-color': color } as CSSProperties}>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}<span className="stat-card-unit">{unit}</span></div>
    </div>
  )
}

function CalcSection({ id, title, open, onToggle, children }: {
  id: string
  title: string
  open: boolean
  onToggle: (id: string) => void
  children: ReactNode
}) {
  return (
    <div className={`calc-section${open ? ' open' : ''}`} id={`sec-${id}`}>
      <div className="calc-section-header" onClick={() => onToggle(id)}>
        <div className="calc-section-title">{title}</div>
        <svg className="calc-section-chevron" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="4 2 8 6 4 10" /></svg>
      </div>
      <div className="calc-section-body">{children}</div>
    </div>
  )
}

function MiniChart({ m, pts, active, onOpen }: {
  m: SignalDef
  pts: Point[]
  active: boolean
  onOpen: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Redraws on mount and whenever the owning stage group becomes visible, so
  // collapsed charts re-render at their real width once expanded.
  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const W = canvas.offsetWidth || 280, H = 120
    canvas.width = W * dpr; canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    const PAD = { t: 8, b: 20, l: 38, r: 8 }
    const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b
    const LABEL = '#7a8fa3', FONT = '9px IBM Plex Mono,monospace'
    ctx.clearRect(0, 0, W, H)
    if (pts.length < 2) {
      ctx.fillStyle = LABEL
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.font = '10px IBM Plex Mono,monospace'
      ctx.fillText('No data', PAD.l + cW / 2, PAD.t + cH / 2)
      return
    }
    const vs = pts.map(p => p.v)
    const yMin = Math.min(...vs), yMax = Math.max(...vs), yRange = yMax - yMin || 1
    const tA = pts[0].t, tB = pts[pts.length - 1].t, tSpan = tB - tA || 1
    const toX = (t: number) => PAD.l + ((t - tA) / tSpan) * cW
    const toY = (v: number) => PAD.t + cH - ((v - yMin) / yRange) * cH

    ctx.strokeStyle = '#ffffff0a'; ctx.lineWidth = .5
    for (let i = 0; i <= 4; i++) {
      const y = PAD.t + (i / 4) * cH
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + cW, y); ctx.stroke()
    }
    ctx.font = FONT; ctx.fillStyle = LABEL; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    for (let i = 0; i <= 4; i++) {
      const v = yMin + (yRange / 4) * (4 - i)
      ctx.fillText(v.toFixed(m.decimals <= 1 ? 1 : 2), PAD.l - 3, PAD.t + (i / 4) * cH)
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    const xN = Math.min(4, Math.max(1, Math.floor(cW / 55)))
    const showSecs = tSpan < 90000
    for (let i = 0; i <= xN; i++) {
      const tt = tA + (i / xN) * tSpan
      const d = new Date(tt)
      const lbl = showSecs
        ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
        : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      ctx.fillText(lbl, toX(tt), PAD.t + cH + 3)
    }
    ctx.strokeStyle = '#ffffff18'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t + cH); ctx.lineTo(PAD.l + cW, PAD.t + cH); ctx.stroke()

    ctx.beginPath(); ctx.moveTo(toX(pts[0].t), toY(pts[0].v))
    pts.slice(1).forEach(p => ctx.lineTo(toX(p.t), toY(p.v)))
    ctx.lineTo(toX(pts[pts.length - 1].t), PAD.t + cH); ctx.lineTo(toX(pts[0].t), PAD.t + cH)
    ctx.closePath(); ctx.fillStyle = m.color + '18'; ctx.fill()
    ctx.beginPath(); ctx.moveTo(toX(pts[0].t), toY(pts[0].v))
    pts.slice(1).forEach(p => ctx.lineTo(toX(p.t), toY(p.v)))
    ctx.strokeStyle = m.color; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke()
  }, [m, pts, active])

  return (
    <div
      className="mini-chart-card"
      style={{ cursor: 'pointer' }}
      title={`Open ${m.label} in Data tab`}
      onClick={onOpen}
    >
      <div className="mini-chart-title">
        <span className="dot" style={{ background: m.color }}></span>
        {m.label}
        <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 'auto' }}>{m.unit}</span>
        <span className="mini-chart-goto">↗</span>
      </div>
      <canvas ref={canvasRef} className="mini-chart-canvas" width="280" height="120"></canvas>
    </div>
  )
}

// ─── RESULTS VIEW ────────────────────────────────────────────────────────────
function ResultsView({ results, openSections, onToggleSection, openStages, onToggleStage, onOpenInData }: {
  results: CalcResults
  openSections: Set<string>
  onToggleSection: (id: string) => void
  openStages: Set<string>
  onToggleStage: (id: string) => void
  onOpenInData?: (field: string, from: number, to: number) => void
}) {
  const { signals, stages } = getState()
  const hists = getState().history

  const durMin = results.durSec / 60
  const socStartPct = results.socStart !== null ? results.socStart * 100 : null
  const socEndPct = results.socEnd !== null ? results.socEnd * 100 : null
  const deltaColor = results.deltaSoc !== null && results.deltaSoc > 0 ? 'var(--red)' : 'var(--green)'

  return (
    <>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>{results.rangeLabel}</div>

      <CalcSection id="summary" title="Summary" open={openSections.has('summary')} onToggle={onToggleSection}>
        <div className="stat-grid">
          <StatCard color="#60a5fa" label="Duration" value={fmt(durMin, 1)} unit="min" />
          <StatCard color="#60a5fa" label="Avg Speed" value={fmt(results.avgSpeed, 2)} unit="m/s" />
          <StatCard color="#3d9e6b" label="SOC Start" value={fmt(socStartPct, 1)} unit="%" />
          <StatCard color="#3d9e6b" label="SOC End" value={fmt(socEndPct, 1)} unit="%" />
          <StatCard color={deltaColor} label="Δ SOC" value={deltaFmt(results.deltaSoc !== null ? results.deltaSoc * 100 : null)} unit="%" />
        </div>
      </CalcSection>

      <CalcSection id="energy" title="Energy & Power" open={openSections.has('energy')} onToggle={onToggleSection}>
        <div className="stat-grid">
          <StatCard color="#c94f3e" label="Motor Energy" value={fmt(results.motorEnergyWh, 1)} unit="Wh" />
          <StatCard color="#f0a500" label="Pack Energy" value={fmt(results.packEnergyWh, 1)} unit="Wh" />
          <StatCard color="#c94f3e" label="Avg Motor Power" value={fmt(results.avgMotorKw, 2)} unit="kW" />
          <StatCard color="#f0a500" label="Avg Pack Power" value={fmt(results.avgPackKw, 2)} unit="kW" />
        </div>
      </CalcSection>

      <CalcSection id="efficiency" title="Efficiency" open={openSections.has('efficiency')} onToggle={onToggleSection}>
        <div className="stat-grid">
          <StatCard color="#a78bfa" label="Efficiency 5-min avg" value={fmt(results.avgEff5, 1)} unit="J/m" />
          <StatCard color="#a78bfa" label="Efficiency 1-hr avg" value={fmt(results.avgEff1h, 1)} unit="J/m" />
          <StatCard color="#a78bfa" label="Efficiency per Lap avg" value={fmt(results.avgEffLap, 1)} unit="J/m" />
        </div>
      </CalcSection>

      {results.lapRows.length > 0 && (
        <CalcSection id="lapbreakdown" title="Lap Breakdown" open={openSections.has('lapbreakdown')} onToggle={onToggleSection}>
          <table className="lap-table">
            <thead>
              <tr><th>Lap</th><th>Duration</th><th>Avg Speed</th><th>Δ SOC</th><th>Avg Pack Power</th><th>Efficiency</th></tr>
            </thead>
            <tbody>
              {results.lapRows.map(r => (
                <tr key={r.lap}>
                  <td className="td-num">{r.lap}</td>
                  <td className="td-val">{fmt(r.durMin, 1)} min</td>
                  <td className="td-val">{fmt(r.avgSpeed, 2)} m/s</td>
                  <td className="td-val">{deltaFmt(r.deltaSocPct)}%</td>
                  <td className="td-val">{fmt(r.avgPackKw, 2)} kW</td>
                  <td className="td-val">{fmt(r.eff, 1)} J/m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CalcSection>
      )}

      <CalcSection id="charts" title="Time-Series Graphs" open={openSections.has('charts')} onToggle={onToggleSection}>
        <div className="chart-stages-wrap">
          {stages.map(stage => {
            const stageSignals = signals.filter(s => s.stage === stage.id)
            if (!stageSignals.length) return null
            const isOpen = openStages.has(stage.id)
            return (
              <div key={stage.id} className={`chart-stage-group${isOpen ? ' open' : ''}`} id={`csg-${stage.id}`}>
                <div className="chart-stage-header" onClick={() => onToggleStage(stage.id)}>
                  <span className="chart-stage-dot" style={{ background: stage.color }}></span>
                  <span className="chart-stage-name">{stage.label}</span>
                  <span className="chart-stage-count">{stageSignals.length}</span>
                  <svg className="chart-stage-chevron" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="4 2 8 6 4 10" /></svg>
                </div>
                <div className="chart-stage-body">
                  <div className="mini-charts-grid" id={`chartgrid-${stage.id}`}>
                    {stageSignals.map(sig => (
                      <MiniChart
                        key={sig.field}
                        m={sig}
                        pts={hists[sig.field].filter(p => p.t >= results.from && p.t <= results.to)}
                        active={isOpen}
                        onOpen={() => onOpenInData?.(sig.field, results.from, results.to)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CalcSection>
    </>
  )
}

// ─── CALC TAB ────────────────────────────────────────────────────────────────
function CalcTab({ onOpenInData, active }: {
  onOpenInData?: (field: string, from: number, to: number) => void
  active?: boolean
}) {
  const source = useDataSource()

  const [mode, setMode] = useState<'time' | 'lap'>('time')
  const [lapSingle, setLapSingle] = useState(false)
  const [lapFrom, setLapFrom] = useState('1')
  const [lapTo, setLapTo] = useState('1')

  // Prefill to the last minute on mount (old prefillCalcInputs used the data
  // tab's window; 60s is the fixed default here).
  const [fromDraft, setFromDraft] = useState(() => Date.now() - 60_000)
  const [toDraft, setToDraft] = useState(() => Date.now())

  const [flash, setFlash] = useState({ from: false, to: false })
  const flashTimer = useRef(0)

  const [status, setStatus] = useState<string | null>(null)
  const statusTimer = useRef(0)

  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['summary']))
  const [openStages, setOpenStages] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<CalcResults | null>(null)

  // Wipe any stale results the moment the source changes; a car event's
  // manifest is different from sim's, so the previous numbers would be wrong.
  // (Adjusted during render, per React's "adjusting state when a prop changes".)
  const [prevSource, setPrevSource] = useState(source)
  if (prevSource !== source) {
    setPrevSource(source)
    setResults(null)
    setStatus(null)
  }

  useEffect(() => () => {
    window.clearTimeout(flashTimer.current)
    window.clearTimeout(statusTimer.current)
  }, [])

  const flashStatus = (msg: string) => {
    setStatus(msg)
    window.clearTimeout(statusTimer.current)
    statusTimer.current = window.setTimeout(() => setStatus(null), 2000)
  }

  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleStage = (id: string) => {
    setOpenStages(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const runCalculations = () => {
    const state = getState()
    const resolved = resolveFields(state.signals, CALC_MAPPING)
    let f: number, t: number
    let lapRangeUsed: { min: number; max: number } | null = null

    if (mode === 'lap') {
      const lapA = parseInt(lapFrom, 10) || 1
      const lapB = lapSingle ? lapA : (parseInt(lapTo, 10) || lapA)
      const lapMin = Math.min(lapA, lapB), lapMax = Math.max(lapA, lapB)

      const lapField = resolved['lapIndex']
      const lapHist = lapField ? state.history[lapField] : undefined
      if (!lapHist || !lapHist.length) {
        flashStatus('No lap data')
        return
      }
      const ptsInRange = lapHist.filter(p => {
        const r = Math.round(p.v)
        return r >= lapMin && r <= lapMax
      })
      if (!ptsInRange.length) {
        flashStatus('Laps not found')
        return
      }
      f = ptsInRange[0].t
      t = ptsInRange[ptsInRange.length - 1].t
      lapRangeUsed = { min: lapMin, max: lapMax }
    } else {
      if (!fromDraft || !toDraft || fromDraft >= toDraft) {
        setFlash({ from: true, to: true })
        window.clearTimeout(flashTimer.current)
        flashTimer.current = window.setTimeout(() => setFlash({ from: false, to: false }), 1200)
        return
      }
      f = fromDraft
      t = toDraft
    }

    const hists: Record<string, Point[]> = {}
    state.signals.forEach(m => { hists[m.field] = state.history[m.field].filter(p => p.t >= f && p.t <= t) })

    // Resolve a concept key to its manifest field's history points within the
    // range; concepts the manifest can't provide resolve to [] (renders '—').
    const histOf = (key: string): Point[] => {
      const field = resolved[key]
      return field ? (hists[field] ?? []) : []
    }

    const durSec = (t - f) / 1000
    const avgSpeed = average(histOf('speed'), f, t)
    const socHist = histOf('soc')
    const socStart = socHist.length ? socHist[0].v : null
    const socEnd = socHist.length ? socHist[socHist.length - 1].v : null
    const deltaSoc = (socStart !== null && socEnd !== null) ? (socStart - socEnd) : null
    const motorEnergyWh = integrate(histOf('motorPower'), f, t) / 3600
    const packEnergyWh = integrate(histOf('packPower'), f, t) / 3600
    const avgMotor = average(histOf('motorPower'), f, t)
    const avgPack = average(histOf('packPower'), f, t)
    const avgEff5 = average(histOf('eff5'), f, t)
    const avgEff1h = average(histOf('eff1h'), f, t)
    const avgEffLap = average(histOf('effLap'), f, t)

    let rangeLabel: string
    if (lapRangeUsed) {
      rangeLabel = lapRangeUsed.min === lapRangeUsed.max
        ? `Lap ${lapRangeUsed.min}`
        : `Laps ${lapRangeUsed.min} – ${lapRangeUsed.max}`
    } else {
      const ts = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      rangeLabel = `${ts(new Date(f))} → ${ts(new Date(t))}`
    }

    const lapRows: LapRow[] = []
    if (lapRangeUsed && lapRangeUsed.min !== lapRangeUsed.max) {
      const lapHist = histOf('lapIndex')
      for (let lap = lapRangeUsed.min; lap <= lapRangeUsed.max; lap++) {
        const pts = lapHist.filter(p => Math.round(p.v) === lap)
        if (!pts.length) continue
        const lf = pts[0].t, lt = pts[pts.length - 1].t
        const ldur = (lt - lf) / 1000
        const lSocStart = metricAt(histOf('soc'), lf)
        const lSocEnd = metricAt(histOf('soc'), lt)
        const lDeltaSoc = (lSocStart !== null && lSocEnd !== null) ? (lSocStart - lSocEnd) * 100 : null
        const lSpeed = average(histOf('speed'), lf, lt)
        const lPower = average(histOf('packPower'), lf, lt)
        const lEff = average(histOf('effLap'), lf, lt)
        lapRows.push({
          lap,
          durMin: ldur / 60,
          avgSpeed: lSpeed,
          deltaSocPct: lDeltaSoc,
          avgPackKw: lPower !== null ? lPower / 1000 : null,
          eff: lEff,
        })
      }
    }

    setResults({
      rangeLabel,
      durSec,
      avgSpeed,
      socStart,
      socEnd,
      deltaSoc,
      motorEnergyWh,
      packEnergyWh,
      avgMotorKw: avgMotor !== null ? avgMotor / 1000 : null,
      avgPackKw: avgPack !== null ? avgPack / 1000 : null,
      avgEff5,
      avgEff1h,
      avgEffLap,
      lapRows,
      lapRangeUsed,
      from: f,
      to: t,
    })
    flashStatus('Done')
  }

  return (
    <div id="calcTab" className={active ? 'active' : ''}>
      <div className="calc-toolbar">
        <div className="calc-range-mode">
          <button className={`calc-mode-btn${mode === 'time' ? ' on' : ''}`} onClick={() => setMode('time')}>Time</button>
          <button className={`calc-mode-btn${mode === 'lap' ? ' on' : ''}`} onClick={() => setMode('lap')}>Lap</button>
        </div>

        <div className={`calc-inputs-time${mode === 'time' ? '' : ' hidden'}`}>
          <span className="ts-label">From</span>
          <DateTimePicker value={fromDraft} onChange={setFromDraft} flash={flash.from} />
          <span className="ts-label">To</span>
          <DateTimePicker value={toDraft} onChange={setToDraft} flash={flash.to} />
        </div>

        <div className={`calc-inputs-lap${mode === 'lap' ? '' : ' hidden'}`}>
          <span className="ts-label">Lap</span>
          <input
            className="lap-input"
            type="number"
            min={0}
            max={999}
            value={lapFrom}
            onChange={e => setLapFrom(e.target.value)}
          />
          <span className="lap-range-sep" style={lapSingle ? { display: 'none' } : undefined}>→</span>
          <input
            className="lap-input"
            type="number"
            min={0}
            max={999}
            value={lapTo}
            onChange={e => setLapTo(e.target.value)}
            style={lapSingle ? { display: 'none' } : undefined}
          />
          <button className={`lap-single-toggle${lapSingle ? ' on' : ''}`} onClick={() => setLapSingle(s => !s)}>Single lap</button>
        </div>

        <button className="ts-apply" onClick={runCalculations}>Analyse</button>
        <span className={`static-badge${status ? '' : ' hidden'}`}>{status}</span>
      </div>

      <div id="calcBody" className="calc-body">
        {!results ? (
          <div className="calc-empty">
            <div className="plot-empty-hint">Set a time range or lap and click Analyse</div>
          </div>
        ) : (
          <ResultsView
            results={results}
            openSections={openSections}
            onToggleSection={toggleSection}
            openStages={openStages}
            onToggleStage={toggleStage}
            onOpenInData={onOpenInData}
          />
        )}
      </div>
    </div>
  )
}

export default CalcTab
