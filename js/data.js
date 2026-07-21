// ── Data tab: chart panel, render loop, window controls, CSV export ──
// ─── CHART PANEL ─────────────────────────────────────────────────────────────
let windowSec = 60;
let rafId = null;

function buildChartPanel() {
  const panel = document.getElementById('plotPanel');
  panel.className = 'plot-panel';
  const firstM = SIGNALS.find(x => activeFields.has(x.field));
  const titleColor = firstM ? firstM.color : 'var(--text)';

  panel.innerHTML = `
    <div class="plot-toolbar" id="plotToolbar" style="--card-color:${titleColor}">
      <div id="chartLegend" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:1;min-width:0;"></div>

      <div class="mode-toggle">
        <button class="mode-btn ${!staticMode?'on':''}" id="btnLive" onclick="setMode('live')">⬤ Live</button>
        <div class="mode-divider"></div>
        <button class="mode-btn ${staticMode?'on':''}" id="btnStatic" onclick="setMode('static')">⬛ Static</button>
      </div>

      <div class="static-inputs ${staticMode?'':'hidden'}" id="staticInputs">
        <span class="ts-label">From</span>
        <span id="dtFrom" class="dt-picker"></span>
        <span class="ts-label">To</span>
        <span id="dtTo" class="dt-picker"></span>
        <button class="ts-apply" onclick="applyStaticRange()">Apply</button>
      </div>

      <div class="static-inputs ${!staticMode?'':'hidden'}" id="liveInputs">
        <div class="presets">
          <button class="preset" onclick="setWin(30,this)">30s</button>
          <button class="preset" onclick="setWin(60,this)">1m</button>
          <button class="preset" onclick="setWin(300,this)">5m</button>
          <button class="preset" onclick="setWin(600,this)">10m</button>
        </div>
        <div class="win-wrap">
          <input class="win-num" id="winNum" type="number" min="5" max="3600" value="${windowSec}">
          <span style="font-size:10px;font-weight:500;color:var(--muted)">s</span>
        </div>
      </div>

      <span class="static-badge ${staticMode?'':'hidden'}" id="staticBadge">FROZEN</span>
      <button class="export-btn" id="exportBtn" onclick="exportCSV()" ${staticMode?'':'disabled'} title="Export visible data to CSV">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 1v7M3 5l3 3 3-3"/><path d="M1 9v1a1 1 0 001 1h8a1 1 0 001-1V9"/>
        </svg>
        Export CSV
      </button>
    </div>
    <div id="signalDescBar" class="signal-desc-bar"></div>
    <div class="canvas-wrap"><canvas id="plotCanvas"></canvas><canvas id="plotOverlay"></canvas><div id="plotTooltip" class="plot-tooltip"></div><div class="chart-hint">scroll to zoom · drag to pan · dbl-click to reset</div></div>
  `;
  const winNumEl = document.getElementById('winNum');
  if (winNumEl) winNumEl.addEventListener('change', function() {
    const v = parseInt(this.value);
    if (v >= 5 && v <= 3600) { windowSec = v; document.querySelectorAll('.preset').forEach(b => b.classList.remove('on')); }
  });
  setWinHighlight(windowSec);
  dtInit('dtFrom', null); dtInit('dtTo', null);
  prefillStaticInputs();
  updateChartLegend();
  updateSignalDesc();
  attachChartInteractions();
}

function updateChartLegend() {
  const el = document.getElementById('chartLegend');
  if (!el) return;
  el.innerHTML = '';
  SIGNALS.filter(m => activeFields.has(m.field)).forEach(m => {
    const chip = document.createElement('div');
    chip.style.cssText = `display:flex;align-items:center;gap:5px;cursor:pointer;padding:3px 8px 3px 6px;border-radius:4px;border:1px solid ${m.color}40;background:${m.color}10;transition:background .15s;`;
    chip.title = 'Click to remove ' + m.label;
    chip.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${m.color};flex-shrink:0;"></span><span style="font-size:12px;font-weight:600;color:${m.color};white-space:nowrap;">${m.label}</span><span style="font-size:11px;color:var(--muted);margin-left:2px;">${m.unit}</span>`;
    chip.addEventListener('mouseenter', () => chip.style.background = m.color + '20');
    chip.addEventListener('mouseleave', () => chip.style.background = m.color + '10');
    chip.addEventListener('click', () => activateSignal(m.field, true));
    el.appendChild(chip);
  });
  if (activeFields.size < 3) {
    const hint = document.createElement('span');
    hint.style.cssText = 'font-size:11px;color:var(--muted);font-style:italic;';
    hint.textContent = activeFields.size === 1 ? 'Ctrl+click to overlay up to 2 more signals' : 'Ctrl+click to overlay 1 more signal';
    el.appendChild(hint);
  }
  updateSignalDesc();
}

