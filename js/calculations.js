// ── prefillCalcInputs ──
function prefillCalcInputs() {
  const now = Date.now();
  dtSet('dtCalcFrom', now - windowSec*1000);
  dtSet('dtCalcTo',   now);
}

// ─── MAP MODE (Time vs Lap) ────────────────────────────────────────────────────
let mapTabMode = 'time';
let mapLapSingleMode = false;

function setMapMode(mode) {
  mapTabMode = mode;
  document.getElementById('mapModeTime')?.classList.toggle('on', mode==='time');
  document.getElementById('mapModeLap')?.classList.toggle('on', mode==='lap');
  document.getElementById('mapInputsTime')?.classList.toggle('hidden', mode!=='time');
  document.getElementById('mapInputsLap')?.classList.toggle('hidden', mode!=='lap');
}

function toggleMapLapSingle() {
  mapLapSingleMode = !mapLapSingleMode;
  document.getElementById('mapLapSingleBtn')?.classList.toggle('on', mapLapSingleMode);
  const sep = document.getElementById('mapLapRangeSep');
  const toInput = document.getElementById('mapLapTo');
  if (sep) sep.style.display = mapLapSingleMode ? 'none' : '';
  if (toInput) toInput.style.display = mapLapSingleMode ? 'none' : '';
}

function applyMapRange() {
  const n = gpsHistory.length;
  if (n < 2) return;
  const tFirst = gpsHistory[0].t, tLast = gpsHistory[n-1].t, tSpan = tLast - tFirst || 1;

  if (mapTabMode === 'time') {
    const f = dtGet('dtMapStart'), t = dtGet('dtMapEnd');
    if (!f || !t || f >= t) return;
    mapRangeStart = Math.max(0, Math.min(1, (f - tFirst) / tSpan));
    mapRangeEnd   = Math.max(0, Math.min(1, (t - tFirst) / tSpan));
  } else {
    const lapFrom = parseInt(document.getElementById('mapLapFrom')?.value || '1');
    const lapTo   = mapLapSingleMode ? lapFrom : parseInt(document.getElementById('mapLapTo')?.value || lapFrom);
    const r1 = lapToTimeRange(lapFrom), r2 = lapToTimeRange(lapTo);
    if (!r1) return;
    const tS = r1.tStart, tE = (r2 || r1).tEnd;
    mapRangeStart = Math.max(0, Math.min(1, (tS - tFirst) / tSpan));
    mapRangeEnd   = Math.max(0, Math.min(1, (tE - tFirst) / tSpan));
  }
  stopReplay();
  drawMapTrace();
}


let calcMode = 'time';      // 'time' | 'lap'
let lapSingleMode = false;  // when true, lapTo is hidden and equals lapFrom

function setCalcMode(mode) {
  calcMode = mode;
  document.getElementById('calcModeTime').classList.toggle('on', mode==='time');
  document.getElementById('calcModeLap').classList.toggle('on', mode==='lap');
  document.getElementById('calcInputsTime').classList.toggle('hidden', mode!=='time');
  document.getElementById('calcInputsLap').classList.toggle('hidden', mode!=='lap');
}

function toggleLapSingle() {
  lapSingleMode = !lapSingleMode;
  const btn = document.getElementById('lapSingleBtn');
  const sep = document.getElementById('lapRangeSep');
  const toInput = document.getElementById('lapTo');
  btn.classList.toggle('on', lapSingleMode);
  sep.style.display = lapSingleMode ? 'none' : '';
  toInput.style.display = lapSingleMode ? 'none' : '';
}

// Resolve a lap number to a [tStart, tEnd] pair using LapIndexSpreadsheet history
function lapToTimeRange(lapNum) {
  const lapHist = history['LapIndexSpreadsheet'];
  if (!lapHist || !lapHist.length) return null;
  // Find first and last timestamps where lap index rounds to lapNum
  const pts = lapHist.filter(p => Math.round(p.v) === lapNum);
  if (!pts.length) return null;
  return { tStart: pts[0].t, tEnd: pts[pts.length-1].t };
}

