# The Tabs

The app has five screens, switched from the header navigation. `src/tabs/index.ts`
defines them:

```ts
export type TabId = 'overview' | 'data' | 'map' | 'calc' | 'lapanalysis'

export const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'data',     label: 'Data' },
  { id: 'map',      label: 'Map' },
  { id: 'calc',     label: 'Calculations' },
  { id: 'lapanalysis', label: 'Lap Analysis' },
]
```

The header renders one button per entry; clicking one calls `onTab(t.id)`, which
switches `App`'s `tab` state and renders the matching component
(`App.tsx:52-56`). This document walks through each tab.

## Overview — `src/tabs/OverviewTab.tsx`

A dashboard of live values, updated ~2×/second (once per sim tick).

```
┌──────────────────────────────────────────────────────────┐
│ SOC  ████████░░ 72.5%     Speed  15.2 m/s  54.7 km/h     │
│ Lap  4 · Track 2268/5040 m                               │
│ Battery: V 120.1 · A 48.0 · Weak cell 3.80V              │
│ Power:  Pack 5800W · Motor 5500W  [Brake OFF][Regen ON]  │
│ Solar:  GHI 700 · Eff 5-min 300 · Eff 1-hr 280 (J/m)     │
│ Weather: 28.0°C · 3.5 m/s · 180° · Zenith 42°            │
└──────────────────────────────────────────────────────────┘
```

How it works:

- It calls `useOverviewMapping()` (`signalMapping.ts:106`), which resolves the
  manifest concepts (soc, speed, lap, packVoltage…) to current values.
- Rendering is pure math on those values: SOC → percentage + bar color, speed →
  km/h conversion, power → `k` formatting, brake/regen → state pills.
- Because it's driven by the concept mapping, a car event with a different
  manifest still renders — missing concepts just show `—`.

## Data — `src/tabs/DataTab.tsx`

The time-series plot tab: pick signals in the sidebar, see them plotted, pan /
zoom / freeze a range, export CSV.

Key pieces:

- **`activeFields`** — lives in the store, set from the sidebar. Up to 3 signals
  (Ctrl/⌘-click to add more).
- **Two modes** (a `staticMode` boolean in local state):
  - **Live** — the plot window rides along, always showing the last `windowSec`
    seconds. Presets: 30s / 1m / 5m / 10m.
  - **Static** — the window is frozen to a `from`/`to` range you type in two
    `DateTimePicker`s, or that you pan/zoom to. The badge reads **FROZEN**.
- **`view`** (`DataTab.tsx:63`) — a memoized object describing the window:
  `{ staticMode, staticFrom, staticTo, windowSec, activeFields }`. It's passed
  to `PlotCanvas`, which uses its identity to know when the frozen frame must
  redraw.
- **Pan / zoom** — handled imperatively inside `PlotCanvas` (wheel = zoom at
  cursor, drag = pan, dbl-click = reset). Every interaction calls back
  `onWindow(from, to)`, which puts `DataTab` into static mode with that range
  (`applyWindow`, `DataTab.tsx:85`).
- **Export CSV** — only in static mode; `exportCsv.ts` builds rows with
  `timestamp_utc`, `elapsed_s`, then one column per active signal.
- **Jump requests** — clicking a mini-chart in the Calculations tab lands here
  frozen to that range (see [data_flow.md](data_flow.md), "the third flow").

### PlotCanvas — `src/components/PlotCanvas.tsx`

The plotting component. Important ideas:

- It builds an **ECharts `option` object** declaratively in a `useMemo`
  (`PlotCanvas.tsx:85`): one `yAxis` + one line series per active signal,
  windowed to the visible range with binary search (`sliceWindow`).
- The y-domain *zooms into the visible data* when it sits inside the manifest's
  nominal range, and *widens* when it doesn't (car signals with default 0..1
  bounds) so traces are never clamped off-screen (`PlotCanvas.tsx:104`).
- Interactions are **not** ECharts' built-ins — they're hand-attached DOM
  listeners (`PlotCanvas.tsx:276`) to match the original canvas widget's exact
  feel. Live-mode axis labels show relative `-Ns` from "now".
- In live mode a small "endpoint dot" scatter rides the last sample of each
  series (`PlotCanvas.tsx:153`).

