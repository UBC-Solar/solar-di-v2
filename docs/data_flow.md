# Data Flow

This document traces data through the app in both directions: **telemetry in**
(source → screen) and **user input out** (click → state → render). If you only
read one doc besides the overview, make it this one.

## Direction 1: Telemetry → screen

Everything starts with a single sample arriving from a source. There are two
sources, and they share the exact same destination:

```
SIMULATOR tick (sim.ts:125)          CAR stream (api.ts:connectStream)
   every 500ms                         SSE 'data' / 'gps' events
        │                                   │
        │ push(field, t, v)                 │ pushStreamBatch(batch)
        │ pushGPS(t, lat, lon)              │   → push(...) / pushGPS(...)
        ▼                                   ▼
   ┌─────────────────────────────────────────────┐
   │ store.ts  (the single source of truth)      │
   │  state.history[field]  ← append {t, v}      │
   │  state.latest[field]   ← {prev, value}      │
   │  state.gpsHistory      ← append {t,lat,lon} │
   │  trim older than 1 hour (MAX_MS)            │
   │  scheduleEmit()                             │
   └──────────────────────┬──────────────────────┘
                          │ scheduleEmit(): copy state to `snapshot`,
                          │ bump dataVersion/nowMs, run listeners
                          ▼
   ┌─────────────────────────────────────────────┐
   │ index.ts  (React bridge)                    │
   │  useSyncExternalStore(subscribe, getSnapshot)│
   │  → each subscribed component re-renders      │
   └──────────────────────┬──────────────────────┘
                          ▼
   ┌─────────────────────────────────────────────┐
   │ Tabs & components                            │
   │  OverviewTab reads useOverviewMapping()      │
   │  PlotCanvas rebuilds its ECharts option      │
   │  MapTab redraws the GPS trace                │
   │  Sidebar shows latest values                 │
   │  LapAnalysisTab regroups by lap              │
   └─────────────────────────────────────────────┘
```

### Walk through one sample (speed, simulator mode)

1. **Produced.** `dummyTick()` in `sim.ts:125` picks a new speed value and
   calls `push('VehicleVelocity', Date.now(), 15.2)`.

