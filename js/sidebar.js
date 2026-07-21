// ─── SIDEBAR BUILDER ─────────────────────────────────────────────────────────
function buildSidebar() {
  const scroll = document.getElementById('sidebarScroll');
  scroll.innerHTML = '';

  STAGES.forEach(stage => {
    const signals = SIGNALS.filter(s => s.stage === stage.id);
    if (!signals.length) return;

    const group = document.createElement('div');
    group.className = 'stage-group open';
    group.dataset.stage = stage.id;

    const header = document.createElement('div');
    header.className = 'stage-header';
    header.innerHTML = `
      <div class="stage-dot" style="background:${stage.color}"></div>
      <div class="stage-name">${stage.label}</div>
      <div class="stage-count">${signals.length}</div>
      <svg class="stage-chevron" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="4 2 8 6 4 10"/></svg>
    `;
    header.addEventListener('click', () => group.classList.toggle('open'));

    const sigList = document.createElement('div');
    sigList.className = 'stage-signals';

    signals.forEach(sig => {
      const row = document.createElement('div');
      row.className = 'signal-row';
      row.id = 'sigrow-' + sig.field;
      row.style.setProperty('--stage-color', stage.color);
      row.dataset.label = (sig.label + ' ' + sig.field + ' ' + sig.unit).toLowerCase();
      row.innerHTML = `
        <div class="sig-name" title="${sig.help}">${sig.label}</div>
        <div class="sig-value" id="sigval-${sig.field}">—</div>
        <div class="sig-unit">${sig.unit}</div>
      `;
      row.addEventListener('click', (e) => {
        const multiSelect = e.ctrlKey || e.metaKey;
        activateSignal(sig.field, multiSelect);
      });
      sigList.appendChild(row);
    });

    group.appendChild(header);
    group.appendChild(sigList);
    scroll.appendChild(group);
  });
}

// ─── SIGNAL ACTIVATION ───────────────────────────────────────────────────────
function activateSignal(field, multiSelect) {
  const sig = SIGNALS.find(s => s.field === field);
  if (!sig) return;

  stopLoop();
  clearMapPanel();
  activeField = null;

  if (multiSelect) {
    if (activeFields.has(field)) activeFields.delete(field);
    else if (activeFields.size < 3) activeFields.add(field);
  } else {
    if (activeFields.size === 1 && activeFields.has(field)) {
      activeFields.clear();
    } else {
      activeFields.clear();
      activeFields.add(field);
    }
  }

  // Update row highlights
  SIGNALS.forEach(s => {
    const row = document.getElementById('sigrow-' + s.field);
    if (row) row.classList.toggle('active', activeFields.has(s.field));
  });

  if (activeFields.size === 0) {
    const area = document.getElementById('mainArea');
    area.innerHTML = '<div class="plot-panel"><div class="plot-empty"><div class="plot-empty-hint">Select a signal from the sidebar</div><div class="plot-empty-sub">Hold Ctrl / ⌘ to overlay up to 3 signals</div></div></div>';
    return;
  }

  let pp = document.getElementById('plotPanel');
  const hasCanvas = pp && !!pp.querySelector('#plotCanvas');
  if (!hasCanvas) {
    const area = document.getElementById('mainArea');
    area.innerHTML = '';
    pp = document.createElement('div');
    pp.id = 'plotPanel'; pp.className = 'plot-panel';
    area.appendChild(pp);
    buildChartPanel();
  } else {
    updateChartLegend();
  }
  if (staticMode) render(); else startLoop();
}


// ─── SIGNAL SEARCH ───────────────────────────────────────────────────────────
function filterSignals(q) {
  const query = q.trim().toLowerCase();
  const scroll = document.getElementById('sidebarScroll');
  scroll.querySelectorAll('.signal-row').forEach(row => {
    const match = !query || row.dataset.label.includes(query);
    row.classList.toggle('hidden-search', !match);
  });
  // collapse/expand stage groups based on visible signals
  scroll.querySelectorAll('.stage-group').forEach(group => {
    const visible = group.querySelectorAll('.signal-row:not(.hidden-search)').length;
    if (query) {
      group.classList.toggle('open', visible > 0);
    }
  });
}

// ─── SIDEBAR TOGGLE ──────────────────────────────────────────────────────────
let sidebarOpen = true;
function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  const sidebar = document.getElementById('sidebar');
  const layout  = document.getElementById('bodyLayout');
  const icon    = document.getElementById('sidebarToggleIcon');
  const toggle  = document.getElementById('sidebarToggle');

  sidebar.classList.toggle('collapsed', !sidebarOpen);
  layout.classList.toggle('sidebar-collapsed', !sidebarOpen);

  const left = sidebarOpen ? 'calc(var(--sidebar-w) - 1px)' : '0px';
  toggle.style.left = left;
  icon.innerHTML = sidebarOpen
    ? '<polyline points="6 2 3 5 6 8"/>'
    : '<polyline points="4 2 7 5 4 8"/>';

  setTimeout(() => {
    if (leafletMap) leafletMap.invalidateSize();
    const canvas = document.getElementById('plotCanvas');
    if (canvas && (activeFields.size > 0 || activeField)) render();
  }, 260);
}