// Build a section HTML helper (collapsed by default unless open=true)
function makeSection(id, title, contentHTML, open=false) {
  return `
    <div class="calc-section${open?' open':''}" id="sec-${id}">
      <div class="calc-section-header" onclick="toggleSection('sec-${id}')">
        <div class="calc-section-title">${title}</div>
        <svg class="calc-section-chevron" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="4 2 8 6 4 10"/></svg>
      </div>
      <div class="calc-section-body">${contentHTML}</div>
    </div>`;
}

function toggleSection(id) {
  document.getElementById(id).classList.toggle('open');
}

// ─── CALCULATIONS ENGINE ──────────────────────────────────────────────────────
function metricAt(hist, t) {
  if(!hist||!hist.length) return null;
  if(t<=hist[0].t) return hist[0].v; if(t>=hist[hist.length-1].t) return hist[hist.length-1].v;
  let lo=0,hi=hist.length-1;
  while(lo<hi-1){const mid=(lo+hi)>>1;if(hist[mid].t<=t)lo=mid;else hi=mid;}
  const frac=(t-hist[lo].t)/(hist[hi].t-hist[lo].t||1);
  return hist[lo].v+frac*(hist[hi].v-hist[lo].v);
}

function integrate(hist, tStart, tEnd) {
  if(!hist||!hist.length) return 0;
  const pts=hist.filter(p=>p.t>=tStart&&p.t<=tEnd); if(pts.length<2) return 0;
  let sum=0;
  for(let i=1;i<pts.length;i++){const dt=(pts[i].t-pts[i-1].t)/1000;sum+=0.5*(pts[i-1].v+pts[i].v)*dt;}
  return sum;
}

function average(hist, tStart, tEnd) {
  const pts=hist?hist.filter(p=>p.t>=tStart&&p.t<=tEnd):[];
  if(!pts.length) return null;
  return pts.reduce((s,p)=>s+p.v,0)/pts.length;
}

