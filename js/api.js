const PALETTE = ['#60a5fa', '#c94f3e', '#3d9e6b', '#a78bfa', '#f472b6', '#38bdf8', '#c9a84c'];

function assignColors(signals) {
  const sources = [...new Set(signals.map(s => s.source).filter(Boolean))];
  const map = {};
  sources.forEach((src, i) => { map[src] = PALETTE[i % PALETTE.length]; });
  return map;
}

function apiSignalToSignal(s, colorMap) {
  const src = s.source || '';
  return {
    field: s.name,
    stage: src.toLowerCase(),
    label: s.name,
    unit: s.unit || '',
    color: colorMap[src] || PALETTE[0],
    decimals: 1,
    yMin: 0, // TODO: GRAPHING YAXIS ISSUE
    yMax: 1,
    help: src ? `Source: ${src}` : '',
  };
}

async function fetchEvents() {
  const res = await fetch(`${API_BASE_URL}/events`);
  return res.ok ? await res.json() : [];
}

async function fetchSignals(eventName) {
  const res = await fetch(`${API_BASE_URL}/events/${encodeURIComponent(eventName)}/signals`);
  return res.ok ? await res.json() : [];
}

function buildEventDropdown(events) {
  const wrap = document.getElementById('eventPickerWrap');
  if (!events.length) {
    wrap.classList.add('hidden');
    return;
  }
  const opts = events.map(e =>
    `<option value="${e.name}">${e.name} (${e.status})</option>`
  ).join('');
  document.getElementById('eventSelect').innerHTML =
    `<option value="">— select event —</option>` + opts;
  wrap.classList.remove('hidden');
}

async function loadEvents() {
  const events = await fetchEvents();
  buildEventDropdown(events);
  if (events.length === 1) onEventSelected(events[0].name);
}

async function onEventSelected(eventName) {
  console.log('Selected event:', eventName);   // ← add this
  if (!eventName) return;
  const apiSignals = await fetchSignals(eventName);
  console.log('Signals returned:', apiSignals);  // ← add this too
  if (!apiSignals.length) return;

  const colorMap = assignColors(apiSignals);
  const newSignals = apiSignals.map(s => apiSignalToSignal(s, colorMap));

  SIGNALS = newSignals;
  STAGES = Object.keys(colorMap).map(src => ({
    id: src.toLowerCase(),
    label: src,
    color: colorMap[src],
  }));

  Object.keys(history).forEach(k => { if (k !== 'LapIndexSpreadsheet') delete history[k]; });
  SIGNALS.forEach(m => {
    history[m.field] = [];
    latest[m.field] = { value: null, prev: null };
  });

  buildSidebar();
  selectedEvent = eventName;
  connectStream();
}

// ─── LIVE STREAM (SSE) ───────────────────────────────────────────────────────
//TODO: integrate backfilling?

let selectedEvent = null;
let telemetrySource = null;

function disconnectStream() {
  if (telemetrySource) { telemetrySource.close(); telemetrySource = null; }
}

function connectStream() {
  disconnectStream();
  const names = SIGNALS.map(m => m.field);
  if (!names.length) return;                              // signals= is required (422 if empty)

  const url = `${API_BASE_URL}/events/${encodeURIComponent(selectedEvent)}/data/stream?signals=${names.join(',')}`;
  // TODO: verify the pipeline sends Access-Control-Allow-Origin: * — this page is
  // cross-origin (file:// → http://localhost:8000). If not, add CORS middleware
  // server-side, or temporarily set webSecurity:false in main.js while testing.
  const source = new EventSource(url);
  telemetrySource = source;

  source.addEventListener('meta', (e) => {
    // Sent exactly once. signal_id/unit/frequency per signal — you already got
    // units from GET /events/{event}/signals, so this is a sanity check.
    console.log('[stream] meta', JSON.parse(e.data));
  });

  source.addEventListener('data', (e) => {
    const batch = JSON.parse(e.data);
    // Every subscribed signal is always present (empty arrays if nothing new).
    for (const field of Object.keys(batch)) {
      const { timestamps, values } = batch[field];
      for (let i = 0; i < timestamps.length; i++) push(field, timestamps[i], values[i]);
    }
    const badge = document.getElementById('srcCarBadge');
    if (badge && badge.textContent !== 'LIVE') { badge.textContent = 'LIVE'; badge.className = 'source-badge live'; }
  });

  source.onerror = () => {
    // Do NOT write reconnect logic. EventSource retries automatically and sends
    // the last id: back as Last-Event-ID; the server resumes with no gaps/dupes.
    const badge = document.getElementById('srcCarBadge');
    if (badge && badge.textContent !== 'STANDBY') {
      badge.textContent = 'CONNECTING…'; badge.className = 'source-badge car';
    }
  };
}