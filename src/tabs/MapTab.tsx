import { useCallback, useEffect, useRef, useState } from 'react'
import { getState, useTelemetry } from '../telemetry'
import type { Point } from '../telemetry/types'
import type { CircleMarker, Map as LeafletMap, Marker } from 'leaflet'
import DateTimePicker from '../components/DateTimePicker'

// Port of js/app.js (map tab toolbar) + js/map.js (trace drawing, color scale,
// replay) + the Time/Lap range resolution from js/calculations.js. Leaflet is
// imported dynamically inside a mount effect (it touches window/document at
// module load), which also keeps this module SSR-safe for renderToString smokes.

function metricToColor(norm: number): string {
  const r = norm < .5 ? Math.round(76 + (201 - 76) * norm * 2) : Math.round(201 + (224 - 201) * (norm - .5) * 2)
  const g = norm < .5 ? Math.round(175 + (168 - 175) * norm * 2) : Math.round(168 + (92 - 168) * (norm - .5) * 2)
  const b = norm < .5 ? Math.round(61 + (76 - 61) * norm * 2) : Math.round(76 + (74 - 76) * (norm - .5) * 2)
  return `rgb(${r},${g},${b})`
}

function nearestMetric(hist: Point[] | undefined, t: number): number | null {
  if (!hist || !hist.length) return null
  let lo = 0, hi = hist.length - 1
  while (lo < hi) { const mid = (lo + hi) >> 1; if (hist[mid].t < t) lo = mid + 1; else hi = mid }
  return hist[lo] ? hist[lo].v : null
}

// LapIndex is the only lap source now (LapIndexSpreadsheet is gone from the
// manifest). Round to the nearest whole lap number, like the old lap tables.
function lapToTimeRange(lapNum: number): { tStart: number; tEnd: number } | null {
  const lapHist = getState().history['LapIndex']
  if (!lapHist || !lapHist.length) return null
  const pts = lapHist.filter(p => Math.round(p.v) === lapNum)
  if (!pts.length) return null
  return { tStart: pts[0].t, tEnd: pts[pts.length - 1].t }
}

const CAR_ICON_HTML =
  '<div style="width:12px;height:12px;border-radius:50%;background:#c9a84c;border:2px solid #fff;box-shadow:0 0 6px #c9a84c88;"></div>'

