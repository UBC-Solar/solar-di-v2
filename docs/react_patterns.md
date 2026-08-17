# React Patterns in This Codebase

This document explains the React concepts this project uses, in the style of "a
few more lines than the one-liner". If you're new to React, read this after
[overview.md](overview.md) and [data_flow.md](data_flow.md).

## 1. State: `useState` and the render loop

React's core rule: **state changes → re-render**. Components describe what the
UI should look like *given the current state*, and React figures out the
difference.

```tsx
const [tab, setTab] = useState('overview')
```

- `tab` — the current value.
- `setTab` — the only way to change it.
- `'overview'` — initial value, used on first render.

When the user clicks a tab button, `onClick={() => onTab('map')}` fires, which
eventually calls `setTab('map')`:

1. React stores the new value.
2. React re-runs the whole `App` function.
3. The JSX re-evaluates: `{tab === 'map' && <MapTab />}` becomes true → the map
   renders. `{tab === 'overview' && <OverviewTab />}` becomes false → it
   unmounts.

That's the "UI is a derived view of state" idea. You never write DOM-manipulation
code like `if (clicked) hideOverview(); showMap();`. You mutate state and let
the render do the rest.

In this repo: `App.tsx:21` holds `tab`; `switchTab` (`App.tsx:33`) is the only
place it changes via user navigation.

## 2. Controlled inputs

An input is "controlled" when React owns its value rather than the DOM:

```tsx
function SearchBox({ value, onChange }) {
  return <input value={value} onChange={e => onChange(e.target.value)} />
}
```

- `value` comes from a parent (`App` holds `search` state).
- Typing fires `onChange`, the parent updates state, React re-renders with the
  new value back into the input.

The value shown is always whatever the parent says — the DOM never holds its own
copy. All of the app's inputs follow this pattern: SearchBox, DateTimePicker
segments, lap number inputs, the replay speed select.

## 3. `useEffect`: running code when the world changes

`useEffect(fn, deps)` runs `fn` after render, and re-runs it when anything in
`deps` changes. It's for **side effects** — things that live outside React's
render (timers, subscriptions, DOM listeners, network).

```tsx
useEffect(() => {
  boot()          // start telemetry: seed + start sim
  return () => shutdown()   // cleanup when the component unmounts
}, [])
```

`App.tsx:26` boots the whole telemetry system this way. The empty `deps` array
means "run once on mount". The returned function is the **cleanup** — React
calls it on unmount, which stops the sim and disconnects the car stream.

### Why every effect here returns a cleanup

