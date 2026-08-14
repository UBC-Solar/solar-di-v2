import { useEffect, useMemo, useRef } from 'react'
import type { TooltipComponentFormatterCallbackParams as TopLevelFormatterParams } from 'echarts'
import type { EChartsType } from 'echarts/core'
import type { EChartsCoreOption } from './EChart'
import { EChart } from './EChart'
import { useTelemetry } from '../telemetry'
import { MAX_MS } from '../telemetry/constants'
import type { Point, SignalDef } from '../telemetry/types'
import { CHART, TOOLTIP_CSS, fmtClock, fmtVal, hexToRgba } from './charts/theme'

// Port of js/data.js, rendered through ECharts instead of a rAF canvas loop.
// React builds the option declaratively (store-subscribed, one rebuild per emit
// in live mode) and ECharts handles DPR/rendering/resize. All pan/zoom/touch
// interactions are attached manually so the behaviour matches the original
// canvas widget exactly (4%/notch wheel zoom pivoting at the cursor, 0.3× drag
// pan, pinch, 5s–1h clamp, any pan/zoom freezes the window, dbl-click resets).

export interface View {
  staticMode: boolean
  staticFrom: number | null
  staticTo: number | null
  windowSec: number
  activeFields: string[]
}

interface SeriesData {
  m: SignalDef
  pts: Point[]
  yMin: number
  yMax: number
}

// History is time-sorted; slice the visible window with two binary searches so
// a 1-hour trace doesn't get re-scanned on every live tick.
function sliceWindow(pts: Point[], f: number, t: number): Point[] {
  if (!pts.length) return []
  let lo = 0, hi = pts.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (pts[mid].t < f) lo = mid + 1
    else hi = mid - 1
  }
  const start = lo
  let searchLo = start
  let end = pts.length - 1
  while (searchLo <= end) {
    const mid = (searchLo + end) >> 1
    if (pts[mid].t <= t) searchLo = mid + 1
    else end = mid - 1
  }
  return pts.slice(start, end + 1)
}

