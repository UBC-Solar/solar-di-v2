// ── Map tab: Leaflet map, trace drawing, replay controls ──
// ─── LEAFLET MAP ───────────────────────────────────────────────────────────────
let leafletMap = null, mapPolylines = [], replayMarker = null;
let replayTimer = null, replayIdx = 0, isPlaying = false;
let colorByField = 'VehicleVelocity', mapRangeStart = 0, mapRangeEnd = 1, mapFitted = false;

function clearMapPanel() {
  stopReplay();
  if (leafletMap) { leafletMap.remove(); leafletMap = null; }
  mapPolylines = []; replayMarker = null; mapFitted = false;
}

function activateMap() {
  stopLoop(); clearMapPanel();
  activeField = null; activeFields.clear();
  SIGNALS.forEach(s => { const r = document.getElementById('sigrow-' + s.field); if(r) r.classList.remove('active'); });

  const area = document.getElementById('mainArea');
  area.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'map-panel';
  area.appendChild(panel);

  const metricOpts = SIGNALS.map(m =>
    `<option value="${m.field}" ${m.field === colorByField ? 'selected' : ''}>${m.label}</option>`
  ).join('');

  panel.innerHTML = `
    <div class="map-toolbar">
      <div class="map-toolbar-row1">
        <span class="plot-name">GPS Track</span>
        <div class="color-by">
          <span class="color-by-label">Color by</span>
          <select id="colorBySelect" onchange="setColorBy(this.value)">${metricOpts}</select>
        </div>
        <div class="map-legend">
          <span class="legend-lo" id="legendLo">low</span>
          <div class="legend-grad"></div>
          <span class="legend-hi" id="legendHi">high</span>
        </div>
      </div>
      <div class="map-toolbar-row2">
        <div class="scrubber-wrap">
          <span class="scrubber-label">Start</span>
          <span id="dtMapStart" class="dt-picker"></span>
          <input type="range" id="scrubStart" min="0" max="1000" value="0" step="1" oninput="onScrub('start')">
        </div>
        <div class="scrubber-wrap">
          <span class="scrubber-label">End</span>
          <span id="dtMapEnd" class="dt-picker"></span>
          <input type="range" id="scrubEnd" min="0" max="1000" value="1000" step="1" oninput="onScrub('end')">
        </div>
        <button class="replay-btn" id="replayBtn" onclick="toggleReplay()">▶ Replay</button>
        <div class="speed-wrap">
          <span class="speed-label">Speed</span>
          <select class="speed-select" id="replaySpeed">
            <option value="1">1×</option><option value="5">5×</option>
            <option value="10" selected>10×</option><option value="30">30×</option>
          </select>
        </div>
      </div>
    </div>
    <div class="map-wrap"><div id="leafletMap"></div></div>
  `;

  leafletMap = L.map('leafletMap', { zoomControl:true, attributionControl:true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:'© OpenStreetMap contributors', maxZoom:19,
  }).addTo(leafletMap);

  dtInit('dtMapStart', () => onMapPickerChange('start'));
  dtInit('dtMapEnd',   () => onMapPickerChange('end'));
  drawMapTrace(); syncTimeInputs();
}

function metricToColor(norm) {
  const r = norm < .5 ? Math.round(76 + (201-76)*norm*2) : Math.round(201+(224-201)*(norm-.5)*2);
  const g = norm < .5 ? Math.round(175+(168-175)*norm*2) : Math.round(168+(92-168)*(norm-.5)*2);
  const b = norm < .5 ? Math.round(61+(76-61)*norm*2)    : Math.round(76+(74-76)*(norm-.5)*2);
  return `rgb(${r},${g},${b})`;
}

function drawMapTrace() {
  if (!leafletMap) return;
  mapPolylines.forEach(p => p.remove()); mapPolylines = [];
  if (replayMarker) { replayMarker.remove(); replayMarker = null; }
  const n = gpsHistory.length;
  if (n < 1) return;
  if (n < 2) { leafletMap.setView([gpsHistory[0].lat, gpsHistory[0].lon], 15); return; }

  const iStart = Math.floor(mapRangeStart * (n - 1));
  const iEnd   = Math.ceil(mapRangeEnd * (n - 1));
  const pts    = gpsHistory.slice(iStart, iEnd + 1);
  if (pts.length < 2) return;

  const mDef = SIGNALS.find(x => x.field === colorByField);
  const mHist = history[colorByField];
  let allVals = [];
  pts.forEach(p => { const v = nearestMetric(mHist, p.t); if (v !== null) allVals.push(v); });
  const vMin = allVals.length ? Math.min(...allVals) : 0;
  const vMax = allVals.length ? Math.max(...allVals) : 1;
  const vRange = vMax - vMin || 1;

  const legendLo = document.getElementById('legendLo');
  const legendHi = document.getElementById('legendHi');
  if (legendLo) legendLo.textContent = vMin.toFixed(mDef ? mDef.decimals : 1) + (mDef ? ' ' + mDef.unit : '');
  if (legendHi) legendHi.textContent = vMax.toFixed(mDef ? mDef.decimals : 1) + (mDef ? ' ' + mDef.unit : '');

  for (let i = 0; i < pts.length; i++) {
    const v = nearestMetric(mHist, pts[i].t);
    const norm = v !== null ? (v - vMin) / vRange : 0.5;
    const col = metricToColor(norm);
    const dot = L.circleMarker([pts[i].lat, pts[i].lon], {
      radius: 3, color: col, fillColor: col, fillOpacity: 0.9, weight: 0
    }).addTo(leafletMap);
    mapPolylines.push(dot);
  }
  if (!mapFitted) {
    leafletMap.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lon])), { padding:[24,24] });
    mapFitted = true;
  }
  updateScrubInfo(iStart, iEnd, n);
}