React StrictMode (enabled in `main.tsx`) double-invokes effects in development
to surface bugs: mount → cleanup → mount again. If an effect leaks (a timer,
listener, or chart that isn't disposed), StrictMode exposes it. Every effect in
this codebase cleans up after itself:

- `EChart.tsx:57` disposes the chart + ResizeObserver.
- `PlotCanvas.tsx:376` removes every DOM listener.
- `DateTimePicker.tsx:90` removes its window listeners.
- `MapTab.tsx:160` tears down the Leaflet map.
- `DataTab.tsx:40` clears the flash timer.

## 4. `useMemo`: stable derived values

`useMemo(fn, deps)` caches the result of `fn` and only recomputes it when
`deps` change. It's used when a computation is expensive or when a stable
*identity* matters.

Example — the Data tab's `view`:

```tsx
const view = useMemo(
  () => ({ staticMode, staticFrom, staticTo, windowSec, activeFields }),
  [staticMode, staticFrom, staticTo, windowSec, activeFields],
)
```

`DataTab.tsx:63`. A plain inline object would be *new* every render, so
`PlotCanvas` would rebuild its frozen frame on every render even though nothing
changed. With `useMemo`, the object identity only changes when one of its
inputs does.

Similarly, `CalcTab` memoizes `fieldPts` against `results` so the mini-chart
data freezes at analyse time (`CalcTab.tsx:229`), and `LapAnalysisTab` memoizes
its lap map and recomputes it when `dataVersion` bumps (`LapAnalysisTab.tsx:252`).

## 5. `useRef`: stable mutable handles

`useRef(initial)` gives you a box with a `.current` property that:

- persists across renders (doesn't reset when the component re-renders),
- mutating it does **not** cause a re-render.

Uses in this repo:

- **Timers** — `flashTimer` in `DataTab.tsx:38` holds a timeout id.
- **DOM refs** — `chartRef` / `divRef` handed to `EChart` for imperative access
  (`PlotCanvas.tsx:61`).
- **Refs mirroring state** — `MapTab` keeps `colorByRef`, `modeRef`,
  `isPlayingRef`, `replaySpeedRef` alongside state. Why? Because imperative
  code (a `setTimeout` replay loop, a draw function) may be running at any
  time and must read the *latest* value without re-running through React. The
  ref and state are kept in sync (`setColorBy` sets both,
  `MapTab.tsx:182`).
- **Refs updated in effects** — `PlotCanvas` stores `viewRef`, `onWindowRef`,
  `onResetRef` in effects so DOM handlers always see fresh props
  (`PlotCanvas.tsx:69`).

## 6. `useSyncExternalStore`: subscribing to external state

This is the hook that connects React to the telemetry store. React has no idea
about `store.ts`; the hook subscribes to it and re-renders the component when
the store emits.

```tsx
function useTelemetry(): TelemetryState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
```

`src/telemetry/index.ts:33`. The three arguments:

- `subscribe(cb)` — React calls it once; you return an unsubscribe function.
- `getSnapshot()` — must return the *same* value unless the store truly changed
  (the store's `snapshot` object satisfies this — it's replaced only on emit).
- third arg — `getServerSnapshot`, same function here (no SSR).

So `useTelemetry()` behaves like "state lives somewhere else, but React re-renders
me when it changes". All the derived hooks (`useLatest`, `useSignals`,
`useEvents`, …) build on it.

## 7. Adjusting state during render ("derived reset")

Normally you adjust state in an effect. But when one state must react to a
*prop* change, this codebase uses the "adjust state during render" pattern —
calling a setter directly in the render body, guarded by a comparison:

```tsx
const [prevSource, setPrevSource] = useState(source)
if (prevSource !== source) {
  setPrevSource(source)
  setResults(null)     // clear stale calc results when source changes
  setStatus(null)
}
```

`CalcTab.tsx:365`. React re-runs the component immediately after this render
with the updated state, so the user never sees the stale frame. Why not an
effect? Effects run *after* paint, so the stale UI would flash for a frame and
you'd need extra bookkeeping to avoid loops. The same pattern appears for:

- Data tab jump requests — `DataTab.tsx:48`.
- Lap analysis source reset — `LapAnalysisTab.tsx:236`.
- DateTimePicker segment resync — `DateTimePicker.tsx:54`.

## 8. `useCallback`: stable function identity

`useCallback(fn, deps)` is `useMemo` for functions — same function object
unless deps change. Used where a function flows into `useEffect` deps or into
memoized children:

- `MapTab.tsx:87` — `stopReplay` and `drawTrace` are `useCallback`s; the mount
  effect depends on them (`MapTab.tsx:144`), so unstable identities would
  re-run the whole map setup.
- `DateTimePicker.tsx:137` — `commitSeg` is stable so the per-segment props are
  stable.

## 9. JSX conditional rendering

The app heavily uses `{cond && <Component />}`:

```tsx
{tab === 'overview' && <OverviewTab />}   // App.tsx:50
{showEmpty && <div className="plot-empty-overlay">…</div>}
```

`cond && <X/>` renders `X` when `cond` is truthy, nothing otherwise. Also used
for class switching: `className={staticMode ? 'on' : ''}` — the CSS does the
visual work while the element always exists.

## 10. Styling with inline styles

Not all styling is in `dashboard.css`. Colored values use inline `style`:

```tsx
<span className="ov-big-val" style={{ color: socColor }}>…
```

`OverviewTab.tsx:56`. And `--card-color` custom properties are set inline so the
CSS can reference them:

```tsx
<div className="plot-toolbar" style={{ '--card-color': titleColor }}>
```

This is why `vite.config.ts`'s commented-out CSP needs `style-src 'unsafe-inline'`
— see [development.md](development.md).

## Where to see each pattern

| Pattern | Best example |
|---|---|
| useState + render loop | `App.tsx:21` |
| Controlled inputs | `SearchBox.tsx`, `DateTimePicker.tsx` |
| useEffect + cleanup | `App.tsx:26`, `EChart.tsx:47` |
| useMemo | `DataTab.tsx:63`, `CalcTab.tsx:229` |
| useRef | `MapTab.tsx:75-84`, `PlotCanvas.tsx:61` |
| useSyncExternalStore | `index.ts:33` |
| Adjust state during render | `CalcTab.tsx:365`, `DataTab.tsx:48` |
| useCallback | `MapTab.tsx:87`, `DateTimePicker.tsx:137` |
| Conditional rendering | `App.tsx:52-56` |
