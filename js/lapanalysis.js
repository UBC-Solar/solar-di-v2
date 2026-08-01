//TODO: INTEGRATE WITH SUNBEAM REAL DATA
// ─── LAP ANALYSIS ENGINE ─────────────────────────────────────────────────────
let laAgg = 'mean';

function setLaAgg(mode) {
  laAgg = mode;
  ['mean','median','max','min'].forEach(m => {
    document.getElementById('laAgg' + m.charAt(0).toUpperCase() + m.slice(1))?.classList.toggle('on', m === mode);
  });
  renderLapAnalysis();
}

function populateLaMetricSelect() {
  const sel = document.getElementById('laMetricSelect');
  if (!sel) return;
  // only repopulate if empty
  if (sel.options.length > 1) return;
  STAGES.forEach(stage => {
    const sigs = SIGNALS.filter(s => s.stage === stage.id);
    if (!sigs.length) return;
    const grp = document.createElement('optgroup');
    grp.label = stage.label;
    sigs.forEach(sig => {
      const opt = document.createElement('option');
      opt.value = sig.field;
      opt.textContent = sig.label + (sig.unit ? ' (' + sig.unit + ')' : '');
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  });
}

function getLapData() {
  // All signals are pushed at the same timestamps, so LapIndex[i] corresponds to signal[i].
  // Group each signal's values by the lap number recorded at the same index.
  const lapIdxHistory = history['LapIndex'];
  if (!lapIdxHistory || !lapIdxHistory.length) return {};

  const lapMap = {}; // lap# -> { field -> { values[], times[] } }

  SIGNALS.forEach(sig => {
    const h = history[sig.field];
    if (!h || !h.length) return;
    const len = Math.min(h.length, lapIdxHistory.length);
    for (let i = 0; i < len; i++) {
      const lap = Math.round(lapIdxHistory[i].v);
      if (lap < 1) continue;
      if (!lapMap[lap]) lapMap[lap] = {};
      if (!lapMap[lap][sig.field]) lapMap[lap][sig.field] = { values: [], times: [] };
      lapMap[lap][sig.field].values.push(h[i].v);
      lapMap[lap][sig.field].times.push(h[i].t);
    }
  });

  return lapMap;
}

function aggregate(values, mode) {
  if (!values || !values.length) return null;
  switch(mode) {
    case 'mean':   return values.reduce((a,b)=>a+b,0)/values.length;
    case 'median': { const s=[...values].sort((a,b)=>a-b); const m=s.length>>1; return s.length%2?s[m]:(s[m-1]+s[m])/2; }
    case 'max':    return Math.max(...values);
    case 'min':    return Math.min(...values);
  }
}

// Find the timestamp when a field hit its min or max within a lap
function lapExtremeTime(lapEntry, field, mode) {
  if (!lapEntry || !lapEntry[field]) return null;
  const { values, times } = lapEntry[field];
  if (!values.length) return null;
  let idx = 0;
  for (let i = 1; i < values.length; i++) {
    if (mode === 'max' ? values[i] > values[idx] : values[i] < values[idx]) idx = i;
  }
  return times[idx] || null;
}

// ─── LAP ANALYSIS TOOLTIP ─────────────────────────────────────────────────────
let laHitData = [];
let laHitSig = null;

function laCanvasHover(e, canvas) {
  const tt = document.getElementById('laTooltip');
  if (!tt || !laHitData.length) return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const HIT_RADIUS = 18;
  let closest = null, closestDist = Infinity;
  laHitData.forEach(h => {
    const d = Math.sqrt((mx - h.x) ** 2 + (my - h.y) ** 2);
    if (d < HIT_RADIUS && d < closestDist) { closest = h; closestDist = d; }
  });
  if (!closest) { tt.style.display = 'none'; canvas.style.cursor = ''; return; }
  canvas.style.cursor = 'crosshair';
  const dec = laHitSig ? (laHitSig.decimals <= 1 ? 1 : 2) : 2;
  const unit = laHitSig ? laHitSig.unit : '';
  const color = laHitSig ? laHitSig.color : 'var(--gold)';
  let timeStr = '';
  if (closest.point.extremeT) {
    const d = new Date(closest.point.extremeT);
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    const ss = String(d.getSeconds()).padStart(2,'0');
    timeStr = `<div style="color:var(--muted);margin-top:3px">${hh}:${mm}:${ss}</div>`;
  }
  tt.innerHTML = `<span style="color:var(--muted)">Lap </span><span style="color:${color};font-weight:600">${closest.point.lap}</span><span style="color:var(--border3)"> · </span><span style="color:${color};font-weight:600">${closest.point.agg.toFixed(dec)}</span><span style="color:var(--muted)"> ${unit}</span>${timeStr}`;
  // Position tooltip above/right of cursor, flip if near edge
  const wrap = canvas.parentElement.getBoundingClientRect();
  let tx = e.clientX - wrap.left + 14;
  let ty = e.clientY - wrap.top - 38;
  tt.style.display = 'block';
  const ttW = tt.offsetWidth, ttH = tt.offsetHeight;
  if (tx + ttW > wrap.width - 8) tx = e.clientX - wrap.left - ttW - 14;
  if (ty < 4) ty = e.clientY - wrap.top + 14;
  tt.style.left = tx + 'px';
  tt.style.top  = ty + 'px';
}

function renderLapAnalysis() {
  const sel = document.getElementById('laMetricSelect');
  const emptyEl = document.getElementById('laEmpty');
  const wrapEl = document.getElementById('laChartWrap');
  const statsEl = document.getElementById('laStatsRow');
  if (!sel) return;

  const field = sel.value;
  const sig = SIGNALS.find(s => s.field === field);

  if (!field || !sig) {
    emptyEl.innerHTML = '<div class="plot-empty-hint">Select a metric above to compare lap averages</div><div class="plot-empty-sub">Each dot = one lap · connected line shows trend</div>';
    emptyEl.classList.remove('hidden');
    wrapEl.classList.add('hidden');
    statsEl.classList.add('hidden');
    return;
  }

  const lapMap = getLapData();
  const laps = Object.keys(lapMap).map(Number).sort((a,b)=>a-b);

  const points = laps.map(lap => {
    const entry = lapMap[lap];
    const vals = entry?.[field]?.values;
    const times = entry?.[field]?.times;
    const agg = aggregate(vals, laAgg);
    let pointT = null;
    if (vals && times && vals.length) {
      if (laAgg === 'min' || laAgg === 'max') {
        pointT = lapExtremeTime(entry, field, laAgg);
      } else {
        // Use the midpoint timestamp of the lap
        pointT = null;
      }
    }
    return { lap, agg, count: vals ? vals.length : 0, extremeT: pointT };
  }).filter(p => p.agg !== null);

  // Apply lap range filter
  const lapFromEl = document.getElementById('laLapFrom');
  const lapToEl   = document.getElementById('laLapTo');
  const rangeFrom = lapFromEl ? (parseInt(lapFromEl.value) || 1)   : 1;
  const rangeTo   = lapToEl   ? (parseInt(lapToEl.value)   || 999) : 999;
  const visiblePoints = points.filter(p => p.lap >= rangeFrom && p.lap <= rangeTo);

  if (visiblePoints.length < 1) {
    emptyEl.innerHTML = '<div class="plot-empty-hint">No laps in that range</div><div class="plot-empty-sub">Try adjusting the lap range above</div>';
    emptyEl.classList.remove('hidden');
    wrapEl.classList.add('hidden');
    statsEl.classList.add('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  wrapEl.classList.remove('hidden');
  statsEl.classList.remove('hidden');

  // Draw scatter + line chart
  requestAnimationFrame(() => {
    const canvas = document.getElementById('laCanvas');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    if (!W || !H) return;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);

    const PAD = { t: 28, b: 48, l: 64, r: 28 };
    const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
    const FONT = '11px IBM Plex Mono,monospace';
    const LABEL = '#7a8fa3';

    ctx.clearRect(0, 0, W, H);

    const vals = visiblePoints.map(p => p.agg);
    const yMin = Math.min(...vals), yMax = Math.max(...vals);
    const yRange = yMax - yMin || 1;
    const yPad = yRange * 0.15;
    const yLo = yMin - yPad, yHi = yMax + yPad;

    const lapNums = visiblePoints.map(p => p.lap);
    const xMin = Math.min(...lapNums), xMax = Math.max(...lapNums);
    const xRange = xMax - xMin || 1;

    const toX = l => PAD.l + ((l - xMin) / xRange) * cW;
    const toY = v => PAD.t + cH - ((v - yLo) / (yHi - yLo)) * cH;

    // Grid
    ctx.strokeStyle = '#ffffff0a'; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 5; i++) {
      const y = PAD.t + (i / 5) * cH;
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + cW, y); ctx.stroke();
    }

    // Y axis labels
    ctx.font = FONT; ctx.fillStyle = LABEL; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let i = 0; i <= 5; i++) {
      const v = yHi - (i / 5) * (yHi - yLo);
      const y = PAD.t + (i / 5) * cH;
      ctx.fillText(v.toFixed(sig.decimals <= 1 ? 1 : 2), PAD.l - 8, y);
    }

    // Y axis unit label (rotated)
    ctx.save();
    ctx.translate(14, PAD.t + cH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = '10px IBM Plex Mono,monospace'; ctx.fillStyle = LABEL; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(sig.unit || '', 0, 0);
    ctx.restore();

    // X axis labels
    ctx.font = FONT; ctx.fillStyle = LABEL; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    visiblePoints.forEach(p => {
      ctx.fillText('Lap ' + p.lap, toX(p.lap), PAD.t + cH + 8);
    });

    // Axes
    ctx.strokeStyle = '#ffffff18'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.l, PAD.t); ctx.lineTo(PAD.l, PAD.t + cH); ctx.lineTo(PAD.l + cW, PAD.t + cH); ctx.stroke();

    // Connected line
    if (visiblePoints.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(toX(visiblePoints[0].lap), toY(visiblePoints[0].agg));
      visiblePoints.slice(1).forEach(p => ctx.lineTo(toX(p.lap), toY(p.agg)));
      ctx.strokeStyle = sig.color + '80'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.setLineDash([6, 3]);
      ctx.stroke(); ctx.setLineDash([]);
    }

    // Scatter dots with glow
    visiblePoints.forEach((p, i) => {
      const x = toX(p.lap), y = toY(p.agg);
      // Glow
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = sig.color + '18'; ctx.fill();
      // Dot
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = sig.color; ctx.fill();
      ctx.strokeStyle = '#ffffff30'; ctx.lineWidth = 1.5; ctx.stroke();
      // Value label above dot
      ctx.font = '11px IBM Plex Mono,monospace'; ctx.fillStyle = sig.color;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(p.agg.toFixed(sig.decimals <= 1 ? 1 : 2), x, y - 10);
    });

    // Chart title
    ctx.font = '12px IBM Plex Mono,monospace'; ctx.fillStyle = '#f0f4f8';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const aggLabel = laAgg.charAt(0).toUpperCase() + laAgg.slice(1);
    const lapRange = visiblePoints.length < points.length
      ? ` (laps ${visiblePoints[0].lap}–${visiblePoints[visiblePoints.length-1].lap})` : '';
    ctx.fillText(aggLabel + ' ' + sig.label + ' per Lap' + lapRange, PAD.l, 6);

    // Store hit data for tooltip
    laHitData = visiblePoints.map(p => ({ x: toX(p.lap), y: toY(p.agg), point: p }));
    laHitSig = sig;

    // Attach hover listener (replace each time to stay fresh)
    canvas.onmousemove = (e) => laCanvasHover(e, canvas);
    canvas.onmouseleave = () => { const tt = document.getElementById('laTooltip'); if (tt) tt.style.display = 'none'; };
  });

  // Stats bar — computed over the visible window only
  const vals2 = visiblePoints.map(p => p.agg);
  const bestVal  = laAgg === 'min' ? Math.min(...vals2) : Math.max(...vals2);
  const worstVal = laAgg === 'min' ? Math.max(...vals2) : Math.min(...vals2);
  const mean = vals2.reduce((a,b)=>a+b,0)/vals2.length;
  const trend = vals2.length >= 2 ? vals2[vals2.length-1] - vals2[0] : 0;
  const dec = sig.decimals <= 1 ? 1 : 2;

  const bestPoint  = visiblePoints.find(p => p.agg === bestVal);
  const worstPoint = visiblePoints.find(p => p.agg === worstVal);

  function fmtExtremeTime(point) {
    if (!point?.extremeT) return `Lap ${point?.lap ?? '—'}`;
    const d = new Date(point.extremeT);
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    const ss = String(d.getSeconds()).padStart(2,'0');
    return `${hh}:${mm}:${ss}`;
  }

  const showTime = laAgg === 'min' || laAgg === 'max';
  const bestSub  = showTime ? `<div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:3px">${fmtExtremeTime(bestPoint)}</div>`  : '';
  const worstSub = showTime ? `<div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:3px">${fmtExtremeTime(worstPoint)}</div>` : '';

  statsEl.innerHTML = `
    <div class="la-stat-card">
      <div class="la-stat-card-label">Showing</div>
      <div class="la-stat-card-val">${visiblePoints.length}<span class="la-stat-card-unit">/ ${points.length} laps</span></div>
    </div>
    <div class="la-stat-card">
      <div class="la-stat-card-label">Mean (shown)</div>
      <div class="la-stat-card-val">${mean.toFixed(dec)}<span class="la-stat-card-unit">${sig.unit}</span></div>
    </div>
    <div class="la-stat-card">
      <div class="la-stat-card-label">Best</div>
      <div class="la-stat-card-val" style="color:#3d9e6b">${bestVal.toFixed(dec)}<span class="la-stat-card-unit">${sig.unit}</span></div>
      ${bestSub}
    </div>
    <div class="la-stat-card">
      <div class="la-stat-card-label">Worst</div>
      <div class="la-stat-card-val" style="color:#c94f3e">${worstVal.toFixed(dec)}<span class="la-stat-card-unit">${sig.unit}</span></div>
      ${worstSub}
    </div>
    <div class="la-stat-card">
      <div class="la-stat-card-label">Trend (first→last)</div>
      <div class="la-stat-card-val" style="color:${trend>=0?'#3d9e6b':'#c94f3e'}">${trend>=0?'+':''}${trend.toFixed(dec)}<span class="la-stat-card-unit">${sig.unit}</span></div>
    </div>
  `;
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
buildSidebar();

