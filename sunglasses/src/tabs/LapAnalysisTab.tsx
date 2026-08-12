import { useEffect, useMemo, useRef, useState } from 'react'
import { getState } from '../telemetry'
import type { SignalDef } from '../telemetry/types'

// Port of js/lapanalysis.js. React owns the toolbar, stats row, and empty
// states; the per-lap scatter/trend chart draws imperatively to canvas with a
// hover tooltip (see the mount effect in LapChart).

type AggMode = 'mean' | 'median' | 'max' | 'min'

const AGG_MODES: AggMode[] = ['mean', 'median', 'max', 'min']

interface LapPoint {
  lap: number
  agg: number
  count: number
  extremeT: number | null
}

// ─── DATA PREP ───────────────────────────────────────────────────────────────
// Group each signal's values by the lap number recorded at the same index in
// LapIndex history. (All sim signals share timestamps, so index i in one
// history corresponds to index i in another — same assumption as the old app.)
function getLapData(): Record<number, Record<string, { values: number[]; times: number[] }>> {
  const state = getState()
  const lapIdxHistory = state.history['LapIndex']
  if (!lapIdxHistory || !lapIdxHistory.length) return {}

  const lapMap: Record<number, Record<string, { values: number[]; times: number[] }>> = {}
  state.signals.forEach(sig => {
    const h = state.history[sig.field]
    if (!h || !h.length) return
    const len = Math.min(h.length, lapIdxHistory.length)
    for (let i = 0; i < len; i++) {
      const lap = Math.round(lapIdxHistory[i].v)
      if (lap < 1) continue
      if (!lapMap[lap]) lapMap[lap] = {}
      if (!lapMap[lap][sig.field]) lapMap[lap][sig.field] = { values: [], times: [] }
      lapMap[lap][sig.field].values.push(h[i].v)
      lapMap[lap][sig.field].times.push(h[i].t)
    }
  })
  return lapMap
}

function aggregate(values: number[] | undefined, mode: AggMode): number | null {
  if (!values || !values.length) return null
  switch (mode) {
    case 'mean':
      return values.reduce((a, b) => a + b, 0) / values.length
    case 'median': {
      const s = [...values].sort((a, b) => a - b)
      const m = s.length >> 1
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
    }
    case 'max':
      return Math.max(...values)
    case 'min':
      return Math.min(...values)
  }
}

// Timestamp when the field hit its min/max within a lap (used for min/max tooltips)
function lapExtremeTime(entry: Record<string, { values: number[]; times: number[] }> | undefined, field: string, mode: AggMode): number | null {
  if (!entry || !entry[field]) return null
  const { values, times } = entry[field]
  if (!values.length) return null
  let idx = 0
  for (let i = 1; i < values.length; i++) {
    if (mode === 'max' ? values[i] > values[idx] : values[i] < values[idx]) idx = i
  }
  return times[idx] ?? null
}