## Map — `src/tabs/MapTab.tsx`

A Leaflet map showing the GPS trace, colored by a selected signal.

- **Leaflet is loaded dynamically** inside a mount effect (`MapTab.tsx:146`)
  because it touches `window`/`document` at import time; dynamic import keeps
  the module SSR-safe.
- **`drawTrace()`** (called on every store emit while data grows, `MapTab.tsx:96`)
  colors each GPS point by the nearest sample of the chosen signal
  (`nearestMetric` + `metricToColor` gradient).
- **Range controls** — by **time** (two `DateTimePicker`s) or by **lap** (lap
  number range, resolved through `lapToTimeRange` using the `LapIndex`
  history). "Apply" converts the chosen range to a `[start, end]` fraction of
  the full trace (`rangeRef`).
- **Replay** — a car marker animates along the trace at 1×/5×/10×/30× speed,
  driven by `setTimeout` steps scaled by real inter-sample gaps
  (`MapTab.tsx:243`).
- **Teleport handling** — the store wipes the trace if GPS jumps > 1 km; the map
  resets its "fitted" flag so the new area gets reframed (`MapTab.tsx:175`).

## Calculations — `src/tabs/CalcTab.tsx`

Analyze a chosen time range (or lap range) and get stats: duration, avg speed,
SOC delta, motor/pack energy, efficiency, per-lap breakdown, and mini graphs.

Flow:

1. Pick **Time** (two `DateTimePicker`s) or **Laps** (lap numbers), hit
   **Analyse**.
2. `runCalculations()` (`CalcTab.tsx:400`) resolves the concept fields via
   `CALC_MAPPING`, finds the actual timestamps (lap mode maps lap numbers →
   time span through the `LapIndex` history), slices each signal's history to
   the range, and computes the stats:
   - `average()` — mean of values in range.
   - `integrate()` — trapezoidal integration (W → Wh via `/3600`).
   - per-lap rows use `metricAt()` (linear interpolation at a timestamp) to get
     SOC at lap boundaries.
3. Results render in collapsible sections (**Summary**, **Energy & Power**,
   **Efficiency**, **Lap Breakdown**, **Time-Series Graphs**) — the `openSections`
   set tracks which are expanded.
4. Each signal's **mini-chart** (a `MiniChart`, `CalcTab.tsx:122`) is an ECharts
   line graph of that signal over the analysed range. Clicking one calls
   `onOpenInData(field, from, to)` → jumps to the Data tab frozen to that range.

Notes:

- Results **freeze** at analyse time: `fieldPts` is memoized against `results`,
  so mini-charts don't keep shifting as live data arrives (`CalcTab.tsx:229`).
- Results are **cleared when the source changes** (sim ↔ car) since the
  manifests differ (`CalcTab.tsx:365`).
- `CalcTab` stays mounted even when it isn't the active tab (`App.tsx:55`) so
  its results/expansion state survive tab switches. The `active` prop toggles a
  CSS class only.

## Lap Analysis — `src/tabs/LapAnalysisTab.tsx`

Compare one metric across laps: one dot per lap, connected by a trend line.

Data preparation — `getLapData()` (`LapAnalysisTab.tsx:36`) is the interesting
part. It groups every signal sample into laps **by time**, not by array index:
for each sample, it walks the `LapIndex` history and finds which lap was in
effect at that timestamp. This stays correct when signals stream at different
sample rates, as real Sunbeam data does.

Controls:

- **Metric** dropdown — any signal, grouped by stage.
- **Aggregation** — mean / median / max / min. For min/max, the tooltip and
  stats show *when* in the lap the extreme happened (`lapExtremeTime`).
- **Lap range** — filter the dots to a subset.

Output:

- A scatter/trend chart (`LapChart`, `LapAnalysisTab.tsx:101`).
- A stats row: shown/total laps, mean, best, worst, and trend (first → last).

Empty states are explicit and helpful: no selection, no lap data in manifest,
no laps yet, no laps in range (`LapAnalysisTab.tsx:363`). The tab subscribes to
`dataVersion` so new laps appear live as the sim or car completes them
(`LapAnalysisTab.tsx:252`).
