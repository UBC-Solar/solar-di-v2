import { useMemo, useState } from 'react'
import { useTelemetry } from '../telemetry'
import { CALC_MAPPING, resolveFields } from '../telemetry/signalMapping'
import type { Point, SignalDef } from '../telemetry/types'
import { EChart } from '../components/EChart'
import type { EChartsCoreOption } from '../components/EChart'
import { CHART, TOOLTIP_CSS, fmtVal, hexToRgba } from '../components/charts/theme'
import type { DefaultLabelFormatterCallbackParams as CallbackDataParams } from 'echarts'

// Port of js/lapanalysis.js. React owns the toolbar, stats row, and empty
// states; the per-lap scatter/trend chart renders through ECharts (see
// LapChart). The tab is subscribed to the store so the metric dropdown and lap
// map follow the live manifest; switching source clears the selection until a
// metric is picked again.

type AggMode = 'mean' | 'median' | 'max' | 'min'

const AGG_MODES: AggMode[] = ['mean', 'median', 'max', 'min']

interface LapPoint {
  lap: number
  agg: number
  count: number
  extremeT: number | null
}

// ─── DATA PREP ───────────────────────────────────────────────────────────────
// Group each signal's values by the lap that was in effect at each sample's
// timestamp. The lap in effect at time t is the value of the latest LapIndex
// sample with timestamp <= t (histories are time-sorted). Aligning by time —
// rather than by array index — keeps grouping correct when signals stream at
// different sample rates, as real Sunbeam data does; the simulator happens to
// share timestamps, so it produces the same result as the old index pairing.
// lapIndexField comes from the resolved CALC_MAPPING.lapIndex concept, so car
// events that rename LapIndex still group correctly.
function getLapData(
  signals: SignalDef[],
  history: Record<string, Point[]>,
  lapIndexField: string | null,
): Record<number, Record<string, { values: number[]; times: number[] }>> {
  const lapIdxHistory = lapIndexField ? history[lapIndexField] : undefined
  if (!lapIdxHistory || !lapIdxHistory.length) return {}

  const lapMap: Record<number, Record<string, { values: number[]; times: number[] }>> = {}
  signals.forEach(sig => {
    const h = history[sig.field]
    if (!h || !h.length) return
    // Walking pointer over the lap history; both arrays are time-sorted.
    let li = 0
    for (let i = 0; i < h.length; i++) {
      const t = h[i].t
      while (li + 1 < lapIdxHistory.length && lapIdxHistory[li + 1].t <= t) li++
      if (lapIdxHistory[li].t > t) continue // no lap sample recorded yet at this time
      const lap = Math.round(lapIdxHistory[li].v)
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
  const option = useMemo<EChartsCoreOption>(() => {
    const vals = points.map(p => p.agg)
    const yMin = Math.min(...vals), yMax = Math.max(...vals)
    const yRange = yMax - yMin || 1
    const yPad = yRange * 0.15
    const yLo = yMin - yPad, yHi = yMax + yPad
    const dec = sig.decimals <= 1 ? 1 : 2

    const series: unknown[] = []

    // Connected dashed trend line (drawn behind the dots, no tooltip).
    if (points.length >= 2) {
      series.push({
        type: 'line',
        data: points.map(p => p.agg),
        showSymbol: false,
        animation: false,
        silent: true,
        lineStyle: { type: 'dashed', color: hexToRgba(sig.color, 0.5), width: 2 },
        itemStyle: { color: sig.color },
        z: 2,
      })
    }

    // Scatter dots with glow + value labels; item tooltip shows the extreme
    // timestamp for min/max aggregation modes.
    series.push({
      type: 'scatter',
      data: points.map(p => p.agg),
      symbol: 'circle',
      symbolSize: 10,
      animation: false,
      itemStyle: {
        color: sig.color,
        borderColor: '#ffffff30',
        borderWidth: 1.5,
        shadowBlur: 10,
        shadowColor: hexToRgba(sig.color, 0.27),
      },
      label: {
        show: true,
        position: 'top',
        distance: 10,
        color: sig.color,
        fontFamily: CHART.font,
        fontSize: 11,
        formatter: (p: CallbackDataParams) => fmtVal(Number(p.value), sig.decimals),
      },
      tooltip: {
        trigger: 'item',
        appendToBody: true,
        confine: true,
        backgroundColor: '#0c1622',
        borderColor: 'rgba(255,255,255,.16)',
        borderWidth: 1,
        padding: 0,
        textStyle: { color: '#d8e2ee', fontFamily: CHART.font, fontSize: 11 },
        extraCssText: TOOLTIP_CSS,
        formatter: (p: CallbackDataParams) => {
          const point = points[p.dataIndex]
          if (!point) return ''
          const timeStr = point.extremeT
            ? `<div style="color:var(--muted);margin-top:3px">${fmtExtremeTime(point.extremeT)}</div>`
            : ''
          return (
            `<div style="font-family:var(--mono);font-size:11px;color:var(--text);white-space:nowrap">` +
            `<span style="color:var(--muted)">Lap </span><span style="color:${sig.color};font-weight:600">${point.lap}</span>` +
            `<span style="color:rgba(255,255,255,.14)"> · </span><span style="color:${sig.color};font-weight:600">${point.agg.toFixed(dec)}</span>` +
            `<span style="color:var(--muted)"> ${sig.unit}</span>${timeStr}</div>`
          )
        },
      },
      z: 4,
    })

    return {
      animation: false,
      grid: { left: 64, right: 28, top: 44, bottom: 48 },
      xAxis: {
        type: 'category',
        data: points.map(p => 'Lap ' + p.lap),
        boundaryGap: false,
        axisLine: { lineStyle: { color: CHART.axis, width: 1 } },
        axisTick: { show: false },
        axisLabel: { color: CHART.label, fontFamily: CHART.font, fontSize: 11 },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        min: yLo,
        max: yHi,
        splitNumber: 5,
        name: sig.unit || '',
        nameLocation: 'middle',
        nameRotate: 90,
        nameGap: 16,
        nameTextStyle: { color: CHART.label, fontFamily: CHART.font, fontSize: 10 },
        axisLine: { lineStyle: { color: CHART.axis, width: 1 } },
        axisTick: { show: false },
        axisLabel: {
          color: CHART.label,
          fontFamily: CHART.font,
          fontSize: 11,
          formatter: (val: number) => fmtVal(val, sig.decimals),
        },
        splitLine: { show: true, lineStyle: { color: CHART.grid, width: 0.5 } },
      },
      series,
    } as EChartsCoreOption
  }, [sig, points])

  return (
    <div className="la-chart-wrap">
      <EChart id="laCanvas" option={option} />
    </div>
  )
}

// ─── LAP ANALYSIS TAB ────────────────────────────────────────────────────────
function LapAnalysisTab() {
  const { signals, stages, history, dataSource, dataVersion } = useTelemetry()

  const [agg, setAgg] = useState<AggMode>('mean')
  const [field, setField] = useState('')
  const [lapFrom, setLapFrom] = useState('1')
  const [lapTo, setLapTo] = useState('999')

  // Clear the selection when the source changes; the previous metric belongs
  // to a manifest that may not exist anymore. (Adjusted during render, per
  // React's "adjusting state when a prop changes".)
  const [prevSource, setPrevSource] = useState(dataSource)
  if (prevSource !== dataSource) {
    setPrevSource(dataSource)
    setField('')
    setLapFrom('1')
    setLapTo('999')
  }

  const calcFields = useMemo(() => resolveFields(signals, CALC_MAPPING), [signals])
  const lapIndexField = calcFields['lapIndex'] ?? null

  const sig = useMemo(
    () => signals.find(s => s.field === field) ?? null,
    [signals, field],
  )

  const { lapMap, totalLaps } = useMemo(() => {
    void dataVersion // recompute when new data arrives (history is mutated in place)
    const map = getLapData(signals, history, lapIndexField)
    return { lapMap: map, totalLaps: Object.keys(map).length }
  }, [signals, history, lapIndexField, dataVersion])

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
  const noLapData = !noSelection && !lapIndexField
  const noLapsYet = !noSelection && !!lapIndexField && totalLaps < 1
  const noLaps = !noSelection && !!lapIndexField && totalLaps >= 1 && visiblePoints.length < 1

  return (
    <div className="la-tab">
      <div className="la-toolbar">
        <span className="la-toolbar-label">Metric</span>
        <div className="la-metric-select-wrap">
          <select value={field} onChange={e => setField(e.target.value)}>
            <option value="">— pick a metric —</option>
            {stages.map(stage => {
              const stageSignals = signals.filter(s => s.stage === stage.id)
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

        {noLapData && (
          <div className="la-empty">
            <div className="plot-empty-hint">No lap data in this event yet</div>
            <div className="plot-empty-sub">Its signal manifest has no LapIndex. Lap analysis will populate once the car provides lap index telemetry.</div>
          </div>
        )}

        {noLapsYet && (
          <div className="la-empty">
            <div className="plot-empty-hint">No laps recorded yet</div>
            <div className="plot-empty-sub">Waiting for lap index data to arrive from the stream.</div>
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