function fmtExtremeTime(t: number | null): string {
  if (t === null) return ''
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

// ─── CHART ───────────────────────────────────────────────────────────────────
function LapChart({ sig, points }: {
  sig: SignalDef
  points: LapPoint[]
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const tooltip = tooltipRef.current
    if (!canvas || !tooltip) return

    const dpr = window.devicePixelRatio || 1
    const W = canvas.offsetWidth, H = canvas.offsetHeight
    if (!W || !H) return
    canvas.width = W * dpr; canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    const PAD = { t: 28, b: 48, l: 64, r: 28 }
    const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b
    const FONT = '11px IBM Plex Mono,monospace'
    const LABEL = '#7a8fa3'

    ctx.clearRect(0, 0, W, H)

    const vals = points.map(p => p.agg)
    const yMin = Math.min(...vals), yMax = Math.max(...vals)
    const yRange = yMax - yMin || 1
    const yPad = yRange * 0.15
    const yLo = yMin - yPad, yHi = yMax + yPad

    const lapNums = points.map(p => p.lap)
    const xMin = Math.min(...lapNums), xMax = Math.max(...lapNums)
    const xRange = xMax - xMin || 1

    const toX = (l: number) => PAD.l + ((l - xMin) / xRange) * cW
    const toY = (v: number) => PAD.t + cH - ((v - yLo) / (yHi - yLo)) * cH

    // Grid
    ctx.strokeStyle = '#ffffff0a'; ctx.lineWidth = 0.5
    for (let i = 0; i <= 5; i++) {
      const y = PAD.t + (i / 5) * cH
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + cW, y); ctx.stroke()
    }

    // Y axis labels
    ctx.font = FONT; ctx.fillStyle = LABEL; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
    for (let i = 0; i <= 5; i++) {
      const v = yHi - (i / 5) * (yHi - yLo)
      const y = PAD.t + (i / 5) * cH
      ctx.fillText(v.toFixed(sig.decimals <= 1 ? 1 : 2), PAD.l - 8, y)
    }

    // Y axis unit label (rotated)
    ctx.save()
    ctx.translate(14, PAD.t + cH / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.font = '10px IBM Plex Mono,monospace'; ctx.fillStyle = LABEL; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(sig.unit || '', 0, 0)
    ctx.restore()

    // X axis labels
    ctx.font = FONT; ctx.fillStyle = LABEL; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
    points.forEach(p => {
      ctx.fillText('Lap ' + p.lap, toX(p.lap), PAD.t + cH + 8)
    })

    // Axes
    ctx.strokeStyle = '#ffffff18'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t + cH); ctx.lineTo(PAD.l + cW, PAD.t + cH); ctx.stroke()

    // Connected trend line
    if (points.length >= 2) {
      ctx.beginPath()
      ctx.moveTo(toX(points[0].lap), toY(points[0].agg))
      points.slice(1).forEach(p => ctx.lineTo(toX(p.lap), toY(p.agg)))
      ctx.strokeStyle = sig.color + '80'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.setLineDash([6, 3])
      ctx.stroke(); ctx.setLineDash([])
    }

    // Scatter dots with glow + value labels
    points.forEach(p => {
      const x = toX(p.lap), y = toY(p.agg)
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2)
      ctx.fillStyle = sig.color + '18'; ctx.fill()
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.fillStyle = sig.color; ctx.fill()
      ctx.strokeStyle = '#ffffff30'; ctx.lineWidth = 1.5; ctx.stroke()
      ctx.font = '11px IBM Plex Mono,monospace'; ctx.fillStyle = sig.color
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
      ctx.fillText(p.agg.toFixed(sig.decimals <= 1 ? 1 : 2), x, y - 10)
    })

    // Hover tooltip
    const hitData = points.map(p => ({ x: toX(p.lap), y: toY(p.agg), point: p }))
    const dec = sig.decimals <= 1 ? 1 : 2

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const HIT_RADIUS = 18
      let closest: { x: number; y: number; point: LapPoint } | null = null
      let closestDist = Infinity
      for (const h of hitData) {
        const d = Math.sqrt((mx - h.x) ** 2 + (my - h.y) ** 2)
        if (d < HIT_RADIUS && d < closestDist) { closest = h; closestDist = d }
      }
      if (!closest) { tooltip.style.display = 'none'; canvas.style.cursor = ''; return }
      canvas.style.cursor = 'crosshair'
      const timeStr = closest.point.extremeT
        ? `<div style="color:var(--muted);margin-top:3px">${fmtExtremeTime(closest.point.extremeT)}</div>`
        : ''
      tooltip.innerHTML =
        `<span style="color:var(--muted)">Lap </span><span style="color:${sig.color};font-weight:600">${closest.point.lap}</span>` +
        `<span style="color:var(--border3)"> · </span><span style="color:${sig.color};font-weight:600">${closest.point.agg.toFixed(dec)}</span>` +
        `<span style="color:var(--muted)"> ${sig.unit}</span>${timeStr}`
      const wrap = canvas.parentElement
      if (!wrap) return
      const wrapRect = wrap.getBoundingClientRect()
      let tx = e.clientX - wrapRect.left + 14
      let ty = e.clientY - wrapRect.top - 38
      tooltip.style.display = 'block'
      const ttW = tooltip.offsetWidth
      if (tx + ttW > wrapRect.width - 8) tx = e.clientX - wrapRect.left - ttW - 14
      if (ty < 4) ty = e.clientY - wrapRect.top + 14
      tooltip.style.left = tx + 'px'
      tooltip.style.top = ty + 'px'
    }

    const onLeave = () => { tooltip.style.display = 'none' }
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mouseleave', onLeave)
    return () => {
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mouseleave', onLeave)
    }
  }, [sig, points])

  return (
    <div className="la-chart-wrap">
      <canvas ref={canvasRef} id="laCanvas"></canvas>
      <div ref={tooltipRef} id="laTooltip" style={{ display: 'none', position: 'absolute', pointerEvents: 'none', background: 'var(--navy2)', border: '1px solid var(--border3)', padding: '6px 10px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', whiteSpace: 'nowrap', zIndex: 10, boxShadow: '0 2px 8px rgba(0,0,0,.4)' }}></div>
    </div>
  )
}

