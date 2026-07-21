// ─── CHECK LEAFLET CODE ───────────────────────────────────────────────────
if (typeof L === 'undefined') {
  document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0d1b2a;font-family:'IBM Plex Mono',monospace;color:#f0f4f8;flex-direction:column;gap:16px;padding:32px;text-align:center">
    <div style="font-size:18px;font-weight:700;color:#c94f3e">Leaflet failed to load</div>
    <div style="font-size:13px;color:#7a8fa3;max-width:400px;line-height:1.7">
      lib/leaflet.js is missing or failed to load. Check that the file exists in your app's lib/ folder.
    </div>
  </div>`;
  throw new Error('Leaflet not loaded');
}

// ─── DATA VIEW (Graph vs Map) ─────────────────────────────────────────────────
let currentDataView = 'graph';

function setDataView(view) { /* map is now its own tab */ }

// ─── TAB SWITCHING ────────────────────────────────────────────────────────────
let activeTab = 'overview';

function switchTab(tab) {
  activeTab = tab;
  document.getElementById('tabOverview').classList.toggle('active', tab==='overview');
  document.getElementById('tabData').classList.toggle('active', tab==='data');
  document.getElementById('tabMap').classList.toggle('active', tab==='map');
  document.getElementById('tabCalc').classList.toggle('active', tab==='calc');
  document.getElementById('tabLapAnalysis').classList.toggle('active', tab==='lapanalysis');
  document.getElementById('signalSearch').closest('.header-search').classList.toggle('hidden', tab!=='data');

  // hide all panels
  document.getElementById('overviewTab').classList.remove('active');
  document.getElementById('dataTab').classList.add('hidden');
  document.getElementById('mapTab').style.display = 'none';
  document.getElementById('calcTab').classList.remove('active');
  document.getElementById('lapAnalysisTab').classList.add('hidden');
  document.getElementById('sidebar').classList.add('hidden');
  document.getElementById('sidebarToggle').classList.add('hidden');

  if (tab === 'overview') {
    document.getElementById('overviewTab').classList.add('active');
    stopLoop();
    stopReplay();
    if (leafletMap) { leafletMap.remove(); leafletMap = null; }
    mapPolylines = []; replayMarker = null; mapFitted = false;
    startOverviewLoop();
  } else if (tab === 'data') {
    stopOverviewLoop();
    stopReplay();
    if (leafletMap) { leafletMap.remove(); leafletMap = null; }
    mapPolylines = []; replayMarker = null; mapFitted = false;
    document.getElementById('dataTab').classList.remove('hidden');
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('sidebarToggle').classList.remove('hidden');
    if (activeFields.size > 0 && !staticMode) startLoop();
  } else if (tab === 'map') {
    stopOverviewLoop(); stopLoop();
    stopReplay();
    if (leafletMap) { leafletMap.remove(); leafletMap = null; }
    mapPolylines = []; replayMarker = null; mapFitted = false;
    const mapTabEl = document.getElementById('mapTab');
    mapTabEl.style.display = 'flex';
    // Build map UI inside mapTab
    const metricOpts = SIGNALS.map(m =>
      `<option value="${m.field}" ${m.field === colorByField ? 'selected' : ''}>${m.label}</option>`
    ).join('');
    mapTabEl.innerHTML = `
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
          <div class="calc-range-mode">
            <button class="calc-mode-btn on" id="mapModeTime" onclick="setMapMode('time')">Time</button>
            <button class="calc-mode-btn" id="mapModeLap" onclick="setMapMode('lap')">Lap</button>
          </div>
          <div class="calc-inputs-time" id="mapInputsTime">
            <span class="ts-label">From</span>
            <span id="dtMapStart" class="dt-picker"></span>
            <span class="ts-label">To</span>
            <span id="dtMapEnd" class="dt-picker"></span>
          </div>
          <div class="calc-inputs-lap hidden" id="mapInputsLap">
            <span class="ts-label">Lap</span>
            <input class="lap-input" type="number" id="mapLapFrom" min="0" max="999" value="1">
            <span class="lap-range-sep" id="mapLapRangeSep">→</span>
            <input class="lap-input" type="number" id="mapLapTo" min="0" max="999" value="1">
            <button class="lap-single-toggle" id="mapLapSingleBtn" onclick="toggleMapLapSingle()">Single lap</button>
          </div>
          <button class="ts-apply" onclick="applyMapRange()">Apply</button>
          <button class="replay-btn" id="replayBtn" onclick="toggleReplay()">▶ Replay</button>
        </div>
      </div>
      <div class="map-wrap"><div id="leafletMap"></div></div>
    `;
    leafletMap = L.map('leafletMap', { zoomControl:true, attributionControl:true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:'© OpenStreetMap contributors', maxZoom:19,
    }).addTo(leafletMap);
    mapTabMode = 'time';
    mapLapSingleMode = false;
    dtInit('dtMapStart', null);
    dtInit('dtMapEnd',   null);
    // Prefill time pickers to full history range
    if (gpsHistory.length >= 2) {
      dtSet('dtMapStart', gpsHistory[0].t);
      dtSet('dtMapEnd',   gpsHistory[gpsHistory.length-1].t);
    } else {
      const now = Date.now();
      dtSet('dtMapStart', now - 60000);
      dtSet('dtMapEnd',   now);
    }
    mapRangeStart = 0; mapRangeEnd = 1;
    drawMapTrace();
  } else if (tab === 'lapanalysis') {
    stopOverviewLoop(); stopLoop();
    stopReplay();
    if (leafletMap) { leafletMap.remove(); leafletMap = null; }
    mapPolylines = []; replayMarker = null; mapFitted = false;
    document.getElementById('lapAnalysisTab').classList.remove('hidden');
    populateLaMetricSelect();
    renderLapAnalysis();
  } else {
    stopOverviewLoop();
    stopReplay();
    if (leafletMap) { leafletMap.remove(); leafletMap = null; }
    mapPolylines = []; replayMarker = null; mapFitted = false;
    document.getElementById('calcTab').classList.add('active');
    stopLoop();
    if (!dtState['dtCalcFrom']) dtInit('dtCalcFrom', null);
    if (!dtState['dtCalcTo'])   dtInit('dtCalcTo',   null);
    prefillCalcInputs();
  }
}


// ── Seed 3 laps of historical data ──────────────────────────────────────────
function seedHistory() {
  const LAP_DURATION_MS = 4 * 60 * 1000; // 4 min per lap (simulated)
  const TICK_INTERVAL_MS = 2000;          // one point every 2s
  const now = Date.now();
  const seed = {
    TotalPackVoltage: 122, AcceleratorPosition: 0.32, BatteryCurrent: 52,
    BatteryVoltage: 116, CurrentSensor1: 4.1, CurrentSensor2: 3.9, MechBrakePressed: 0,
    PackCurrent: 50, VehicleVelocity: 15.5, VoltSensor1: 51, VoltSensor2: 50, VoltageofLeast: 3.82,
    PackPower: 6100, MotorPower: 5700,
    EnergyVOLExtrapolated: 2500, EnergyFromIntegratedPower: 2400,
    Efficiency1Hour: 285, Efficiency5Minute: 305, EfficiencyLap: 295,
    LapIndex: 1, TrackIndex: 0.0, LapIndexSpreadsheet: 1,
    TrackDistSpreadsheet: 0,
    AirTemperature: 27.5, DHI: 78, DNI: 640, GHI: 695,
    PrecipitationRate: 0, WindDirection: 178, WindSpeed: 3.4, Zenith: 43,
    SteeringAngle: 0.0, SOC: 0.795,
  };
  const sw = (v, s, lo, hi) => Math.min(hi, Math.max(lo, v + (Math.random() - .5) * s));
  const totalTicks = Math.floor((3 * LAP_DURATION_MS) / TICK_INTERVAL_MS);
  let wpSeed = 0;

  for (let tick = 0; tick < totalTicks; tick++) {
    const t = now - (totalTicks - tick) * TICK_INTERVAL_MS;
    const lapProgress = (tick % (LAP_DURATION_MS / TICK_INTERVAL_MS)) / (LAP_DURATION_MS / TICK_INTERVAL_MS);
    const lapNum = 1 + Math.floor(tick / (LAP_DURATION_MS / TICK_INTERVAL_MS));

    seed.TotalPackVoltage    = sw(seed.TotalPackVoltage, 0.4, 80, 160);
    seed.AcceleratorPosition = sw(seed.AcceleratorPosition, 0.04, 0, 1);
    seed.BatteryCurrent      = sw(seed.BatteryCurrent, 4, -50, 200);
    seed.BatteryVoltage      = sw(seed.BatteryVoltage, 0.3, 0, 160);
    seed.CurrentSensor1      = sw(seed.CurrentSensor1, 0.15, 0, 10);
    seed.CurrentSensor2      = sw(seed.CurrentSensor2, 0.15, 0, 10);
    seed.MechBrakePressed    = Math.random() < 0.02 ? 1 : 0;
    seed.PackCurrent         = sw(seed.PackCurrent, 3, -50, 200);
    seed.VehicleVelocity     = sw(seed.VehicleVelocity, 0.8, 0, 50);
    seed.VoltSensor1         = sw(seed.VoltSensor1, 0.25, 0, 80);
    seed.VoltSensor2         = sw(seed.VoltSensor2, 0.25, 0, 80);
    seed.VoltageofLeast      = sw(seed.VoltageofLeast, 0.008, 2.5, 4.2);
    seed.PackPower           = seed.PackCurrent * seed.TotalPackVoltage;
    seed.MotorPower          = seed.BatteryCurrent * seed.BatteryVoltage * (seed.BatteryCurrent < 0 ? -1 : 1);
    seed.EnergyVOLExtrapolated     = sw(seed.EnergyVOLExtrapolated, 4, 0, 5000);
    seed.EnergyFromIntegratedPower = sw(seed.EnergyFromIntegratedPower, 4, 0, 5000);
    seed.Efficiency1Hour     = sw(seed.Efficiency1Hour, 4, 0, 800);
    seed.Efficiency5Minute   = sw(seed.Efficiency5Minute, 7, 0, 800);
    seed.EfficiencyLap       = sw(seed.EfficiencyLap, 5, 0, 800);
    seed.LapIndex            = lapNum;
    seed.TrackIndex          = lapProgress;
    seed.LapIndexSpreadsheet = lapNum;
    seed.TrackDistSpreadsheet= lapProgress * 5040;
    seed.AirTemperature      = sw(seed.AirTemperature, 0.04, -10, 45);
    seed.DHI                 = sw(seed.DHI, 1.5, 0, 400);
    seed.DNI                 = sw(seed.DNI, 4, 0, 1000);
    seed.GHI                 = sw(seed.GHI, 4, 0, 1200);
    seed.PrecipitationRate   = sw(seed.PrecipitationRate, 0.005, 0, 50);
    seed.WindDirection       = sw(seed.WindDirection, 0.8, 0, 360);
    seed.WindSpeed           = sw(seed.WindSpeed, 0.08, 0, 20);
    seed.Zenith              = sw(seed.Zenith, 0.04, 0, 90);
    seed.SteeringAngle       = sw(seed.SteeringAngle, 4, -180, 180);
    seed.SOC                 = sw(seed.SOC, 0.0008, 0, 1);

    SIGNALS.forEach(sig => {
      if (seed[sig.field] !== undefined) {
        const m = sig;
        const v = m.transform ? m.transform(seed[sig.field]) : seed[sig.field];
        history[sig.field].push({ t, v });
      }
    });
    history['LapIndexSpreadsheet'].push({ t, v: seed.LapIndexSpreadsheet });
    const wp = WAYPOINTS[wpSeed % WAYPOINTS.length]; wpSeed++;
    gpsHistory.push({ t, lat: wp[0], lon: wp[1] });
  }
}


function refreshActiveTab() {
  switch (activeTab) {
    case 'overview':    renderOverview(); break;
    case 'data':        if (activeFields.size > 0) render(); break;
    case 'map':         switchTab('map'); break;
    case 'lapanalysis': renderLapAnalysis(); break;
  }
}


// ── BOOT — app init, runs after every other file is loaded ──
seedHistory();
dummyTickInterval = setInterval(dummyTick, 500);
switchTab('overview');
window.addEventListener('resize', () => {
  if (leafletMap) leafletMap.invalidateSize();
  if (document.getElementById('plotCanvas') && activeFields.size > 0) render();
  if (activeTab === 'lapanalysis') renderLapAnalysis();
});