function PlotCanvas({ view, onWindow, onReset }: {
  view: View
  onWindow: (f: number, t: number) => void
  onReset: () => void
}) {
  const { signals, history, nowMs } = useTelemetry()

  const wrapRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<EChartsType | null>(null)

  // Refs are written in effects (not render) per react-hooks/refs; the DOM
  // handlers read them, so updates land before the next interaction.
  const viewRef = useRef(view)
  const onWindowRef = useRef(onWindow)
  const onResetRef = useRef(onReset)
  useEffect(() => { viewRef.current = view }, [view])
  useEffect(() => { onWindowRef.current = onWindow }, [onWindow])
  useEffect(() => { onResetRef.current = onReset }, [onReset])

  // Live mode: the window rides along with the store's emit clock (`nowMs`
  // bumps once per tick). Static mode: the window is fixed, so the memo stays
  // stable and a frozen frame never rebuilds as new data keeps arriving.
  const liveNow = view.staticMode ? (view.staticTo ?? nowMs) : nowMs

  const win = useMemo(() => {
    const v = view
    if (v.staticMode && v.staticFrom && v.staticTo) return { f: v.staticFrom, t: v.staticTo, isStatic: true }
    const t = liveNow
    return { f: t - v.windowSec * 1000, t, isStatic: false }
  }, [view, liveNow])

  const chart = useMemo(() => {
    const v = view
    const fields = Array.from(v.activeFields)
    const metrics = fields
      .map(f => signals.find(x => x.field === f))
      .filter((m): m is SignalDef => Boolean(m))
    if (!metrics.length) return null

    const { f, t } = win
    const seriesData: SeriesData[] = metrics.map(m => {
      const pts = sliceWindow(history[m.field], f, t)
      let yMin = m.yMin, yMax = m.yMax
      if (pts.length > 1) {
        const vs = pts.map(d => d.v)
        const lo = Math.min(...vs), hi = Math.max(...vs)
        const pad = (hi - lo) * .12 || .5
        // Zoom into the visible data when it sits inside the manifest's nominal
        // range; otherwise (e.g. car signals, whose dynamic yMin/yMax default to
        // 0..1) widen the domain so the trace is never clamped off-screen.
        const inside = lo >= m.yMin && hi <= m.yMax
        const clo = inside ? Math.max(m.yMin, lo - pad) : Math.min(m.yMin, lo - pad)
        const chi = inside ? Math.min(m.yMax, hi + pad) : Math.max(m.yMax, hi + pad)
        if (clo < chi) { yMin = clo; yMax = chi }
      }
      return { m, pts, yMin, yMax }
    })

    const count = seriesData.length
    const gridLeft = Math.min(CHART.axisW * count, 140)
    const areaAlpha = count > 1 ? 0.03 : 0.08

    const meta = new Map<string, { unit: string; decimals: number; color: string }>()
    seriesData.forEach(s => meta.set(s.m.label, { unit: s.m.unit, decimals: s.m.decimals, color: s.m.color }))

    const series: unknown[] = seriesData.map((s, i) => ({
      id: s.m.field,
      name: s.m.label,
      type: 'line',
      xAxisIndex: 0,
      yAxisIndex: i,
      data: s.pts.map(p => [p.t, p.v]),
      showSymbol: false,
      symbol: 'circle',
      symbolSize: 4,
      animation: false,
      lineStyle: { color: s.m.color, width: 1.5 },
      itemStyle: { color: s.m.color },
      areaStyle: { color: hexToRgba(s.m.color, areaAlpha) },
      ...(s.yMin < 0 && s.yMax > 0
        ? {
            markLine: {
              silent: true,
              symbol: 'none',
              animation: false,
              lineStyle: { type: 'dashed', color: hexToRgba(s.m.color, 0.19), width: 1 },
              label: { show: false },
              data: [{ yAxis: 0 }],
            },
          }
        : {}),
    }))

    // Live endpoint dot per series (a scatter riding the last sample).
    if (!win.isStatic) {
      seriesData.forEach((s, i) => {
        const lp = s.pts[s.pts.length - 1]
        if (!lp) return
        series.push({
          id: s.m.field + ':live',
          name: s.m.label,
          type: 'scatter',
          xAxisIndex: 0,
          yAxisIndex: i,
          data: [[lp.t, lp.v]],
          symbol: 'circle',
          symbolSize: 7,
          animation: false,
          itemStyle: { color: s.m.color, borderColor: '#0d1b2a', borderWidth: 1.5 },
          tooltip: { show: false },
          z: 10,
        })
      })
    }

    const option = {
      animation: false,
      grid: {
        left: gridLeft,
        right: 12,
        top: CHART.gridTop,
        bottom: CHART.gridBottom,
        containLabel: false,
      },
      xAxis: {
        type: 'time',
        min: f,
        max: t,
        axisLine: { lineStyle: { color: CHART.axis, width: 1 } },
        axisTick: {
          show: true,
          length: 3,
          lineStyle: { color: CHART.axis, width: 0.5 },
        },
        axisLabel: {
          color: CHART.label,
          fontFamily: CHART.font,
          fontSize: CHART.fontSize,
          formatter: (val: number) => {
            if (win.isStatic) return fmtClock(val)
            const s = Math.round((win.t - val) / 1000)
            return s === 0 ? 'now' : `-${s}s`
          },
        },
        splitLine: { show: false },
      },
      yAxis: seriesData.map((s, i) => ({
        id: 'y' + s.m.field,
        type: 'value',
        position: 'left',
        offset: i * CHART.axisW,
        min: s.yMin,
        max: s.yMax,
        splitNumber: 5,
        name: s.m.unit || '',
        nameLocation: 'middle',
        nameRotate: 90,
        nameGap: 8,
        nameTextStyle: {
          color: hexToRgba(s.m.color, 0.6),
          fontFamily: CHART.font,
          fontSize: 9,
        },
        axisLine: { lineStyle: { color: hexToRgba(s.m.color, 0.38), width: 1.5 } },
        axisTick: { show: false },
        axisLabel: {
          color: hexToRgba(s.m.color, 0.8),
          fontFamily: CHART.font,
          fontSize: CHART.fontSize,
          formatter: (val: number) => fmtVal(val, s.m.decimals),
        },
        // Only the first axis draws split lines; the rest share the same grid.
        splitLine: i === 0
          ? { show: true, lineStyle: { color: CHART.grid, width: 0.5 } }
          : { show: false },
      })),
      series,
      tooltip: {
        trigger: 'axis',
        appendToBody: true,
        confine: true,
        backgroundColor: '#0c1622',
        borderColor: 'rgba(255,255,255,.16)',
        borderWidth: 1,
        padding: 0,
        textStyle: { color: '#d8e2ee', fontFamily: CHART.font, fontSize: 11 },
        extraCssText: TOOLTIP_CSS,
        axisPointer: {
          type: 'line',
          lineStyle: { color: 'rgba(255,255,255,.12)', type: 'dashed', width: 1 },
        },
        formatter: (params: TopLevelFormatterParams) => {
          const arr = Array.isArray(params) ? params : [params]
          if (!arr.length) return ''
          const first = arr[0]
          const time = Array.isArray(first.value) ? Number(first.value[0]) : win.t
          const rows = arr.map(p => {
            const md = meta.get(p.seriesName ?? '')
            const val = Array.isArray(p.value) ? Number(p.value[1]) : Number(p.value)
            const color = md?.color ?? p.color ?? '#d8e2ee'
            return (
              `<div style="display:flex;align-items:center;gap:7px;margin-top:4px">` +
              `<span style="width:6px;height:6px;border-radius:1px;background:${color};flex-shrink:0"></span>` +
              `<span style="color:#506070;font-size:10px;flex:1">${p.seriesName}</span>` +
              `<span style="font-size:12px;font-weight:500;color:${color}">${fmtVal(val, md?.decimals ?? 1)}` +
              `<span style="font-size:9px;color:#506070;margin-left:3px">${md?.unit ?? ''}</span></span></div>`
            )
          }).join('')
          return (
            `<div style="font-family:${CHART.font};font-size:11px;color:#d8e2ee;min-width:150px">` +
            `<div style="font-size:9px;color:#506070;letter-spacing:.06em;margin-bottom:6px;text-transform:uppercase">${fmtClock(time)}</div>` +
            rows +
            `</div>`
          )
        },
      },
    } as EChartsCoreOption

    return { option, showEmpty: count === 1 && seriesData[0].pts.length < 2 }
  }, [signals, history, view, win])

  // ── Interactions (ported 1:1 from the original canvas widget) ─────────────
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    let dragStartX: number | null = null
    let dragStartWindow: { f: number; t: number } | null = null
    let lastTouches: { x: number; y: number }[] | null = null

    const padL = () => Math.min(CHART.axisW * Math.max(viewRef.current.activeFields.length, 1), 140)

    const getWindow = () => {
      const v = viewRef.current
      if (v.staticMode && v.staticFrom && v.staticTo) return { f: v.staticFrom, t: v.staticTo }
      const t = Date.now()
      return { f: t - v.windowSec * 1000, t }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const cW = rect.width - padL() - 12
      const mouseX = e.clientX - rect.left - padL()
      const frac = Math.max(0, Math.min(1, mouseX / cW))
      const { f, t } = getWindow()
      const span = t - f
      const factor = e.deltaY > 0 ? 1.04 : 0.96
      const newSpan = Math.max(5000, Math.min(MAX_MS, span * factor))
      const pivot = f + frac * span
      onWindowRef.current(pivot - frac * newSpan, pivot + (1 - frac) * newSpan)
    }
    el.addEventListener('wheel', onWheel, { passive: false })

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      dragStartX = e.clientX
      dragStartWindow = getWindow()
      el.classList.add('panning')
      chartRef.current?.dispatchAction({ type: 'hideTip' })
    }
    const onWindowMove = (e: MouseEvent) => {
      if (dragStartX === null) return
      const rect = el.getBoundingClientRect()
      const cW = rect.width - padL() - 12
      if (cW <= 0) return
      const dx = e.clientX - dragStartX
      const { f, t } = dragStartWindow!
      const span = t - f
      const shift = -(dx / cW) * span * 0.3
      onWindowRef.current(f + shift, t + shift)
      chartRef.current?.dispatchAction({ type: 'hideTip' })
    }
    const onWindowUp = () => {
      dragStartX = null
      dragStartWindow = null
      el.classList.remove('panning')
    }
    const onDblClick = () => onResetRef.current()
    el.addEventListener('mousedown', onMouseDown)
    el.addEventListener('dblclick', onDblClick)
    window.addEventListener('mousemove', onWindowMove)
    window.addEventListener('mouseup', onWindowUp)

    // ── Touch: pinch-zoom + single-finger pan ────────────────────────────────
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault()
      lastTouches = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }))
    }
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      const touches = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }))
      if (!lastTouches || touches.length !== lastTouches.length) { lastTouches = touches; return }

      const rect = el.getBoundingClientRect()
      const cW = rect.width - padL() - 12
      const { f, t } = getWindow()
      const span = t - f

      if (touches.length === 1) {
        const dx = touches[0].x - lastTouches[0].x
        const shift = -(dx / cW) * span * 0.3
        onWindowRef.current(f + shift, t + shift)
      } else if (touches.length === 2) {
        const prevDist = Math.abs(lastTouches[1].x - lastTouches[0].x)
        const currDist = Math.abs(touches[1].x - touches[0].x)
        if (prevDist === 0) { lastTouches = touches; return }
        const scale = prevDist / currDist
        const midX = ((touches[0].x + touches[1].x) / 2) - rect.left - padL()
        const frac = Math.max(0, Math.min(1, midX / cW))
        const newSpan = Math.max(5000, Math.min(MAX_MS, span * scale))
        const pivot = f + frac * span
        onWindowRef.current(pivot - frac * newSpan, pivot + (1 - frac) * newSpan)
      }
      lastTouches = touches
    }
    const onTouchEnd = () => { lastTouches = null }
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)

    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('mousedown', onMouseDown)
      el.removeEventListener('dblclick', onDblClick)
      window.removeEventListener('mousemove', onWindowMove)
      window.removeEventListener('mouseup', onWindowUp)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  return (
    <div className="canvas-wrap">
      <EChart
        id="plotCanvas"
        chartRef={chartRef}
        divRef={wrapRef}
        option={chart?.option ?? {}}  // placeholder; chart is always built for >=1 field
      />
      {chart?.showEmpty && (
        <div className="plot-empty-overlay">
          {win.isStatic ? 'No data in selected range' : 'Waiting for data…'}
        </div>
      )}
      <div className="chart-hint">scroll to zoom · drag to pan · dbl-click to reset</div>
    </div>
  )
}

export { PlotCanvas }
