// ─── OVERVIEW ENGINE ──────────────────────────────────────────────────────────
let ovRafId = null;

function startOverviewLoop() { if (!ovRafId) ovRafId = requestAnimationFrame(ovLoop); }
function stopOverviewLoop()  { if (ovRafId) { cancelAnimationFrame(ovRafId); ovRafId = null; } }
function ovLoop() { try { renderOverview(); } catch(e) { console.error('overview error', e); } ovRafId = requestAnimationFrame(ovLoop); }

function ovLast(field) {
  const h = history[field]; return (h && h.length) ? h[h.length-1].v : null;
}

function ovSet(id, text) {
  const el = document.getElementById(id); if (el) el.textContent = text;
}
function ovFmt(v, dec) { return (v !== null && !isNaN(v)) ? v.toFixed(dec) : '—'; }

function renderOverview() {
  const fmt = ovFmt;

  // SOC
  const soc = ovLast('SOC');
  const socPct = soc !== null ? soc * 100 : null;
  const socColor = socPct === null ? 'var(--text)' : socPct < 20 ? '#c94f3e' : socPct < 50 ? '#c9a84c' : '#3d9e6b';
  const socEl = document.getElementById('ovSocPct');
  if (socEl) { socEl.textContent = socPct !== null ? socPct.toFixed(1) : '—'; socEl.style.color = socColor; }
  const socFill = document.getElementById('ovSocFill');
  if (socFill) socFill.style.width = socPct !== null ? Math.max(0,Math.min(100,socPct)) + '%' : '0%';

  // Speed
  const spd = ovLast('VehicleVelocity');
  const spdEl = document.getElementById('ovSpeed');
  if (spdEl) spdEl.textContent = fmt(spd, 1);
  ovSet('ovSpeedKmh', spd !== null ? (spd * 3.6).toFixed(1) : '—');

  // Lap & Track
  ovSet('ovLap', ovLast('LapIndex') !== null ? Math.round(ovLast('LapIndex')) : '—');
  ovSet('ovTrackDist', ovLast('TrackDistSpreadsheet') !== null ? Math.round(ovLast('TrackDistSpreadsheet')) : '—');
  const trackPct = ovLast('TrackIndex') !== null ? Math.max(0, Math.min(100, ovLast('TrackIndex') * 100)) : 0;
  const trackFillEl = document.getElementById('ovTrackFill');
  if (trackFillEl) trackFillEl.style.width = trackPct + '%';

  // Battery
  ovSet('ovPackVoltage', fmt(ovLast('TotalPackVoltage'), 1));
  ovSet('ovPackCurrent', fmt(ovLast('PackCurrent'), 1));
  const wv = ovLast('VoltageofLeast');
  const wcEl = document.getElementById('ovWeakCell');
  if (wcEl) { wcEl.textContent = fmt(wv, 2); wcEl.style.color = wv === null ? 'var(--text)' : wv < 3.0 ? '#c94f3e' : wv < 3.4 ? '#c9a84c' : '#3d9e6b'; }

  // Power
  const pp = ovLast('PackPower'), mp = ovLast('MotorPower');
  const ppEl = document.getElementById('ovPackPower');
  if (ppEl) { ppEl.textContent = pp !== null ? (Math.abs(pp) >= 1000 ? (pp/1000).toFixed(1)+'k' : Math.round(pp)) : '—'; ppEl.style.color = pp === null ? 'var(--text)' : pp > 500 ? '#c94f3e' : pp < -200 ? '#3d9e6b' : 'var(--muted)'; }
  const mpEl = document.getElementById('ovMotorPower');
  if (mpEl) { mpEl.textContent = mp !== null ? (Math.abs(mp) >= 1000 ? (mp/1000).toFixed(1)+'k' : Math.round(mp)) : '—'; mpEl.style.color = mp === null ? 'var(--text)' : mp > 500 ? '#c94f3e' : mp < -200 ? '#3d9e6b' : 'var(--muted)'; }

  // Drive state pills
  const brake = ovLast('MechBrakePressed');
  const regen = mp !== null && mp < -100;
  const brakePill = document.getElementById('ovBrakePill');
  if (brakePill) brakePill.className = 'ov-state-pill' + (brake ? ' active-brake' : '');
  ovSet('ovBrakeLabel', 'Brake ' + (brake ? 'ON' : 'OFF'));
  const regenPill = document.getElementById('ovRegenPill');
  if (regenPill) regenPill.className = 'ov-state-pill' + (regen ? ' active-regen' : '');
  ovSet('ovRegenLabel', 'Regen ' + (regen ? 'ON' : 'OFF'));

  // Solar & Efficiency
  ovSet('ovGHI', fmt(ovLast('GHI'), 0));
  ovSet('ovEff5m', fmt(ovLast('Efficiency5Minute'), 0));
  ovSet('ovEff1h', fmt(ovLast('Efficiency1Hour'), 0));

  // Weather
  ovSet('ovAirTemp', fmt(ovLast('AirTemperature'), 1));
  ovSet('ovWindSpd', fmt(ovLast('WindSpeed'), 1));
  ovSet('ovWindDir', fmt(ovLast('WindDirection'), 0));
  ovSet('ovZenith',  fmt(ovLast('Zenith'), 0));
}

