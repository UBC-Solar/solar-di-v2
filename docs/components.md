# Shared Components

`src/components/` holds the reusable UI pieces. Some are used by several tabs
(`DateTimePicker`, `EChart`), others are single-use but conceptually separate
(`Header`, `Sidebar`). This document explains each one, what problem it solves,
and any patterns worth copying.

```
src/components/
├── Header.tsx        # top bar: logo, tab nav, source toggle, event picker, search
├── Sidebar.tsx       # signal list grouped by stage (Data tab)
├── EChart.tsx        # thin React wrapper around ECharts
├── PlotCanvas.tsx    # the interactive time-series chart (Data tab)
├── DateTimePicker.tsx# six-segment date/time input
├── EventPicker.tsx   # car event dropdown (Car mode only)
├── SearchBox.tsx     # signal search input
├── SourceToggle.tsx  # Simulator / Car switch
└── charts/theme.ts   # chart constants + formatting helpers
```

## EChart — `src/components/EChart.tsx`

The ECharts wrapper used by every chart in the app. It hides the lifecycle
boilerplate so tabs just pass an `option`:

```tsx
<EChart option={option} />
```

What it does internally (`EChart.tsx:47`):

- **Init once on mount** — `echarts.init(el)`; on unmount it disposes the chart
  and disconnects the `ResizeObserver`. The cleanup makes it safe under React
  StrictMode's double-effect invocation.
- **Resize** — a `ResizeObserver` calls `chart.resize()` whenever the container
  changes size, so collapsing/expanding a section re-lays-out the chart
  automatically.
- **Rebuild on option change** — every new `option` object replaces the whole
  chart state (`setOption(option, { notMerge: true })`). `notMerge: true` is
  deliberate: ECharts' default by-id merge corrupts the multi-`yAxis` → series
  binding when the signal count changes (1→2→3).
- **Exposes handles** — optional `chartRef` (the live ECharts instance, e.g. for
  `dispatchAction`) and `divRef` (the container div, e.g. for attaching DOM
  listeners). `PlotCanvas` uses both.
- **Tree-shaking** — it registers only the modules the app uses
  (`echarts.use([LineChart, ScatterChart, GridComponent, TooltipComponent,
  MarkLineComponent, CanvasRenderer])`), keeping the bundle small.

## PlotCanvas — `src/components/PlotCanvas.tsx`

The Data tab's main chart. Covered in [tabs.md](tabs.md), but the reusable
ideas:

- **Declarative option + imperative interactions.** The `option` is built in a
  `useMemo` from store data (`PlotCanvas.tsx:85`), while wheel/drag/touch
  pan-zoom is attached as raw DOM listeners in an effect (`PlotCanvas.tsx:276`)
  to match the legacy canvas widget's exact behavior.
- **`view` prop drives everything** — `{ staticMode, staticFrom, staticTo,
  windowSec, activeFields }`. When static, the window is frozen and the memo
  stays stable so the frame doesn't rebuild as data keeps arriving; when live,
  the window rides `nowMs` from the store (`PlotCanvas.tsx:76`).
- **Refs bridge effects and renders.** `viewRef`, `onWindowRef`, `onResetRef`
  are updated in effects so the DOM handlers always read fresh values
  (`PlotCanvas.tsx:69`).
- **Empty states** — an overlay ("No data in selected range" / "Waiting for
  data…") when there are too few points.

## Header — `src/components/Header.tsx`

Pure layout + wiring:

- Renders the **logo**, one **tab button per entry in `TABS`** (from
  `tabs/index.ts`), the `<SourceToggle>`, the `<EventPicker>`, and the
  `<SearchBox>` (visible only on the Data tab).
- It's **controlled by `App`**: `activeTab`, `onTab`, `search`, `onSearch` are
  props. Header never owns this state itself — a good example of lifting state
  up.

## Sidebar — `src/components/Sidebar.tsx`

The signal picker on the Data tab:

- Groups signals by **stage** with collapsible headers (`collapsed` set tracks
  which stages are closed). Stages added later (car mode) start open.
- Each row shows label, live value, and unit, with the stage color on the left.
- Click = select (replaces), **Ctrl/⌘-click = toggle** (add/remove, max 3).
  `onSignalClick` (`Sidebar.tsx:27`) implements that logic and calls the store's
  `setActiveFields`.
- **Search filtering** — the `search` prop filters rows; matching stages auto-open
  while searching.
- Uses `useTelemetry()` directly for `signals`, `stages`, `latest`,
  `activeFields`.

## SourceToggle — `src/components/SourceToggle.tsx`

The Simulator / Car switch in the header:

- Reads `useDataSource()` and `useSourceStatus()` from the store.
- Clicking calls `setSource('sim' | 'car')` (`index.ts:70`), which stops the
  sim, disconnects the stream, wipes stale history, and starts the new source.
- The Car badge shows STANDBY / CONNECTING… / LIVE based on `sourceStatus`.

## EventPicker — `src/components/EventPicker.tsx`

In Car mode, a dropdown of the events from `GET /events`. Renders `null`
entirely when not in car mode or there are no events. Selecting one calls
`onEventSelected(name)` (`api.ts:62`), which fetches the manifest, adopts the
signals, and opens the stream.

## SearchBox — `src/components/SearchBox.tsx`

A tiny controlled input for the sidebar search. It's fully controlled: `value`
and `onChange` come from `App`, which stores `search` state.

## DateTimePicker — `src/components/DateTimePicker.tsx`

A six-segment date/time input (year, month, day, hour, minute, second) used by
the Data, Map, and Calc tabs:

- **Controlled with a twist.** The parent owns the committed ms value (`value`).
  Internally it keeps `segs` (the six displayed segments) and `lastCommitted`
  (a ref). External `value` changes resync the segments; self-committed changes
  are skipped via the ref so the user's editing isn't stomped (`DateTimePicker.tsx:131`).
- **Stepping UX** — wheel up/down, vertical drag, and arrow keys on any segment
  call `onCommit(v)` with a new value (wrapping at min/max). Typing + Enter/blur
  commits too.
- **Flash** — the `flash` prop draws a red border (used by Data/Calc tabs to
  flag an invalid "from ≥ to" range).

## charts/theme.ts — `src/components/charts/theme.ts`

Shared chart constants and helpers:

- `CHART` — colors, font, axis geometry (`axisW: 44`, grid insets).
- `hexToRgba(hex, alpha)` — for translucent fills/borders from hex colors.
- `fmtVal(v, decimals)` — formats axis/tooltip values (1 decimal for most).
- `fmtClock(t)` — HH:MM:SS from a timestamp.
- `TOOLTIP_CSS` — the shared tooltip chrome.

## Patterns worth noticing

1. **Controlled components everywhere.** Header, SearchBox, DateTimePicker,
   EventPicker, SourceToggle — they all receive `value` + `onChange`-style props
   instead of owning state. This keeps the source of truth obvious.
2. **Components that talk to the store do it via hooks** (`useTelemetry`,
   `useDataSource`, `useEvents`) — never by importing `store` directly. Direct
   store access (`getState`) is reserved for imperative renderers (PlotCanvas,
   MapTab draw loops) that don't subscribe.
3. **Effect + cleanup discipline.** Every effect that attaches DOM listeners or
   creates a resource returns a cleanup (see EChart dispose, PlotCanvas listener
   removal, DateTimePicker window listeners). This is what makes the app safe
   under StrictMode double-invocation.