function runCalculations() {
  const statusEl=document.getElementById('calcStatus');
  let f, t;
  let lapRangeUsed = null;

  if (calcMode === 'lap') {
    const lapA = parseInt(document.getElementById('lapFrom').value);
    const lapB = lapSingleMode ? lapA : parseInt(document.getElementById('lapTo').value);
    const lapMin = Math.min(lapA, lapB), lapMax = Math.max(lapA, lapB);

    // Resolve lap range to timestamps
    const lapHist = history['LapIndexSpreadsheet'];
    if (!lapHist || !lapHist.length) {
      statusEl.textContent='No lap data'; statusEl.classList.remove('hidden');
      setTimeout(()=>statusEl.classList.add('hidden'), 2500); return;
    }
    const ptsInRange = lapHist.filter(p => {
      const r = Math.round(p.v);
      return r >= lapMin && r <= lapMax;
    });
    if (!ptsInRange.length) {
      statusEl.textContent='Laps not found'; statusEl.classList.remove('hidden');
      setTimeout(()=>statusEl.classList.add('hidden'), 2500); return;
    }
    f = ptsInRange[0].t;
    t = ptsInRange[ptsInRange.length-1].t;
    lapRangeUsed = { min: lapMin, max: lapMax };
  } else {
    f = dtGet('dtCalcFrom');
    t = dtGet('dtCalcTo');
    if(!f||!t||f>=t){
      const flash=id=>{const el=document.getElementById(id);if(el){el.style.borderColor='var(--red)';setTimeout(()=>el.style.borderColor='',1200);}};
      flash('dtCalcFrom');flash('dtCalcTo'); return;
    }
  }

  statusEl.textContent='Computing…'; statusEl.classList.remove('hidden');

  const hists={};
  SIGNALS.forEach(m=>{hists[m.field]=history[m.field].filter(p=>p.t>=f&&p.t<=t);});
  const body=document.getElementById('calcBody');
  const fmt=(v,dec,fb='—')=>v!==null&&!isNaN(v)?v.toFixed(dec):fb;

  const durSec=(t-f)/1000;
  const avgSpeed=average(hists['VehicleVelocity'],f,t);
  const socStart=hists['SOC'].length?hists['SOC'][0].v:null;
  const socEnd=hists['SOC'].length?hists['SOC'][hists['SOC'].length-1].v:null;
  const deltaSoc=(socStart!==null&&socEnd!==null)?(socStart-socEnd):null;
  const motorEnergyKWh=integrate(hists['MotorPower'],f,t)/3600000;
  const packEnergyKWh =integrate(hists['PackPower'], f,t)/3600000;
  const avgMotor=average(hists['MotorPower'],f,t);
  const avgPack =average(hists['PackPower'], f,t);
  const avgEff5=average(hists['Efficiency5Minute'],f,t);
  const avgEff1h=average(hists['Efficiency1Hour'],f,t);
  const avgEffLap=average(hists['EfficiencyLap'],f,t);

  // Range label
  let rangeLabel = '';
  if (lapRangeUsed) {
    rangeLabel = lapRangeUsed.min === lapRangeUsed.max
      ? `Lap ${lapRangeUsed.min}`
      : `Laps ${lapRangeUsed.min} – ${lapRangeUsed.max}`;
  } else {
    const d1=new Date(f), d2=new Date(t);
    const ts=d=>d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    rangeLabel = `${ts(d1)} → ${ts(d2)}`;
  }

  // ── Summary section (open by default) ──
  const summaryHTML = `
    <div style="font-size:11px;color:var(--muted);margin-bottom:12px;">${rangeLabel}</div>
    <div class="stat-grid">
      <div class="stat-card" style="--card-color:#60a5fa"><div class="stat-card-label">Duration</div><div class="stat-card-value">${fmt(durSec/60,1)}<span class="stat-card-unit">min</span></div></div>
      <div class="stat-card" style="--card-color:#60a5fa"><div class="stat-card-label">Avg Speed</div><div class="stat-card-value">${fmt(avgSpeed,2)}<span class="stat-card-unit">m/s</span></div></div>
      <div class="stat-card" style="--card-color:#3d9e6b"><div class="stat-card-label">SOC Start</div><div class="stat-card-value">${fmt(socStart!==null?socStart*100:null,1)}<span class="stat-card-unit">%</span></div></div>
      <div class="stat-card" style="--card-color:#3d9e6b"><div class="stat-card-label">SOC End</div><div class="stat-card-value">${fmt(socEnd!==null?socEnd*100:null,1)}<span class="stat-card-unit">%</span></div></div>
      <div class="stat-card" style="--card-color:${deltaSoc!==null&&deltaSoc>0?'var(--red)':'var(--green)'}"><div class="stat-card-label">Δ SOC</div><div class="stat-card-value">${deltaSoc!==null?(deltaSoc>0?'−':'+')+fmt(Math.abs(deltaSoc)*100,1):'—'}<span class="stat-card-unit">%</span></div></div>
    </div>`;

  // ── Energy section ──
  const energyHTML = `
    <div class="stat-grid">
      <div class="stat-card" style="--card-color:#c94f3e"><div class="stat-card-label">Motor Energy</div><div class="stat-card-value">${fmt(motorEnergyKWh*1000,1)}<span class="stat-card-unit">Wh</span></div></div>
      <div class="stat-card" style="--card-color:#f0a500"><div class="stat-card-label">Pack Energy</div><div class="stat-card-value">${fmt(packEnergyKWh*1000,1)}<span class="stat-card-unit">Wh</span></div></div>
      <div class="stat-card" style="--card-color:#c94f3e"><div class="stat-card-label">Avg Motor Power</div><div class="stat-card-value">${fmt(avgMotor!==null?avgMotor/1000:null,2)}<span class="stat-card-unit">kW</span></div></div>
      <div class="stat-card" style="--card-color:#f0a500"><div class="stat-card-label">Avg Pack Power</div><div class="stat-card-value">${fmt(avgPack!==null?avgPack/1000:null,2)}<span class="stat-card-unit">kW</span></div></div>
    </div>`;

  // ── Efficiency section ──
  const effHTML = `
    <div class="stat-grid">
      <div class="stat-card" style="--card-color:#a78bfa"><div class="stat-card-label">Efficiency 5-min avg</div><div class="stat-card-value">${fmt(avgEff5,1)}<span class="stat-card-unit">J/m</span></div></div>
      <div class="stat-card" style="--card-color:#a78bfa"><div class="stat-card-label">Efficiency 1-hr avg</div><div class="stat-card-value">${fmt(avgEff1h,1)}<span class="stat-card-unit">J/m</span></div></div>
      <div class="stat-card" style="--card-color:#a78bfa"><div class="stat-card-label">Efficiency per Lap avg</div><div class="stat-card-value">${fmt(avgEffLap,1)}<span class="stat-card-unit">J/m</span></div></div>
    </div>`;

  // ── Lap breakdown (only when multi-lap range selected) ──
  let lapBreakdownHTML = '';
  if (lapRangeUsed && lapRangeUsed.min !== lapRangeUsed.max) {
    const lapHist = history['LapIndexSpreadsheet'];
    let rows = '';
    for (let lap = lapRangeUsed.min; lap <= lapRangeUsed.max; lap++) {
      const pts = lapHist.filter(p => Math.round(p.v) === lap);
      if (!pts.length) continue;
      const lf = pts[0].t, lt = pts[pts.length-1].t;
      const ldur = (lt-lf)/1000;
      const lSocStart = hists['SOC'].length ? metricAt(history['SOC'], lf) : null;
      const lSocEnd   = hists['SOC'].length ? metricAt(history['SOC'], lt) : null;
      const lDeltaSoc = (lSocStart!==null&&lSocEnd!==null) ? (lSocStart-lSocEnd)*100 : null;
      const lSpeed = average(history['VehicleVelocity'], lf, lt);
      const lPower = average(history['PackPower'], lf, lt);
      const lEff   = average(history['EfficiencyLap'], lf, lt);
      rows += `<tr>
        <td class="td-num">${lap}</td>
        <td class="td-val">${fmt(ldur/60,1)} min</td>
        <td class="td-val">${fmt(lSpeed,2)} m/s</td>
        <td class="td-val">${lDeltaSoc!==null?(lDeltaSoc>0?'−':'+')+fmt(Math.abs(lDeltaSoc),1)+'%':'—'}</td>
        <td class="td-val">${fmt(lPower!==null?lPower/1000:null,2)} kW</td>
        <td class="td-val">${fmt(lEff,1)} J/m</td>
      </tr>`;
    }
    lapBreakdownHTML = `
      <table class="lap-table">
        <thead><tr><th>Lap</th><th>Duration</th><th>Avg Speed</th><th>Δ SOC</th><th>Avg Pack Power</th><th>Efficiency</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ── Charts section — one sub-group per stage ──
  const chartsHTML = STAGES.map(stage => {
    const signals = SIGNALS.filter(s => s.stage === stage.id);
    const count = signals.length;
    return `
      <div class="chart-stage-group" id="csg-${stage.id}">
        <div class="chart-stage-header" onclick="toggleChartStage('csg-${stage.id}')">
          <span class="chart-stage-dot" style="background:${stage.color}"></span>
          <span class="chart-stage-name">${stage.label}</span>
          <span class="chart-stage-count">${count}</span>
          <svg class="chart-stage-chevron" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="4 2 8 6 4 10"/></svg>
        </div>
        <div class="chart-stage-body">
          <div class="mini-charts-grid" id="chartgrid-${stage.id}"></div>
        </div>
      </div>`;
  }).join('');

  // Build output
  let html = makeSection('summary', 'Summary', summaryHTML, true);
  html += makeSection('energy', 'Energy & Power', energyHTML, false);
  html += makeSection('efficiency', 'Efficiency', effHTML, false);
  if (lapBreakdownHTML) html += makeSection('lapbreakdown', 'Lap Breakdown', lapBreakdownHTML, false);
  html += makeSection('charts', 'Time-Series Graphs', `<div class="chart-stages-wrap">${chartsHTML}</div>`, false);

  body.innerHTML = html;
  drawMiniCharts(f, t);
  statusEl.textContent='Done'; setTimeout(()=>statusEl.classList.add('hidden'),2000);
}

function toggleChartStage(id) {
  document.getElementById(id).classList.toggle('open');
}

function openInDataTab(field, tFrom, tTo) {
  // Set static range BEFORE switching tab so buildChartPanel renders correctly
  staticMode = true;
  staticFrom = tFrom;
  staticTo   = tTo;

  // Switch tab (shows data tab, hides others)
  switchTab('data');

  // Activate signal — this calls buildChartPanel which reads staticMode correctly
  activateSignal(field, false);

  // Sync the datetime pickers and re-render with the correct range
  prefillStaticInputs();
  render();
}

function drawMiniCharts(tFrom, tTo) {
  STAGES.forEach(stage => {
    const grid = document.getElementById('chartgrid-' + stage.id);
    if (!grid) return;
    grid.innerHTML = '';
    const signals = SIGNALS.filter(s => s.stage === stage.id);
    signals.forEach(m => {
    const pts=history[m.field].filter(p=>p.t>=tFrom&&p.t<=tTo);
    const card=document.createElement('div'); card.className='mini-chart-card';
    card.title = `Open ${m.label} in Data tab`;
    card.innerHTML=`<div class="mini-chart-title"><span class="dot" style="background:${m.color}"></span>${m.label}<span style="font-size:10px;color:var(--muted);margin-left:auto">${m.unit}</span><span class="mini-chart-goto">↗</span></div><canvas class="mini-chart-canvas" width="280" height="120"></canvas>`;
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => openInDataTab(m.field, tFrom, tTo));
    card.addEventListener('mouseenter', () => card.style.borderColor = m.color + '60');
    card.addEventListener('mouseleave', () => card.style.borderColor = '');
    grid.appendChild(card);
    requestAnimationFrame(()=>{
      const canvas=card.querySelector('canvas');
      const dpr=window.devicePixelRatio||1;
      const W=canvas.offsetWidth||280,H=120;
      canvas.width=W*dpr;canvas.height=H*dpr;
      const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
      const PAD={t:8,b:20,l:38,r:8};
      const cW=W-PAD.l-PAD.r,cH=H-PAD.t-PAD.b;
      const LABEL='#7a8fa3',FONT='9px IBM Plex Mono,monospace';
      ctx.clearRect(0,0,W,H);
      if(pts.length<2){ctx.fillStyle=LABEL;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='10px IBM Plex Mono,monospace';ctx.fillText('No data',PAD.l+cW/2,PAD.t+cH/2);return;}
      const vs=pts.map(p=>p.v);
      const yMin=Math.min(...vs),yMax=Math.max(...vs),yRange=yMax-yMin||1;
      const tA=pts[0].t,tB=pts[pts.length-1].t,tSpan=tB-tA||1;
      const toX=t=>PAD.l+((t-tA)/tSpan)*cW;
      const toY=v=>PAD.t+cH-((v-yMin)/yRange)*cH;
      ctx.strokeStyle='#ffffff0a';ctx.lineWidth=.5;
      for(let i=0;i<=4;i++){const y=PAD.t+(i/4)*cH;ctx.beginPath();ctx.moveTo(PAD.l,y);ctx.lineTo(PAD.l+cW,y);ctx.stroke();}
      ctx.font=FONT;ctx.fillStyle=LABEL;ctx.textAlign='right';ctx.textBaseline='middle';
      for(let i=0;i<=4;i++){const v=yMin+(yRange/4)*(4-i);ctx.fillText(v.toFixed(m.decimals<=1?1:2),PAD.l-3,PAD.t+(i/4)*cH);}
      ctx.textAlign='center';ctx.textBaseline='top';
      const xN=Math.min(4,Math.max(1,Math.floor(cW/55)));
      const showSecs=tSpan<90000;
      for(let i=0;i<=xN;i++){const tt=tA+(i/xN)*tSpan;const d=new Date(tt);const lbl=showSecs?`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`:`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;ctx.fillText(lbl,toX(tt),PAD.t+cH+3);}
      ctx.strokeStyle='#ffffff18';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(PAD.l,PAD.t);ctx.lineTo(PAD.l,PAD.t+cH);ctx.lineTo(PAD.l+cW,PAD.t+cH);ctx.stroke();
      ctx.beginPath();ctx.moveTo(toX(pts[0].t),toY(pts[0].v));pts.slice(1).forEach(p=>ctx.lineTo(toX(p.t),toY(p.v)));ctx.lineTo(toX(pts[pts.length-1].t),PAD.t+cH);ctx.lineTo(toX(pts[0].t),PAD.t+cH);ctx.closePath();ctx.fillStyle=m.color+'18';ctx.fill();
      ctx.beginPath();ctx.moveTo(toX(pts[0].t),toY(pts[0].v));pts.slice(1).forEach(p=>ctx.lineTo(toX(p.t),toY(p.v)));ctx.strokeStyle=m.color;ctx.lineWidth=1.5;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
    });
    }); // end signals.forEach
  }); // end STAGES.forEach
}