function nearestMetric(hist, t) {
  if (!hist || !hist.length) return null;
  let lo = 0, hi = hist.length - 1;
  while (lo < hi) { const mid = (lo+hi)>>1; if (hist[mid].t < t) lo = mid+1; else hi = mid; }
  return hist[lo] ? hist[lo].v : null;
}

function setColorBy(field) { colorByField = field; drawMapTrace(); }

function onScrub(which) {
  const sEl = document.getElementById('scrubStart'), eEl = document.getElementById('scrubEnd');
  let s = parseInt(sEl.value), e = parseInt(eEl.value);
  if (s > e) { if (which === 'start') { sEl.value = e; s = e; } else { eEl.value = s; e = s; } }
  mapRangeStart = s / 1000; mapRangeEnd = e / 1000;
  syncTimeInputs(); stopReplay(); drawMapTrace();
}

function onMapPickerChange(which) {
  const n = gpsHistory.length; if (n < 2) return;
  const tFirst = gpsHistory[0].t, tLast = gpsHistory[n-1].t, tSpan = tLast - tFirst || 1;
  if (which === 'start') {
    const t = dtGet('dtMapStart'); if (!t) return;
    mapRangeStart = Math.max(0, Math.min(1, (t - tFirst) / tSpan));
    if (mapRangeStart >= mapRangeEnd) mapRangeStart = Math.max(0, mapRangeEnd - 0.001);
    document.getElementById('scrubStart').value = Math.round(mapRangeStart * 1000);
  } else {
    const t = dtGet('dtMapEnd'); if (!t) return;
    mapRangeEnd = Math.max(0, Math.min(1, (t - tFirst) / tSpan));
    if (mapRangeEnd <= mapRangeStart) mapRangeEnd = Math.min(1, mapRangeStart + 0.001);
    document.getElementById('scrubEnd').value = Math.round(mapRangeEnd * 1000);
  }
  stopReplay(); drawMapTrace();
}

function syncTimeInputs() {
  const n = gpsHistory.length; if (n < 2) return;
  const tFirst = gpsHistory[0].t, tLast = gpsHistory[n-1].t;
  const tSpan = tLast - tFirst || 1;
  dtSet('dtMapStart', tFirst + mapRangeStart * tSpan);
  dtSet('dtMapEnd',   tFirst + mapRangeEnd   * tSpan);
}

function updateScrubInfo(iStart, iEnd, n) {
  const tFirst = gpsHistory[0]?.t, tLast = gpsHistory[n-1]?.t;
  if (!tFirst || !tLast) return;
  syncTimeInputs();
}

function toggleReplay() {
  const btn = document.getElementById('replayBtn');
  if (isPlaying) { stopReplay(); return; }
  isPlaying = true; btn?.classList.add('playing');
  if (btn) btn.textContent = '⏹ Stop';
  const n = gpsHistory.length;
  const iStart = Math.floor(mapRangeStart*(n-1)), iEnd = Math.ceil(mapRangeEnd*(n-1));
  const pts = gpsHistory.slice(iStart, iEnd+1);
  if (pts.length < 2) { stopReplay(); return; }
  replayIdx = 0;
  if (replayMarker) replayMarker.remove();
  const carIcon = L.divIcon({ className:'', html:`<div style="width:12px;height:12px;border-radius:50%;background:#c9a84c;border:2px solid #fff;box-shadow:0 0 6px #c9a84c88;"></div>`, iconSize:[12,12], iconAnchor:[6,6] });
  replayMarker = L.marker([pts[0].lat,pts[0].lon],{icon:carIcon,zIndexOffset:1000}).addTo(leafletMap);
  function step() {
    if (!isPlaying) return;
    replayIdx++;
    if (replayIdx >= pts.length) { stopReplay(); return; }
    replayMarker.setLatLng([pts[replayIdx].lat,pts[replayIdx].lon]);
    const speedMul = 10;
    const dtReal = replayIdx < pts.length-1 ? pts[replayIdx+1].t - pts[replayIdx].t : 500;
    replayTimer = setTimeout(step, Math.max(16, dtReal/speedMul));
  }
  replayTimer = setTimeout(step, 100);
}

function stopReplay() {
  isPlaying = false; clearTimeout(replayTimer); replayTimer = null;
  const btn = document.getElementById('replayBtn');
  if (btn) { btn.classList.remove('playing'); btn.textContent = '▶ Replay'; }
}