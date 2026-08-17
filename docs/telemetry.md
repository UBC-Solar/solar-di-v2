# The Telemetry System

This document explains `src/telemetry/` in depth — the part of the app that
owns all the data. It deliberately contains **no React**: it's a plain
TypeScript layer that components subscribe to through hooks.

## File map

```
src/telemetry/
├── types.ts          # shared TypeScript shapes (SignalDef, Point, state…)
├── constants.ts      # API base URL, the signal manifest, stages, palette
├── store.ts          # the in-memory data store + subscription engine
├── sim.ts            # the simulator (fake telemetry + seeded history)
├── api.ts            # the Sunbeam client (HTTP + live SSE stream)
├── signalMapping.ts  # maps app concepts → signal field names
└── index.ts          # the public API: exports hooks + actions
```

## types.ts — the vocabulary

Everything in the data layer is built from these shapes
(`src/telemetry/types.ts`):

```ts
interface SignalDef {
  field: string    // machine name, e.g. 'VehicleVelocity'
  stage: string    // group id, e.g. 'ingress'
  label: string    // human name, e.g. 'Speed'
  unit: string     // 'm/s', 'V', 'A'…
  color: string    // hex color used everywhere it's drawn
  decimals: number // how many decimal places to display
  yMin: number     // nominal plot range (lo)
  yMax: number     // nominal plot range (hi)
  help: string     // tooltip description
  transform?: (raw: number) => number  // optional unit conversion
}

interface Point { t: number; v: number }  // one sample: timestamp + value

interface Latest { value: number | null; prev: number | null }
```

And the **entire app state** is one object:

```ts
interface TelemetryState {
  signals: SignalDef[]                       // manifest
  stages: StageDef[]                         // groups
  events: ApiEvent[]                         // car events list
  history: Record<string, Point[]>           // time-series per signal
  latest: Record<string, Latest>             // last value per signal
  gpsHistory: GpsPoint[]                     // GPS trace
  activeFields: string[]                     // signals plotted on Data tab
  dataSource: 'sim' | 'car'                  // which source is active
  sourceStatus: 'sim' | 'standby' | 'connecting' | 'live'
  selectedEvent: string | null               // chosen car event
  dataVersion: number                        // bumped on every emit cycle
  nowMs: number                              // latest emit time
}
```

**Key idea:** there is one `state` object, living in `store.ts`, shared by the
whole app. Components never hold copies of telemetry data — they read from this
single object.

## constants.ts — the signal manifest

`SIGNALS` (`src/telemetry/constants.ts:23`) is the list of every signal the
**simulator** knows about — 38 signals grouped into stages:

- **ingress** — pack voltage, throttle, currents, speed, steering…
- **power** — pack power, motor power
- **energy** — two battery-energy estimates
- **efficiency** — 1-hour, 5-minute, per-lap efficiency
- **localization** — lap index, track position/distance
- **weather** — temperature, irradiance, wind, precipitation
- **soc** — state of charge

`STAGES` gives each stage a label + color. `PALETTE` is the color cycle used
when adopting **car** signals dynamically. `MAX_MS` (1 hour) is how much
history is kept before trimming. `GPS_TELEPORT_THRESHOLD_M` (1000 m) resets the
GPS trace if the car jumps farther than that.

## store.ts — the heart

`store.ts` is a tiny hand-rolled state manager. Three responsibilities:

### 1. Own the state

```ts
const state: TelemetryState = { … }   // module-level singleton
```

Mutations are the exported functions: `push`, `pushGPS`, `ingest`,
`setActiveFields`, `replaceSignals`, `flushHistory`, etc. They all write into
`state` and then notify listeners.

### 2. Notify React (the subscription engine)

React needs to know when `state` changes. The store keeps a set of listeners
and notifies them:

```ts
const listeners = new Set<() => void>()

function scheduleEmit() {
  if (emitScheduled) return
  emitScheduled = true
  bumpVersion()
  queueMicrotask(() => {
    emitScheduled = false
    snapshot = { ...state }   // new snapshot object
    listeners.forEach(l => l())
  })
}
```

Two clever details:

- **Coalescing.** A simulator tick pushes ~38 signals, each calling
  `scheduleEmit`. Instead of 38 React re-renders, the first call schedules a
  microtask; all 38 land before it runs, so React re-renders **once per tick**.
- **Snapshot semantics.** `snapshot` is a *copy* of `state`, replaced only on
  emit. Between emits it stays the same object, which is exactly what React's
  `useSyncExternalStore` requires (see [react_patterns.md](react_patterns.md)).

### 3. The data pipeline

`push(field, t, raw)` (`src/telemetry/store.ts:74`) is the main write path:

1. Look up the signal in the manifest; apply its `transform` if any.
2. Append `{ t, v }` to that signal's `history` array.
3. Trim anything older than `now - MAX_MS` (1-hour rolling window).
4. Update `latest[field]` (`prev` becomes old value, `value` the new one).
5. Call `scheduleEmit()`.

