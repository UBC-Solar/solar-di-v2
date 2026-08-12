import { useEffect, useRef } from 'react'
import { getState } from '../telemetry'
import { MAX_MS } from '../telemetry/constants'
import type { SignalDef } from '../telemetry/types'

// Port of js/data.js. The chart renders imperatively to canvas in a rAF loop
// that reads the store via getState() (no React re-render churn) plus a `view`
// snapshot passed by the parent. Live mode redraws every frame; static mode
// redraws only when the view object identity changes (useMemo in the parent) or
// the canvas is resized.

export interface View {
  staticMode: boolean
  staticFrom: number | null
  staticTo: number | null
  windowSec: number
  activeFields: string[]
}

interface SeriesData {
  m: SignalDef
  pts: { t: number; v: number }[]
  yMin: number
  yRange: number
}

interface RenderState {
  tStart: number
  tEnd: number
  tSpan: number
  cX: number
  cY: number
  cW: number
  cH: number
  seriesData: SeriesData[]
  isStatic: boolean
}

const Y_AXIS_W = 44
const PAD = { t: 12, b: 24, l: Math.min(Y_AXIS_W * 3, 140), r: 12 }
const GRID = '#ffffff0a'
const AXIS = '#ffffff18'
const LABEL = '#7a8fa3'
const FONT = '10px IBM Plex Mono,monospace'