function MapTab() {
  const { signals, gpsHistory } = useTelemetry()

  // Color-by defaults to VehicleVelocity; falls back to the first manifest
  // signal when the car mode manifest doesn't provide it.
  const [colorBy, setColorByState] = useState(() => {
    const def = getState().signals.some(s => s.field === 'VehicleVelocity')
      ? 'VehicleVelocity'
      : getState().signals[0]?.field ?? ''
    return def
  })
  const colorByRef = useRef(colorBy)

  const [mode, setModeState] = useState<'time' | 'lap'>('time')
  const modeRef = useRef(mode)

  const [lapSingle, setLapSingle] = useState(false)
  const [lapFrom, setLapFrom] = useState('1')
  const [lapTo, setLapTo] = useState('1')

  // Picked range prefills to the full history span at mount time.
  const [fromDraft, setFromDraft] = useState(() => {
    const gps = getState().gpsHistory
    return gps.length >= 2 ? gps[0].t : Date.now() - 60_000
  })
  const [toDraft, setToDraft] = useState(() => {
    const gps = getState().gpsHistory
    return gps.length >= 2 ? gps[gps.length - 1].t : Date.now()
  })

  const [isPlaying, setIsPlaying] = useState(false)
  const isPlayingRef = useRef(false)

  const [replaySpeed, setReplaySpeed] = useState(10)
  const replaySpeedRef = useRef(replaySpeed)

  const leafletRef = useRef<typeof import('leaflet') | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markersRef = useRef<CircleMarker[]>([])
  const replayMarkerRef = useRef<Marker | null>(null)
  const replayTimerRef = useRef<number | null>(null)
  const replayIdxRef = useRef(0)
  const rangeRef = useRef({ start: 0, end: 1 })
  const fittedRef = useRef(false)
  const prevLenRef = useRef(gpsHistory.length)
  const legendLoRef = useRef<HTMLSpanElement>(null)
  const legendHiRef = useRef<HTMLSpanElement>(null)

  const stopReplay = useCallback(() => {
    isPlayingRef.current = false
    if (replayTimerRef.current !== null) {
      window.clearTimeout(replayTimerRef.current)
      replayTimerRef.current = null
    }
    setIsPlaying(false)
  }, [])

  const drawTrace = useCallback(() => {
    const map = mapRef.current
    const L = leafletRef.current
    if (!map || !L) return
    markersRef.current.forEach(mk => mk.remove())
    markersRef.current = []
    if (replayMarkerRef.current) { replayMarkerRef.current.remove(); replayMarkerRef.current = null }
    const gps = getState().gpsHistory
    const n = gps.length
    if (n < 1) return
    if (n < 2) { map.setView([gps[0].lat, gps[0].lon], 15); return }

    const { start, end } = rangeRef.current
    const iStart = Math.floor(start * (n - 1))
    const iEnd = Math.ceil(end * (n - 1))
    const pts = gps.slice(iStart, iEnd + 1)
    if (pts.length < 2) return

    const field = colorByRef.current
    const mDef = getState().signals.find(x => x.field === field)
    const mHist = getState().history[field]
    const allVals: number[] = []
    pts.forEach(p => { const v = nearestMetric(mHist, p.t); if (v !== null) allVals.push(v) })
    const vMin = allVals.length ? Math.min(...allVals) : 0
    const vMax = allVals.length ? Math.max(...allVals) : 1
    const vRange = vMax - vMin || 1

    const dec = mDef ? mDef.decimals : 1
    const unit = mDef ? ' ' + mDef.unit : ''
    if (legendLoRef.current) legendLoRef.current.textContent = vMin.toFixed(dec) + unit
    if (legendHiRef.current) legendHiRef.current.textContent = vMax.toFixed(dec) + unit

    for (let i = 0; i < pts.length; i++) {
      const v = nearestMetric(mHist, pts[i].t)
      const norm = v !== null ? (v - vMin) / vRange : 0.5
      const col = metricToColor(norm)
      const dot = L.circleMarker([pts[i].lat, pts[i].lon], {
        radius: 3, color: col, fillColor: col, fillOpacity: 0.9, weight: 0,
      }).addTo(map)
      markersRef.current.push(dot)
    }
    if (!fittedRef.current) {
      map.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lon])), { padding: [24, 24] })
      fittedRef.current = true
    }
  }, [])

  // Create the Leaflet map on mount; tear everything down on unmount.
  useEffect(() => {
    let cancelled = false
    import('leaflet').then(mod => {
      if (cancelled) return
      // Vite's prod build emits Leaflet's UMD as a default-only export; the
      // dev prebundle also exposes `default`, so read it explicitly.
      const L = (mod as unknown as { default: typeof import('leaflet') }).default
      leafletRef.current = L
      const map = L.map('leafletMap', { zoomControl: true, attributionControl: true })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors', maxZoom: 19,
      }).addTo(map)
      mapRef.current = map
      rangeRef.current = { start: 0, end: 1 }
      drawTrace()
    })
    return () => {
      cancelled = true
      stopReplay()
      markersRef.current.forEach(mk => mk.remove())
      markersRef.current = []
      if (replayMarkerRef.current) { replayMarkerRef.current.remove(); replayMarkerRef.current = null }
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      leafletRef.current = null
    }
  }, [drawTrace, stopReplay])

  // Live refresh: redraw once per store emit while data grows (or when a
  // teleport wipes history — reset the fit so the new area is reframed).
  useEffect(() => {
    const len = gpsHistory.length
    if (len < prevLenRef.current) fittedRef.current = false
    prevLenRef.current = len
    if (!mapRef.current) return
    if (isPlayingRef.current) return
    drawTrace()
  }, [gpsHistory.length, drawTrace])

  const setColorBy = useCallback((field: string) => {
    colorByRef.current = field
    setColorByState(field)
    if (mapRef.current) { stopReplay(); drawTrace() }
  }, [drawTrace, stopReplay])

  const setMode = useCallback((m: 'time' | 'lap') => {
    modeRef.current = m
    setModeState(m)
  }, [])

  const toggleLapSingle = useCallback(() => {
    setLapSingle(s => !s)
  }, [])

  const applyMapRange = useCallback(() => {
    const gps = getState().gpsHistory
    const n = gps.length
    if (n < 2) return
    const tFirst = gps[0].t, tLast = gps[n - 1].t, tSpan = tLast - tFirst || 1
    if (modeRef.current === 'time') {
      if (!fromDraft || !toDraft || fromDraft >= toDraft) return
      rangeRef.current = {
        start: Math.max(0, Math.min(1, (fromDraft - tFirst) / tSpan)),
        end: Math.max(0, Math.min(1, (toDraft - tFirst) / tSpan)),
      }
    } else {
      const lapA = parseInt(lapFrom, 10)
      const lapB = lapSingle ? lapA : parseInt(lapTo, 10)
      const r1 = lapToTimeRange(lapA)
      if (!r1) return
      const r2 = lapToTimeRange(lapB)
      const tS = r1.tStart, tE = (r2 || r1).tEnd
      rangeRef.current = {
        start: Math.max(0, Math.min(1, (tS - tFirst) / tSpan)),
        end: Math.max(0, Math.min(1, (tE - tFirst) / tSpan)),
      }
    }
    stopReplay()
    drawTrace()
  }, [fromDraft, toDraft, lapFrom, lapTo, lapSingle, drawTrace, stopReplay])

  const toggleReplay = useCallback(() => {
    const map = mapRef.current
    const L = leafletRef.current
    if (!map || !L) return
    if (isPlayingRef.current) { stopReplay(); drawTrace(); return }
    const gps = getState().gpsHistory
    const n = gps.length
    if (n < 2) return
    const { start, end } = rangeRef.current
    const iStart = Math.floor(start * (n - 1))
    const iEnd = Math.ceil(end * (n - 1))
    const pts = gps.slice(iStart, iEnd + 1)
    if (pts.length < 2) return
    isPlayingRef.current = true
    setIsPlaying(true)
    replayIdxRef.current = 0
    if (replayMarkerRef.current) { replayMarkerRef.current.remove(); replayMarkerRef.current = null }
    const carIcon = L.divIcon({ className: '', html: CAR_ICON_HTML, iconSize: [12, 12], iconAnchor: [6, 6] })
    replayMarkerRef.current = L.marker([pts[0].lat, pts[0].lon], { icon: carIcon, zIndexOffset: 1000 }).addTo(map)
    const step = () => {
      if (!isPlayingRef.current) return
      replayIdxRef.current++
      if (replayIdxRef.current >= pts.length) { stopReplay(); drawTrace(); return }
      replayMarkerRef.current?.setLatLng([pts[replayIdxRef.current].lat, pts[replayIdxRef.current].lon])
      const dtReal = replayIdxRef.current < pts.length - 1 ? pts[replayIdxRef.current + 1].t - pts[replayIdxRef.current].t : 500
      replayTimerRef.current = window.setTimeout(step, Math.max(16, dtReal / replaySpeedRef.current))
    }
    replayTimerRef.current = window.setTimeout(step, 100)
  }, [drawTrace, stopReplay])

  const onSpeed = (v: string) => {
    const x = parseInt(v, 10) || 10
    replaySpeedRef.current = x
    setReplaySpeed(x)
  }

  return (
    <div id="mapTab">
      <div className="map-toolbar">
        <div className="map-toolbar-row1">
          <span className="plot-name">GPS Track</span>
          <div className="color-by">
            <span className="color-by-label">Color by</span>
            <select value={colorBy} onChange={e => setColorBy(e.target.value)}>
              {signals.map(s => (
                <option key={s.field} value={s.field}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="map-legend">
            <span className="legend-lo" ref={legendLoRef}>low</span>
            <div className="legend-grad"></div>
            <span className="legend-hi" ref={legendHiRef}>high</span>
          </div>
        </div>
        <div className="map-toolbar-row2">
          <div className="calc-range-mode">
            <button className={`calc-mode-btn${mode === 'time' ? ' on' : ''}`} onClick={() => setMode('time')}>Time</button>
            <button className={`calc-mode-btn${mode === 'lap' ? ' on' : ''}`} onClick={() => setMode('lap')}>Lap</button>
          </div>
          <div className={`calc-inputs-time${mode === 'time' ? '' : ' hidden'}`}>
            <span className="ts-label">From</span>
            <DateTimePicker value={fromDraft} onChange={setFromDraft} />
            <span className="ts-label">To</span>
            <DateTimePicker value={toDraft} onChange={setToDraft} />
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
            <button className={`lap-single-toggle${lapSingle ? ' on' : ''}`} onClick={toggleLapSingle}>Single lap</button>
          </div>
          <button className="ts-apply" onClick={applyMapRange}>Apply</button>
          <button className={`replay-btn${isPlaying ? ' playing' : ''}`} onClick={toggleReplay}>{isPlaying ? '⏹ Stop' : '▶ Replay'}</button>
          <div className="speed-wrap">
            <span className="speed-label">Speed</span>
            <select className="speed-select" value={replaySpeed} onChange={e => onSpeed(e.target.value)}>
              <option value={1}>1×</option>
              <option value={5}>5×</option>
              <option value={10}>10×</option>
              <option value={30}>30×</option>
            </select>
          </div>
        </div>
      </div>
      <div className="map-wrap"><div id="leafletMap" /></div>
    </div>
  )
}

export default MapTab