2. **Stored.** `store.ts:74` finds the `VehicleVelocity` manifest entry (none
   for sim signals have transforms, so it's used as-is), appends
   `{ t, v }` to `state.history['VehicleVelocity']`, updates
   `state.latest['VehicleVelocity']` to `{ prev: 15.0, value: 15.2 }`, trims
   old points, and calls `scheduleEmit()`.

3. **Emitted.** The first `scheduleEmit()` call of this tick schedules a
   microtask. All ~38 pushes of the tick happen before the microtask runs, so
   the listeners are notified exactly once. `snapshot` is replaced with a copy
   of `state`, and `dataVersion` / `nowMs` are bumped.

4. **Subscribed.** Components that called `useTelemetry()` (which is just
   `useSyncExternalStore(subscribe, getSnapshot)` — see `index.ts:33`) are
   notified. React re-renders them.

5. **Rendered.** The Sidebar reads `latest['VehicleVelocity'].value` and shows
   `15.2` in the Speed row. If Speed is an active plot field, `PlotCanvas`
   recomputes its ECharts `option` from `history['VehicleVelocity']` and calls
   `chart.setOption(...)`.

### Important detail: what React sees is a snapshot

`push` mutates `state.history[field]` **in place** (`.push()`). A component
that subscribed gets re-rendered, and during render it reads `snapshot` — the
copy. So the mutation itself never triggers a render; the *emit* does. This is
why `useSyncExternalStore` is safe here: between emits, `snapshot` is
reference-stable.

### Data flows through the *same* store from car mode

In car mode, `api.ts` receives an SSE `data` batch and calls `pushStreamBatch`
(`api.ts:108`). That loops over the batch and calls `push(field, t, v)` for each
signal — the **identical** store functions the simulator uses. GPS arrives as a
`gps` SSE event or as `lat`/`lon` keys inside a batch, and is routed to
`pushGPS`. The UI cannot tell the difference, which is the whole point.

### Special case: signal adoption (car mode)

When you pick a car event, `onEventSelected` (`api.ts:62`) fetches the event's
manifest and calls `replaceSignals(newSignals, newStages)`
(`store.ts:146`). This swaps the manifest and wipes `history`/`latest` so no
simulator data leaks into car displays. From then on, the same pipeline runs —
but now with the car's field names.

### Special case: seeded history

On first boot, `seedHistory()` (`sim.ts:189`) doesn't go through the normal
pipeline. It writes points directly via `pushRawPoint` / `pushRawGps` with
fixed timestamps (3 laps, one point per 2 s), then calls `notifyNow()` once to
emit everything in a single render. `ensureSeeded()` (`sim.ts:264`) guarantees
this runs exactly once even under React StrictMode's double-mounted effects.

## Direction 2: User input → state → render

Telemetry is only half the story. The other direction is what makes the app
interactive. React's rule: **the UI is a derived view of state, and the only
way to change the UI is to change state.**

Example — switching tabs. The user clicks "Map":

```
click on <button onClick={() => onTab('map')}>   (Header.tsx:22)
        │
        ▼
App.switchTab('map')        (App.tsx:33)
   setJump(null)            // clear any pending jump request
   setTab('map')
        │
        ▼
React re-runs <App />. tab === 'map' now.
The render at App.tsx:52-56 evaluates:
   {tab === 'map' && <MapTab />}        → true  → Map renders
   {tab === 'overview' && <OverviewTab />} → false → Overview unmounts
```

Example — selecting a signal to plot. The user clicks "Speed" in the sidebar:

```
click on signal row        (Sidebar.tsx:73)
        │
        ▼
onSignalClick('VehicleVelocity', multi=false)
   set.clear(); set.add('VehicleVelocity')
   setActiveFields([...set])            (Sidebar.tsx:36)
        │
        ▼
store.state.activeFields = ['VehicleVelocity']  + scheduleEmit()
        │
        ▼
DataTab re-renders (it uses useTelemetry()).
   activeMetrics → [the VehicleVelocity SignalDef]
   view changes → PlotCanvas rebuilds its chart with Speed's series
```

### Where state lives

| State | Lives in | Changed by |
|---|---|---|
| Telemetry data (history, latest, GPS) | `store.ts` | `push`, `pushGPS`, `ingest` |
| Which source (sim/car), status, events, selected event | `store.ts` | `setSource`, `onEventSelected`, `setSourceStatus` |
| Active plot fields | `store.ts` | `setActiveFields`, `toggleActiveField` |
| Which tab is open | `App.tsx` (`useState`) | `setTab` |
| Search box text | `App.tsx` (`useState`) | `setSearch` |
| Data tab: static/live mode, window, picker drafts | `DataTab.tsx` (`useState`) | local setters |
| Map tab: color-by, mode, replay, speed | `MapTab.tsx` (`useState`) | local setters |
| Calc tab: range, results, open sections | `CalcTab.tsx` (`useState`) | local setters |
| Lap analysis: metric, aggregation, lap range | `LapAnalysisTab.tsx` (`useState`) | local setters |

Rule of thumb in this codebase: **telemetry belongs in `store.ts`; UI
preferences belong in the nearest component's `useState`.** If two unrelated
components need the same value, it moves up or into the store.

### The third flow: data tab "jump" request

One cross-component flow worth tracing: clicking a mini-chart in the
Calculations tab opens that signal in the Data tab frozen to the same range.

```
MiniChart onClick  (CalcTab.tsx:320, onOpenInData)
        │
        ▼
App.openInDataTab(field, from, to)   (App.tsx:40)
   setActiveFields([field])     // store: plot just this signal
   setJump({ field, from, to }) // App state
   setTab('data')               // App state → switch to Data tab
        │
        ▼
<DataTab jump={jump} />  (App.tsx:51)
DataTab sees a new `jump`, adjusts its own state during render
(DataTab.tsx:48): enters static mode, sets from/to, syncs the pickers.
        │
        ▼
PlotCanvas receives a frozen view → shows that signal over that range
```

When the user switches tabs manually, `switchTab` clears `jump` (`App.tsx:33`)
so a stale request never reapplies on remount.