// ─── LAP ANALYSIS TAB ────────────────────────────────────────────────────────
function LapAnalysisTab() {
  const [agg, setAgg] = useState<AggMode>('mean')
  const [field, setField] = useState('')
  const [lapFrom, setLapFrom] = useState('1')
  const [lapTo, setLapTo] = useState('999')

  const sig = useMemo(
    () => getState().signals.find(s => s.field === field) ?? null,
    [field],
  )

  const { lapMap, totalLaps } = useMemo(() => {
    const map = getLapData()
    return { lapMap: map, totalLaps: Object.keys(map).length }
  }, [])

  const { visiblePoints } = useMemo(() => {
    if (!field || !sig) return { visiblePoints: [] }
    const laps = Object.keys(lapMap).map(Number).sort((a, b) => a - b)
    const pts = laps.map(lap => {
      const entry = lapMap[lap]
      const vals = entry?.[field]?.values
      const times = entry?.[field]?.times
      const a = aggregate(vals, agg)
      let extremeT: number | null = null
      if (vals && times && vals.length && (agg === 'min' || agg === 'max')) {
        extremeT = lapExtremeTime(entry, field, agg)
      }
      return { lap, agg: a, count: vals ? vals.length : 0, extremeT }
    }).filter((p): p is LapPoint => p.agg !== null)

    const rangeFrom = parseInt(lapFrom, 10) || 1
    const rangeTo = parseInt(lapTo, 10) || 999
    return { visiblePoints: pts.filter(p => p.lap >= rangeFrom && p.lap <= rangeTo) }
  }, [field, sig, agg, lapMap, lapFrom, lapTo])

  const dec = sig ? (sig.decimals <= 1 ? 1 : 2) : 2

  const showTime = agg === 'min' || agg === 'max'

  // Stats bar — computed over the visible window only
  const stats = useMemo(() => {
    if (!sig || !visiblePoints.length) return null
    const vals2 = visiblePoints.map(p => p.agg)
    const bestVal = agg === 'min' ? Math.min(...vals2) : Math.max(...vals2)
    const worstVal = agg === 'min' ? Math.max(...vals2) : Math.min(...vals2)
    const mean = vals2.reduce((a, b) => a + b, 0) / vals2.length
    const trend = vals2.length >= 2 ? vals2[vals2.length - 1] - vals2[0] : 0
    const bestPoint = visiblePoints.find(p => p.agg === bestVal)
    const worstPoint = visiblePoints.find(p => p.agg === worstVal)
    return {
      shown: visiblePoints.length,
      total: totalLaps,
      mean,
      bestVal,
      worstVal,
      trend,
      bestSub: showTime ? `Lap ${bestPoint?.lap ?? '—'} · ${fmtExtremeTime(bestPoint?.extremeT ?? null)}` : '',
      worstSub: showTime ? `Lap ${worstPoint?.lap ?? '—'} · ${fmtExtremeTime(worstPoint?.extremeT ?? null)}` : '',
    }
  }, [sig, visiblePoints, agg, showTime, totalLaps])

  const noSelection = !field || !sig
  const noLaps = !noSelection && visiblePoints.length < 1

  return (
    <div className="la-tab">
      <div className="la-toolbar">
        <span className="la-toolbar-label">Metric</span>
        <div className="la-metric-select-wrap">
          <select value={field} onChange={e => setField(e.target.value)}>
            <option value="">— pick a metric —</option>
            {getState().stages.map(stage => {
              const stageSignals = getState().signals.filter(s => s.stage === stage.id)
              if (!stageSignals.length) return null
              return (
                <optgroup key={stage.id} label={stage.label}>
                  {stageSignals.map(sig2 => (
                    <option key={sig2.field} value={sig2.field}>{sig2.label}{sig2.unit ? ` (${sig2.unit})` : ''}</option>
                  ))}
                </optgroup>
              )
            })}
          </select>
        </div>
        <span className="la-toolbar-label" style={{ marginLeft: 8 }}>Aggregation</span>
        <div className="la-agg-toggle">
          {AGG_MODES.map(m => (
            <button
              key={m}
              className={`la-agg-btn${agg === m ? ' on' : ''}`}
              onClick={() => setAgg(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <span className="la-toolbar-label" style={{ marginLeft: 8 }}>Laps</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <input
            type="number"
            min={0}
            max={999}
            value={lapFrom}
            onChange={e => setLapFrom(e.target.value)}
            style={{ width: 54, textAlign: 'center', background: 'var(--navy3)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600, padding: '4px 6px', outline: 'none' }}
          />
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)' }}>→</span>
          <input
            type="number"
            min={0}
            max={999}
            value={lapTo}
            onChange={e => setLapTo(e.target.value)}
            style={{ width: 54, textAlign: 'center', background: 'var(--navy3)', border: '1px solid var(--border2)', borderRadius: 4, color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600, padding: '4px 6px', outline: 'none' }}
          />
        </div>
      </div>

      <div className="la-body">
        {noSelection && (
          <div className="la-empty">
            <div className="plot-empty-hint">Select a metric above to compare lap averages</div>
            <div className="plot-empty-sub">Each dot = one lap · connected line shows trend</div>
          </div>
        )}

        {noLaps && (
          <div className="la-empty">
            <div className="plot-empty-hint">No laps in that range</div>
            <div className="plot-empty-sub">Try adjusting the lap range above</div>
          </div>
        )}

        {sig && visiblePoints.length > 0 && (
          <>
            <LapChart
              sig={sig}
              points={visiblePoints}
            />
            {stats && (
              <div className="la-stats-row">
                <div className="la-stat-card">
                  <div className="la-stat-card-label">Showing</div>
                  <div className="la-stat-card-val">{stats.shown}<span className="la-stat-card-unit">/ {stats.total} laps</span></div>
                </div>
                <div className="la-stat-card">
                  <div className="la-stat-card-label">Mean (shown)</div>
                  <div className="la-stat-card-val">{stats.mean.toFixed(dec)}<span className="la-stat-card-unit">{sig.unit}</span></div>
                </div>
                <div className="la-stat-card">
                  <div className="la-stat-card-label">Best</div>
                  <div className="la-stat-card-val" style={{ color: '#3d9e6b' }}>{stats.bestVal.toFixed(dec)}<span className="la-stat-card-unit">{sig.unit}</span></div>
                  {stats.bestSub && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>{stats.bestSub}</div>}
                </div>
                <div className="la-stat-card">
                  <div className="la-stat-card-label">Worst</div>
                  <div className="la-stat-card-val" style={{ color: '#c94f3e' }}>{stats.worstVal.toFixed(dec)}<span className="la-stat-card-unit">{sig.unit}</span></div>
                  {stats.worstSub && <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>{stats.worstSub}</div>}
                </div>
                <div className="la-stat-card">
                  <div className="la-stat-card-label">Trend (first→last)</div>
                  <div className="la-stat-card-val" style={{ color: stats.trend >= 0 ? '#3d9e6b' : '#c94f3e' }}>{stats.trend >= 0 ? '+' : ''}{stats.trend.toFixed(dec)}<span className="la-stat-card-unit">{sig.unit}</span></div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default LapAnalysisTab