function updateSignalDesc() {
  const bar = document.getElementById('signalDescBar');
  if (!bar) return;
  const active = SIGNALS.filter(m => activeFields.has(m.field));
  if (active.length === 0) { bar.innerHTML = ''; bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  bar.innerHTML = active.map(m => `
    <div class="signal-desc-item">
      <span class="signal-desc-dot" style="background:${m.color}"></span>
      <span class="signal-desc-name" style="color:${m.color}">${m.label}</span>
      <span class="signal-desc-sep">—</span>
      <span class="signal-desc-text">${m.help}</span>
    </div>
  `).join('');
}
let staticMode = false, staticFrom = null, staticTo = null;

function prefillStaticInputs() {
  const now = Date.now();
  dtSet('dtFrom', staticFrom || now - windowSec * 1000);
  dtSet('dtTo',   staticTo   || now);
}

function setMode(mode) {
  staticMode = (mode === 'static');
  document.getElementById('btnLive')  ?.classList.toggle('on', !staticMode);
  document.getElementById('btnStatic')?.classList.toggle('on',  staticMode);
  document.getElementById('staticInputs')?.classList.toggle('hidden', !staticMode);
  document.getElementById('liveInputs')  ?.classList.toggle('hidden',  staticMode);
  document.getElementById('staticBadge') ?.classList.toggle('hidden', !staticMode);
  if (staticMode) {
    if (!staticFrom || !staticTo) { staticTo = Date.now(); staticFrom = staticTo - windowSec * 1000; }
    prefillStaticInputs(); stopLoop(); render();
    document.getElementById('exportBtn')?.removeAttribute('disabled');
  } else {
    staticFrom = null; staticTo = null; startLoop();
    document.getElementById('exportBtn')?.setAttribute('disabled', '');
  }
}

function applyStaticRange() {
  const f = dtGet('dtFrom'), t = dtGet('dtTo');
  if (!f || !t || f >= t) {
    const flash = id => { const el = document.getElementById(id); if(el){el.style.borderColor='var(--red)'; setTimeout(()=>el.style.borderColor='',1200);} };
    flash('dtFrom'); flash('dtTo'); return;
  }
  staticFrom = f; staticTo = t; stopLoop(); render();
}

function exportCSV() {
  if (!staticFrom || !staticTo) return;
  const fields = Array.from(activeFields);
  const metrics = fields.map(f => SIGNALS.find(x => x.field === f)).filter(Boolean);
  if (!metrics.length) return;

  // Collect all timestamps across active signals in range, sorted
  const allTs = new Set();
  metrics.forEach(m => {
    history[m.field].filter(p => p.t >= staticFrom && p.t <= staticTo).forEach(p => allTs.add(p.t));
  });
  const timestamps = Array.from(allTs).sort((a, b) => a - b);
  if (!timestamps.length) return;

  const t0 = timestamps[0];

  // Header rows — row 1: column names, row 2: units
  const nameHeader = ['timestamp_utc', 'elapsed_s', ...metrics.map(m => m.field)];
  const unitHeader = ['ISO8601',        's',          ...metrics.map(m => m.unit || '')];

  // Data rows
  const rows = timestamps.map(t => {
    const iso = new Date(t).toISOString(); // e.g. 2026-05-02T14:32:01.123Z
    const elapsed = ((t - t0) / 1000).toFixed(3);
    const vals = metrics.map(m => {
      const p = history[m.field].find(x => x.t === t);
      return p !== undefined ? p.v.toFixed(m.decimals <= 1 ? 1 : 3) : '';
    });
    return [iso, elapsed, ...vals];
  });

  const csv = [nameHeader, unitHeader, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const start = new Date(staticFrom).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const end   = new Date(staticTo).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.href = url; a.download = `telemetry_${start}_${end}.csv`;
  a.click(); URL.revokeObjectURL(url);
}


let _renderState = null;

// ─── CANVAS RENDERER ─────────────────────────────────────────────────────────
function render() {
  const canvas = document.getElementById('plotCanvas');
  if (!canvas) return;
  const fields = activeField ? [activeField] : Array.from(activeFields);
  if (fields.length === 0) return;
  const metrics = fields.map(f => SIGNALS.find(x => x.field === f)).filter(Boolean);
  if (!metrics.length) return;

  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth, H = canvas.offsetHeight;
  if (!W || !H) return;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);

  let tStart, tEnd, isStatic = staticMode && staticFrom && staticTo;
  if (isStatic) { tStart = staticFrom; tEnd = staticTo; }
  else { tEnd = Date.now(); tStart = tEnd - windowSec * 1000; }
  const tSpan = tEnd - tStart || 1;

  const Y_AXIS_W = 44;
  const PAD = { t:12, b:24, l:Math.min(Y_AXIS_W * metrics.length, 140), r:12 };
  const cX = PAD.l, cY = PAD.t, cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
  const GRID = '#ffffff0a', AXIS = '#ffffff18', LABEL = '#7a8fa3', FONT = '10px IBM Plex Mono,monospace';
  ctx.clearRect(0, 0, W, H); ctx.font = FONT;

  const seriesData = metrics.map(m => {
    const pts = history[m.field].filter(d => d.t >= tStart && d.t <= tEnd);
    let yMin = m.yMin, yMax = m.yMax;
    if (pts.length > 1) {
      const vs = pts.map(d => d.v), lo = Math.min(...vs), hi = Math.max(...vs);
      const pad = (hi - lo) * .12 || .5;
      const clo = Math.max(m.yMin, lo - pad), chi = Math.min(m.yMax, hi + pad);
      if (clo < chi) { yMin = clo; yMax = chi; }
    }
    return { m, pts, yMin, yMax, yRange: (yMax - yMin) || 1 };
  });

  const toX = t => cX + ((t - tStart) / tSpan) * cW;

  for (let i = 0; i <= 5; i++) {
    const y = cY + cH - (i / 5) * cH;
    ctx.strokeStyle = GRID; ctx.lineWidth = .5;
    ctx.beginPath(); ctx.moveTo(cX, y); ctx.lineTo(cX + cW, y); ctx.stroke();
  }

  seriesData.forEach((s, idx) => {
    const axX = PAD.l - Y_AXIS_W * (idx + 1);
    const toY = v => cY + cH - ((v - s.yMin) / s.yRange) * cH;
    ctx.font = FONT;
    for (let i = 0; i <= 5; i++) {
      const v = s.yMin + (s.yRange / 5) * i;
      ctx.fillStyle = s.m.color + 'cc'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(v.toFixed(s.m.decimals <= 1 ? 1 : 2), axX + Y_AXIS_W - 4, cY + cH - (i/5)*cH);
    }
    ctx.strokeStyle = s.m.color + '60'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(axX + Y_AXIS_W, cY); ctx.lineTo(axX + Y_AXIS_W, cY + cH); ctx.stroke();
    ctx.save(); ctx.font = '9px IBM Plex Mono,monospace'; ctx.fillStyle = s.m.color + '99';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.translate(axX + 7, cY + cH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText(s.m.unit, 0, 0); ctx.restore();
  });

  const xN = Math.max(2, Math.min(8, Math.floor(cW / 90)));
  ctx.font = FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let i = 0; i <= xN; i++) {
    const t = tStart + (i / xN) * tSpan, x = toX(t);
    let label;
    if (isStatic) {
      const d = new Date(t);
      label = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    } else {
      const s = Math.round((tEnd - t) / 1000);
      label = s === 0 ? 'now' : `-${s}s`;
    }
    ctx.fillStyle = LABEL; ctx.fillText(label, x, cY + cH + 6);
    ctx.strokeStyle = AXIS; ctx.lineWidth = .5;
    ctx.beginPath(); ctx.moveTo(x, cY + cH); ctx.lineTo(x, cY + cH + 3); ctx.stroke();
  }

  ctx.strokeStyle = AXIS; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cX, cY); ctx.lineTo(cX, cY + cH); ctx.lineTo(cX + cW, cY + cH); ctx.stroke();

  seriesData.forEach(s => {
    const { m, pts, yMin, yRange } = s;
    const toY = v => cY + cH - ((v - yMin) / yRange) * cH;
    if (pts.length < 2) {
      if (seriesData.length === 1) {
        ctx.fillStyle = LABEL; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '11px IBM Plex Mono,monospace';
        ctx.fillText(isStatic ? 'No data in selected range' : 'Waiting for data…', cX + cW / 2, cY + cH / 2);
      }
      return;
    }
    ctx.save(); ctx.beginPath(); ctx.rect(cX, cY, cW, cH); ctx.clip();
    if (yMin < 0 && (yMin + yRange) > 0) {
      const z = toY(0);
      ctx.strokeStyle = m.color + '30'; ctx.lineWidth = 1; ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.moveTo(cX, z); ctx.lineTo(cX + cW, z); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.beginPath(); ctx.moveTo(toX(pts[0].t), toY(pts[0].v));
    pts.slice(1).forEach(p => ctx.lineTo(toX(p.t), toY(p.v)));
    ctx.lineTo(toX(pts[pts.length-1].t), cY + cH); ctx.lineTo(toX(pts[0].t), cY + cH);
    ctx.closePath();
    ctx.fillStyle = m.color + (seriesData.length > 1 ? '08' : '14'); ctx.fill();
    ctx.beginPath(); ctx.moveTo(toX(pts[0].t), toY(pts[0].v));
    pts.slice(1).forEach(p => ctx.lineTo(toX(p.t), toY(p.v)));
    ctx.strokeStyle = m.color; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
    if (!isStatic) {
      const lp = pts[pts.length-1];
      ctx.beginPath(); ctx.arc(toX(lp.t), toY(lp.v), 3.5, 0, Math.PI*2);
      ctx.fillStyle = m.color; ctx.fill();
      ctx.strokeStyle = '#0d1b2a'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.restore();
  });

  // Cache state for tooltip
  _renderState = { tStart, tEnd, tSpan, cX, cY, cW, cH, seriesData, isStatic };
}

// ─── CHART INTERACTIONS (pan & zoom) ─────────────────────────────────────────
function attachChartInteractions() {
  const canvas = document.getElementById('plotCanvas');
  if (!canvas) return;

  // Helpers to get/set the current view window as absolute timestamps
  function getWindow() {
    if (staticMode && staticFrom && staticTo) return { f: staticFrom, t: staticTo };
    const t = Date.now();
    return { f: t - windowSec * 1000, t };
  }

  function setWindow(f, t) {
    const minSpan = 5000;       // 5 s minimum
    const maxSpan = MAX_MS;     // 1 hr maximum
    let span = t - f;
    if (span < minSpan) { const mid = (f + t) / 2; f = mid - minSpan / 2; t = mid + minSpan / 2; span = minSpan; }
    if (span > maxSpan) { const mid = (f + t) / 2; f = mid - maxSpan / 2; t = mid + maxSpan / 2; }
    // Clamp to available data
    const dataEnd = Date.now();
    if (t > dataEnd) { f -= (t - dataEnd); t = dataEnd; }
    staticFrom = f; staticTo = t;
    if (!staticMode) {
      staticMode = true;
      document.getElementById('btnLive')  ?.classList.remove('on');
      document.getElementById('btnStatic')?.classList.add('on');
      document.getElementById('staticInputs')?.classList.remove('hidden');
      document.getElementById('liveInputs')  ?.classList.add('hidden');
      document.getElementById('staticBadge') ?.classList.remove('hidden');
      stopLoop();
    }
    prefillStaticInputs();
    render();
  }

  // ── Wheel zoom ──────────────────────────────────────────────────────────────
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const PAD_L = Math.min(44 * Math.max(activeFields.size, 1), 140);
    const cW = rect.width - PAD_L - 12;
    const mouseX = e.clientX - rect.left - PAD_L;
    const frac = Math.max(0, Math.min(1, mouseX / cW)); // 0=left edge, 1=right edge

    const { f, t } = getWindow();
    const span = t - f;
    const factor = e.deltaY > 0 ? 1.04 : 0.96; // scroll down = zoom out
    const newSpan = Math.max(5000, Math.min(MAX_MS, span * factor));
    const pivot = f + frac * span; // keep time under cursor fixed
    setWindow(pivot - frac * newSpan, pivot + (1 - frac) * newSpan);
  }, { passive: false });

  // ── Mouse pan ───────────────────────────────────────────────────────────────
  let dragStartX = null, dragStartWindow = null;

  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    dragStartX = e.clientX;
    dragStartWindow = getWindow();
    canvas.classList.add('panning');
  });

  window.addEventListener('mousemove', e => {
    if (dragStartX === null) return;
    const rect = canvas.getBoundingClientRect();
    const PAD_L = Math.min(44 * Math.max(activeFields.size, 1), 140);
    const cW = rect.width - PAD_L - 12;
    if (cW <= 0) return;
    const dx = e.clientX - dragStartX;
    const { f, t } = dragStartWindow;
    const span = t - f;
    const shift = -(dx / cW) * span * 0.3;
    setWindow(f + shift, t + shift);
  });

  window.addEventListener('mouseup', () => {
    dragStartX = null; dragStartWindow = null;
    canvas.classList.remove('panning');
  });

  // ── Double-click: reset to live ─────────────────────────────────────────────
  canvas.addEventListener('dblclick', () => {
    staticFrom = null; staticTo = null;
    setMode('live');
  });

  // ── Touch: pinch-zoom + single-finger pan ───────────────────────────────────
  let lastTouches = null;

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    lastTouches = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }));
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const touches = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }));
    if (!lastTouches || touches.length !== lastTouches.length) { lastTouches = touches; return; }

    const rect = canvas.getBoundingClientRect();
    const PAD_L = Math.min(44 * Math.max(activeFields.size, 1), 140);
    const cW = rect.width - PAD_L - 12;
    const { f, t } = getWindow();
    const span = t - f;

    if (touches.length === 1) {
      // Pan
      const dx = touches[0].x - lastTouches[0].x;
      const shift = -(dx / cW) * span * 0.3;
      setWindow(f + shift, t + shift);
    } else if (touches.length === 2) {
      // Pinch zoom
      const prevDist = Math.abs(lastTouches[1].x - lastTouches[0].x);
      const currDist = Math.abs(touches[1].x - touches[0].x);
      if (prevDist === 0) { lastTouches = touches; return; }
      const scale = prevDist / currDist; // fingers spreading = zoom in = scale < 1 → smaller span
      const midX = ((touches[0].x + touches[1].x) / 2) - rect.left - PAD_L;
      const frac = Math.max(0, Math.min(1, midX / cW));
      const newSpan = Math.max(5000, Math.min(MAX_MS, span * scale));
      const pivot = f + frac * span;
      setWindow(pivot - frac * newSpan, pivot + (1 - frac) * newSpan);
    }
    lastTouches = touches;
  }, { passive: false });

  canvas.addEventListener('touchend', () => { lastTouches = null; });

  // ── Tooltip crosshair ────────────────────────────────────────────────────────
  const overlay = document.getElementById('plotOverlay');
  const tooltip = document.getElementById('plotTooltip');

  function syncOverlaySize() {
    if (!overlay) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    overlay.width = W * dpr; overlay.height = H * dpr;
    overlay.style.width = W + 'px'; overlay.style.height = H + 'px';
  }

  function drawCrosshair(mouseX, mouseY) {
    if (!overlay || !_renderState) return;
    const { tStart, tSpan, cX, cY, cW, cH, seriesData } = _renderState;
    const dpr = window.devicePixelRatio || 1;
    syncOverlaySize();
    const ctx2 = overlay.getContext('2d');
    ctx2.clearRect(0, 0, overlay.width, overlay.height);

    // Only show inside chart area
    if (mouseX < cX || mouseX > cX + cW || mouseY < cY || mouseY > cY + cH) {
      if (tooltip) tooltip.style.display = 'none';
      return;
    }

    // Time at cursor
    const tCursor = tStart + ((mouseX - cX) / cW) * tSpan;

    // Vertical crosshair line
    ctx2.save(); ctx2.scale(dpr, dpr);
    ctx2.strokeStyle = '#ffffff18'; ctx2.lineWidth = 1; ctx2.setLineDash([4, 4]);
    ctx2.beginPath(); ctx2.moveTo(mouseX, cY); ctx2.lineTo(mouseX, cY + cH); ctx2.stroke();
    ctx2.setLineDash([]);

    // For each series, find nearest point and draw dot
    const rows = seriesData.map(s => {
      const { m, pts, yMin, yRange } = s;
      if (!pts.length) return null;
      // Binary search nearest point by time
      let lo = 0, hi = pts.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (pts[mid].t < tCursor) lo = mid + 1; else hi = mid; }
      // Pick closer of lo and lo-1
      const p = (lo > 0 && Math.abs(pts[lo-1].t - tCursor) < Math.abs(pts[lo].t - tCursor)) ? pts[lo-1] : pts[lo];
      const toY = v => cY + cH - ((v - yMin) / yRange) * cH;
      const px = cX + ((p.t - tStart) / tSpan) * cW;
      const py = toY(p.v);
      // Glow
      ctx2.beginPath(); ctx2.arc(px, py, 7, 0, Math.PI * 2);
      ctx2.fillStyle = m.color + '22'; ctx2.fill();
      // Dot
      ctx2.beginPath(); ctx2.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx2.fillStyle = m.color; ctx2.fill();
      ctx2.strokeStyle = '#0d1b2a'; ctx2.lineWidth = 1.5; ctx2.stroke();
      return { m, p };
    }).filter(Boolean);
    ctx2.restore();

    // Tooltip content
    if (!tooltip || !rows.length) return;
    const d = new Date(rows[0].p.t);
    const timeStr = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    tooltip.innerHTML = `<div class="plot-tooltip-time">${timeStr}</div>` + rows.map(r =>
      `<div class="plot-tooltip-row">
        <span class="plot-tooltip-dot" style="background:${r.m.color}"></span>
        <span class="plot-tooltip-label">${r.m.label}</span>
        <span class="plot-tooltip-val" style="color:${r.m.color}">${r.p.v.toFixed(r.m.decimals <= 1 ? 1 : 2)}<span style="font-size:9px;color:var(--muted);margin-left:3px">${r.m.unit}</span></span>
      </div>`
    ).join('');

    // Position tooltip — keep it inside the canvas-wrap
    const wrap = canvas.parentElement;
    const wRect = wrap.getBoundingClientRect();
    const cRect = canvas.getBoundingClientRect();
    const relX = mouseX + (cRect.left - wRect.left);
    const relY = mouseY + (cRect.top  - wRect.top);
    const ttW = 180, ttH = 28 + rows.length * 26;
    const left = relX + 14 + ttW > wRect.width  ? relX - ttW - 10 : relX + 14;
    const top  = relY - ttH / 2 < 0 ? 4 : relY + ttH / 2 > wRect.height ? wRect.height - ttH - 4 : relY - ttH / 2;
    tooltip.style.left = left + 'px';
    tooltip.style.top  = top  + 'px';
    tooltip.style.display = 'block';
  }

  canvas.addEventListener('mousemove', e => {
    if (dragStartX !== null) return; // don't show tooltip while panning
    const rect = canvas.getBoundingClientRect();
    drawCrosshair(e.clientX - rect.left, e.clientY - rect.top);
  });

  canvas.addEventListener('mouseleave', () => {
    if (overlay) { const ctx2 = overlay.getContext('2d'); ctx2.clearRect(0, 0, overlay.width, overlay.height); }
    if (tooltip) tooltip.style.display = 'none';
  });
}


function loop()      { render(); rafId = requestAnimationFrame(loop); }
function startLoop() { if (!rafId) rafId = requestAnimationFrame(loop); }
function stopLoop()  { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

function setWin(sec, btn) {
  windowSec = sec;
  document.querySelectorAll('.preset').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  const wi = document.getElementById('winNum'); if (wi) wi.value = sec;
}

function setWinHighlight(sec) {
  const map = { 30:'30s', 60:'1m', 300:'5m', 600:'10m' };
  document.querySelectorAll('.preset').forEach(b => b.classList.toggle('on', b.textContent === map[sec]));
}