function PlotCanvas({ view, onWindow, onReset }: {
  view: View
  onWindow: (f: number, t: number) => void
  onReset: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const viewRef = useRef(view)
  const onWindowRef = useRef(onWindow)
  const onResetRef = useRef(onReset)

  // Refs are written in effects (not render) per react-hooks/refs; the rAF loop
  // reads them each frame, so updates land before the next draw.
  useEffect(() => { viewRef.current = view }, [view])
  useEffect(() => { onWindowRef.current = onWindow }, [onWindow])
  useEffect(() => { onResetRef.current = onReset }, [onReset])

  const renderStateRef = useRef<RenderState | null>(null)
  const dirtyRef = useRef(true)
  const lastViewRef = useRef<View | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    const tooltip = tooltipRef.current
    if (!canvas || !overlay || !tooltip) return

    let raf = 0
    let dragStartX: number | null = null
    let dragStartWindow: { f: number; t: number } | null = null
    let lastTouches: { x: number; y: number }[] | null = null

    const padL = () => Math.min(Y_AXIS_W * Math.max(getState().activeFields.length, 1), 140)

    const getWindow = () => {
      const v = viewRef.current
      if (v.staticMode && v.staticFrom && v.staticTo) return { f: v.staticFrom, t: v.staticTo }
      const t = Date.now()
      return { f: t - v.windowSec * 1000, t }
    }

    const draw = () => {
      const state = getState()
      const v = viewRef.current
      const fields = Array.from(v.activeFields)
      if (fields.length === 0) return
      const metrics = fields.map(f => state.signals.find(x => x.field === f)).filter((m): m is SignalDef => Boolean(m))
      if (!metrics.length) return

      const dpr = window.devicePixelRatio || 1
      const W = canvas.offsetWidth, H = canvas.offsetHeight
      if (!W || !H) return
      canvas.width = W * dpr
      canvas.height = H * dpr
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)

      let tStart: number, tEnd: number
      const isStatic = v.staticMode && !!v.staticFrom && !!v.staticTo
      if (isStatic) { tStart = v.staticFrom!; tEnd = v.staticTo! }
      else { tEnd = Date.now(); tStart = tEnd - v.windowSec * 1000 }
      const tSpan = tEnd - tStart || 1

      const cX = PAD.l, cY = PAD.t
      const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b
      ctx.clearRect(0, 0, W, H)
      ctx.font = FONT

      const seriesData = metrics.map(m => {
        const pts = state.history[m.field].filter(d => d.t >= tStart && d.t <= tEnd)
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
        return { m, pts, yMin, yMax, yRange: (yMax - yMin) || 1 }
      })

      const toX = (t: number) => cX + ((t - tStart) / tSpan) * cW
      const toY = (s: SeriesData, v: number) => cY + cH - ((v - s.yMin) / s.yRange) * cH

      for (let i = 0; i <= 5; i++) {
        const y = cY + cH - (i / 5) * cH
        ctx.strokeStyle = GRID; ctx.lineWidth = .5
        ctx.beginPath(); ctx.moveTo(cX, y); ctx.lineTo(cX + cW, y); ctx.stroke()
      }

      seriesData.forEach((s, idx) => {
        const axX = PAD.l - Y_AXIS_W * (idx + 1)
        ctx.font = FONT
        for (let i = 0; i <= 5; i++) {
          const v = s.yMin + (s.yRange / 5) * i
          ctx.fillStyle = s.m.color + 'cc'
          ctx.textAlign = 'right'; ctx.textBaseline = 'middle'
          ctx.fillText(v.toFixed(s.m.decimals <= 1 ? 1 : 2), axX + Y_AXIS_W - 4, cY + cH - (i / 5) * cH)
        }
        ctx.strokeStyle = s.m.color + '60'; ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.moveTo(axX + Y_AXIS_W, cY); ctx.lineTo(axX + Y_AXIS_W, cY + cH); ctx.stroke()
        ctx.save()
        ctx.font = '9px IBM Plex Mono,monospace'
        ctx.fillStyle = s.m.color + '99'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.translate(axX + 7, cY + cH / 2); ctx.rotate(-Math.PI / 2)
        ctx.fillText(s.m.unit, 0, 0)
        ctx.restore()
      })

      const xN = Math.max(2, Math.min(8, Math.floor(cW / 90)))
      ctx.font = FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      for (let i = 0; i <= xN; i++) {
        const t = tStart + (i / xN) * tSpan
        const x = toX(t)
        let label: string
        if (isStatic) {
          const d = new Date(t)
          label = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
        } else {
          const s = Math.round((tEnd - t) / 1000)
          label = s === 0 ? 'now' : `-${s}s`
        }
        ctx.fillStyle = LABEL
        ctx.fillText(label, x, cY + cH + 6)
        ctx.strokeStyle = AXIS; ctx.lineWidth = .5
        ctx.beginPath(); ctx.moveTo(x, cY + cH); ctx.lineTo(x, cY + cH + 3); ctx.stroke()
      }

      ctx.strokeStyle = AXIS; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(cX, cY); ctx.lineTo(cX, cY + cH); ctx.lineTo(cX + cW, cY + cH); ctx.stroke()

      seriesData.forEach(s => {
        const { m, pts, yMin, yRange } = s
        if (pts.length < 2) {
          if (seriesData.length === 1) {
            ctx.fillStyle = LABEL; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
            ctx.font = '11px IBM Plex Mono,monospace'
            ctx.fillText(isStatic ? 'No data in selected range' : 'Waiting for data…', cX + cW / 2, cY + cH / 2)
          }
          return
        }
        ctx.save(); ctx.beginPath(); ctx.rect(cX, cY, cW, cH); ctx.clip()
        if (yMin < 0 && (yMin + yRange) > 0) {
          const z = toY(s, 0)
          ctx.strokeStyle = m.color + '30'; ctx.lineWidth = 1; ctx.setLineDash([4, 5])
          ctx.beginPath(); ctx.moveTo(cX, z); ctx.lineTo(cX + cW, z); ctx.stroke(); ctx.setLineDash([])
        }
        ctx.beginPath(); ctx.moveTo(toX(pts[0].t), toY(s, pts[0].v))
        pts.slice(1).forEach(p => ctx.lineTo(toX(p.t), toY(s, p.v)))
        ctx.lineTo(toX(pts[pts.length - 1].t), cY + cH); ctx.lineTo(toX(pts[0].t), cY + cH)
        ctx.closePath()
        ctx.fillStyle = m.color + (seriesData.length > 1 ? '08' : '14'); ctx.fill()
        ctx.beginPath(); ctx.moveTo(toX(pts[0].t), toY(s, pts[0].v))
        pts.slice(1).forEach(p => ctx.lineTo(toX(p.t), toY(s, p.v)))
        ctx.strokeStyle = m.color; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke()
        if (!isStatic) {
          const lp = pts[pts.length - 1]
          ctx.beginPath(); ctx.arc(toX(lp.t), toY(s, lp.v), 3.5, 0, Math.PI * 2)
          ctx.fillStyle = m.color; ctx.fill()
          ctx.strokeStyle = '#0d1b2a'; ctx.lineWidth = 1.5; ctx.stroke()
        }
        ctx.restore()
      })

      renderStateRef.current = { tStart, tEnd, tSpan, cX, cY, cW, cH, seriesData, isStatic }
    }

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const v = viewRef.current
      const needsDraw = !v.staticMode || v !== lastViewRef.current || dirtyRef.current
      lastViewRef.current = v
      dirtyRef.current = false
      if (needsDraw) draw()
    }
    raf = requestAnimationFrame(loop)

    const ro = new ResizeObserver(() => { dirtyRef.current = true })
    ro.observe(canvas)

    // ── Wheel zoom ───────────────────────────────────────────────────────────
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
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
    canvas.addEventListener('wheel', onWheel, { passive: false })

    // ── Mouse pan ────────────────────────────────────────────────────────────
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      dragStartX = e.clientX
      dragStartWindow = getWindow()
      canvas.classList.add('panning')
    }
    const onWindowMove = (e: MouseEvent) => {
      if (dragStartX === null) return
      const rect = canvas.getBoundingClientRect()
      const cW = rect.width - padL() - 12
      if (cW <= 0) return
      const dx = e.clientX - dragStartX
      const { f, t } = dragStartWindow!
      const span = t - f
      const shift = -(dx / cW) * span * 0.3
      onWindowRef.current(f + shift, t + shift)
    }
    const onWindowUp = () => {
      dragStartX = null; dragStartWindow = null
      canvas.classList.remove('panning')
    }
    const onDblClick = () => onResetRef.current()
    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('dblclick', onDblClick)
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

      const rect = canvas.getBoundingClientRect()
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
    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd)

    // ── Tooltip crosshair ────────────────────────────────────────────────────
    const syncOverlaySize = () => {
      const dpr = window.devicePixelRatio || 1
      const W = canvas.offsetWidth, H = canvas.offsetHeight
      overlay.width = W * dpr; overlay.height = H * dpr
      overlay.style.width = W + 'px'; overlay.style.height = H + 'px'
    }

    const drawCrosshair = (mouseX: number, mouseY: number) => {
      const rs = renderStateRef.current
      if (!rs) return
      const dpr = window.devicePixelRatio || 1
      syncOverlaySize()
      const ctx2 = overlay.getContext('2d')
      if (!ctx2) return
      ctx2.clearRect(0, 0, overlay.width, overlay.height)

      if (mouseX < rs.cX || mouseX > rs.cX + rs.cW || mouseY < rs.cY || mouseY > rs.cY + rs.cH) {
        tooltip.style.display = 'none'
        return
      }

      const tCursor = rs.tStart + ((mouseX - rs.cX) / rs.cW) * rs.tSpan

      ctx2.save(); ctx2.scale(dpr, dpr)
      ctx2.strokeStyle = '#ffffff18'; ctx2.lineWidth = 1; ctx2.setLineDash([4, 4])
      ctx2.beginPath(); ctx2.moveTo(mouseX, rs.cY); ctx2.lineTo(mouseX, rs.cY + rs.cH); ctx2.stroke()
      ctx2.setLineDash([])

      const rows = rs.seriesData.map(s => {
        const { m, pts, yMin, yRange } = s
        if (!pts.length) return null
        let lo = 0, hi = pts.length - 1
        while (lo < hi) { const mid = (lo + hi) >> 1; if (pts[mid].t < tCursor) lo = mid + 1; else hi = mid }
        const p = (lo > 0 && Math.abs(pts[lo - 1].t - tCursor) < Math.abs(pts[lo].t - tCursor)) ? pts[lo - 1] : pts[lo]
        const toY = (v: number) => rs.cY + rs.cH - ((v - yMin) / yRange) * rs.cH
        const px = rs.cX + ((p.t - rs.tStart) / rs.tSpan) * rs.cW
        const py = toY(p.v)
        ctx2.beginPath(); ctx2.arc(px, py, 7, 0, Math.PI * 2)
        ctx2.fillStyle = m.color + '22'; ctx2.fill()
        ctx2.beginPath(); ctx2.arc(px, py, 3.5, 0, Math.PI * 2)
        ctx2.fillStyle = m.color; ctx2.fill()
        ctx2.strokeStyle = '#0d1b2a'; ctx2.lineWidth = 1.5; ctx2.stroke()
        return { m, p }
      }).filter((r): r is { m: SignalDef; p: { t: number; v: number } } => r !== null)
      ctx2.restore()

      if (!rows.length) return
      const d = new Date(rows[0].p.t)
      const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
      tooltip.innerHTML = `<div class="plot-tooltip-time">${timeStr}</div>` + rows.map(r =>
        `<div class="plot-tooltip-row">
          <span class="plot-tooltip-dot" style="background:${r.m.color}"></span>
          <span class="plot-tooltip-label">${r.m.label}</span>
          <span class="plot-tooltip-val" style="color:${r.m.color}">${r.p.v.toFixed(r.m.decimals <= 1 ? 1 : 2)}<span style="font-size:9px;color:var(--muted);margin-left:3px">${r.m.unit}</span></span>
        </div>`
      ).join('')

      const wrap = canvas.parentElement
      if (!wrap) return
      const wRect = wrap.getBoundingClientRect()
      const cRect = canvas.getBoundingClientRect()
      const relX = mouseX + (cRect.left - wRect.left)
      const relY = mouseY + (cRect.top - wRect.top)
      const ttW = 180, ttH = 28 + rows.length * 26
      const left = relX + 14 + ttW > wRect.width ? relX - ttW - 10 : relX + 14
      const top = relY - ttH / 2 < 0 ? 4 : relY + ttH / 2 > wRect.height ? wRect.height - ttH - 4 : relY - ttH / 2
      tooltip.style.left = left + 'px'
      tooltip.style.top = top + 'px'
      tooltip.style.display = 'block'
    }

    const onCanvasMove = (e: MouseEvent) => {
      if (dragStartX !== null) return
      const rect = canvas.getBoundingClientRect()
      drawCrosshair(e.clientX - rect.left, e.clientY - rect.top)
    }
    const onCanvasLeave = () => {
      const ctx2 = overlay.getContext('2d')
      if (ctx2) ctx2.clearRect(0, 0, overlay.width, overlay.height)
      tooltip.style.display = 'none'
    }
    canvas.addEventListener('mousemove', onCanvasMove)
    canvas.addEventListener('mouseleave', onCanvasLeave)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('dblclick', onDblClick)
      window.removeEventListener('mousemove', onWindowMove)
      window.removeEventListener('mouseup', onWindowUp)
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onTouchEnd)
      canvas.removeEventListener('mousemove', onCanvasMove)
      canvas.removeEventListener('mouseleave', onCanvasLeave)
    }
  }, [])

  return (
    <div className="canvas-wrap">
      <canvas ref={canvasRef} id="plotCanvas"></canvas>
      <canvas ref={overlayRef} id="plotOverlay"></canvas>
      <div ref={tooltipRef} id="plotTooltip" className="plot-tooltip"></div>
      <div className="chart-hint">scroll to zoom · drag to pan · dbl-click to reset</div>
    </div>
  )
}

export { PlotCanvas }
