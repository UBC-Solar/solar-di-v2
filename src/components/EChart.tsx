import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import * as echarts from 'echarts/core'
import type { EChartsType } from 'echarts/core'
import type { EChartsCoreOption } from 'echarts/core'
import { LineChart, ScatterChart } from 'echarts/charts'
import {
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

// Tree-shaken ECharts registration. Full `import * as echarts from 'echarts'`
// pulls in every chart/component; registering only what this app uses keeps the
// bundle small (echarts/core + the specific modules below).
echarts.use([
  LineChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  CanvasRenderer,
])

interface EChartProps {
  option: EChartsCoreOption
  id?: string
  className?: string
  // Optional live handle to the underlying chart instance (for dispatchAction,
  // e.g. hiding the tooltip during drag in the data plot).
  chartRef?: MutableRefObject<EChartsType | null>
  // Optional handle to the container div (for attaching DOM listeners, e.g.
  // wheel/drag pan in the data plot).
  divRef?: MutableRefObject<HTMLDivElement | null>
}

function EChart({ option, id, className, chartRef, divRef }: EChartProps) {
  const elRef = useRef<HTMLDivElement>(null)
  const innerChartRef = useRef<EChartsType | null>(null)

  // init/dispose once per mount. StrictMode double-invokes effects in dev; the
  // cleanup disposes so the second init gets a fresh DOM element.
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    const chart = echarts.init(el)
    innerChartRef.current = chart
    if (chartRef) chartRef.current = chart
    if (divRef) divRef.current = el

    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(el)

    return () => {
      ro.disconnect()
      chart.dispose()
      innerChartRef.current = null
      if (chartRef) chartRef.current = null
      if (divRef) divRef.current = null
    }
  }, [chartRef, divRef])

  // Rebuild on every option change. Series carry stable `id`s so ECharts merges
  // by id (add/remove signals without leaving stale series) while keeping the
  // diff cheap per live tick.
  useEffect(() => {
    // Full replace (not merge): the app passes a complete declarative option on
    // every rebuild, and ECharts' by-id merge corrupts the multi-yAxis → series
    // binding when the axis count changes (1→2→3 signals), leaving traces
    // mapped to the wrong scale / off-screen. notMerge keeps the layout exact.
    innerChartRef.current?.setOption(option, { notMerge: true })
  }, [option])

  return <div ref={elRef} id={id} className={className} />
}

export { EChart }
export type { EChartsCoreOption }