`pushGPS(t, lat, lon)` does the same for GPS points, with an extra check: if the
new point is more than `GPS_TELEPORT_THRESHOLD_M` from the previous one, the
trace is wiped and restarted (the car teleported / reconnected).

`ingest(data)` is the convenience entry point used by callers that have one
flat batch: it pushes every known signal that appears in the batch, and routes
`lat`/`lon` to GPS history.

There's also `getState()` (direct read of the live mutable state, for
imperative code like chart draw loops that don't subscribe) vs `getSnapshot()`
(the stable snapshot for React).

## sim.ts — the simulator

`sim.ts` makes the app work with no car:

- **`startSim()`** runs `dummyTick()` every 500 ms
  (`src/telemetry/sim.ts:179`). Each tick nudges every signal with a random
  walk inside its valid range, advances lap index / track position on a 4-minute
  lap cycle, picks the next GPS waypoint from a hardcoded track, and calls
  `push`/`pushGPS`.
- **`seedHistory()`** back-fills **3 laps of history** (one point every 2
  seconds) so plots, map, calculations, and lap analysis have data *immediately*
  on first load (`src/telemetry/sim.ts:189`).
- **`ensureSeeded()`** guards against React StrictMode's double effect invocation
  so seeding happens once per session.
- `WAYPOINTS` is a pre-recorded GPS track the simulator drives around.

## api.ts — the car client

`api.ts` talks to Sunbeam in Car mode (see [sunbeam_api.md](sunbeam_api.md)):

- **`fetchEvents()`** → `GET /events` — list of recording events.
- **`fetchSignals(event)`** → `GET /events/{event}/signals` — the signal
  manifest for that event. The app *adopts* these dynamically via
  `replaceSignals`, which swaps out the simulator's manifest.
- **`onEventSelected(event)`** — fetches the manifest, builds `SignalDef`s,
  assigns colors by source (`assignColors`), then opens the live stream.
- **`connectStream()`** — opens an SSE `EventSource` on
  `/events/{event}/data/stream?signals=…`. Handles three event types: `meta`
  (logged as a sanity check), `data` (signal batches), and `gps` (GPS batches).
  Both `data` and `gps` batches feed the same `push` / `pushGPS` pipeline, so
  the store doesn't care whether data came from the sim or the car.
- **`disconnectStream()`** — closes the `EventSource`. Reconnect logic is left
  to the browser: `EventSource` auto-reconnects and sends `Last-Event-ID` so the
  server can resume without gaps.

## signalMapping.ts — concepts, not names

Tabs shouldn't hard-code `'VehicleVelocity'` everywhere, because a car event's
manifest may rename fields. `signalMapping.ts` fixes that with a concept table:

```ts
const OVERVIEW_MAPPING = [
  { key: 'soc',   names: ['SOC'] },
  { key: 'speed', names: ['VehicleVelocity'] },
  { key: 'lap',   names: ['LapIndex'] },
  …
]
```

A tab says "I want the `speed` value", and `resolveFields()` finds which field
in the *current* manifest provides it (exact match, then case-insensitive).
Missing concepts resolve to `null` and render as `—`, with a one-time console
warning. `useConceptValues()` / `useOverviewMapping()` wrap this in a hook so
tabs get `{ soc: number | null, speed: number | null, … }` directly.

## index.ts — the public API

`index.ts` is the single import point for everything outside `telemetry/`. It
re-exports:

- **Hooks** (start with `use`): `useTelemetry`, `useSignals`, `useStages`,
  `useLatest`, `useGpsHistory`, `useActiveFields`, `useDataSource`,
  `useEvents`, `useSourceStatus`.
- **Actions** (imperative calls): `boot`, `shutdown`, `setSource`,
  `setActiveFields`, `toggleActiveField`, `clearActiveFields`,
  `onEventSelected`, `loadEvents`, `connectStream`, `disconnectStream`,
  `flushHistory`, `getState`, etc.
- **Boot helpers:** `boot()` seeds the sim and starts it; `shutdown()` stops
  everything (`src/telemetry/index.ts:95`).

`boot()`/`shutdown()` are called from `App.tsx:26` in a `useEffect` — start
telemetry when the app mounts, tear it down when it unmounts.

## How it all fits together

```
sim.ts  ──pushes─┐
api.ts ──pushes─┴──▶ store.ts (push / pushGPS / ingest)
                         │ scheduleEmit() → snapshot + notify
                         ▼
                  index.ts hooks (useTelemetry, useLatest, …)
                         ▼
                  tabs & components re-render
```

The beauty of this design: **`store.ts` is the only file that knows about data
arrival, and the UI is the only thing that knows about rendering.** The
simulator and the car client both funnel into the exact same pipeline, so the
UI is identical regardless of source.
