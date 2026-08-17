# Sunbeam API Contract

In **Car** mode the app talks to the Sunbeam backend. This document describes
the endpoints the app uses, based on the client code in `src/telemetry/api.ts`.
It's the contract the app *expects*; Sunbeam's full API may have more.

## Base URL

- Development: the Vite dev server proxies `/events` → `http://localhost:8000`
  (`vite.config.ts:62`). The app uses a same-origin `API_BASE_URL = ''`.
- Production (packaged Electron): set `VITE_API_BASE` at build time to point at
  a Sunbeam host (`constants.ts:6`).

Sunbeam does **not** send CORS headers, which is why the dev proxy exists.

## Endpoints used

### `GET /events`

Returns a list of recording events. The app expects an array:

```json
[
  { "name": "2026-06-01 Test", "status": "recording" }
]
```

Used by `fetchEvents()` (`api.ts:31`). The app stores them in `state.events`
and shows them in the header's `EventPicker`. On failure (or a non-OK response)
it returns `[]` rather than throwing.

### `GET /events/{event}/signals`

Returns the signal manifest for one event. The app expects an array:

```json
[
  { "name": "VehicleVelocity", "source": "ingress", "unit": "m/s" },
  { "name": "SOC", "source": "soc" }
]
```

Used by `fetchSignals(event)` (`api.ts:36`). Each entry becomes a `SignalDef`
via `apiSignalToSignal()` (`api.ts:12`):

- `field` ← `name`
- `stage` ← `source` (lowercased) — signals are grouped by source
- `label` ← `name`, `unit` ← `unit || ''`
- `color` ← assigned per source from `PALETTE` (`assignColors`, `api.ts:5`)
- `decimals`, `yMin`, `yMax` ← fixed defaults (0..1); `PlotCanvas` widens the
  domain when real values exceed them

The app **adopts** this manifest: `replaceSignals()` swaps out the simulator's
signals and wipes old history (`store.ts:146`).

### `GET /events/{event}/data/stream?signals=a,b,c`

A **Server-Sent Events (SSE)** stream. The app requires `signals=` (the server
returns 422 if empty), and subscribes to every manifest field.

Three event types are handled (`connectStream`, `api.ts:121`):

**`meta`** — sent once at the start. Sent for sanity-checking only; the app
logs it and ignores it:

```json
{ "frequency": 10, "signals": { "VehicleVelocity": { "id": 1, "unit": "m/s" } } }
```

**`data`** — a batch of signal samples. Shape: every subscribed signal is
present as `{ timestamps, values }` (empty arrays if nothing new):

```json
{
  "VehicleVelocity": { "timestamps": [1710000000000, 1710000000500], "values": [15.2, 15.4] },
  "SOC":            { "timestamps": [1710000000000],             "values": [0.715] }
}
```

GPS may arrive inside a batch too, as `lat`/`lon` keys:

```json
{
  "lat": { "timestamps": [1710000000000], "values": [37.001] },
  "lon": { "timestamps": [1710000000000], "values": [-86.368] }
}
```

**`gps`** — a dedicated GPS event (alternative to the keys above):

```json
{ "timestamps": [1710000000000], "lat": [37.001], "lon": [-86.368] }
```

Both GPS forms are routed to the GPS trace, not the signal pipeline
(`api.ts:98`, `api.ts:146`).

### Reconnect semantics

The app does **not** implement reconnection. `EventSource` reconnects
automatically and sends the last received event `id` as `Last-Event-ID`; the
server is expected to resume from there without gaps or duplicates
(`api.ts:154`). This was decided after live-car testing; revisit only if real
testing shows missed data on reconnect.

## Data flow summary

```
select event → GET /events/{event}/signals   (manifest)
             → replaceSignals()              (adopt manifest)
             → GET /events/{event}/data/stream?signals=…   (SSE)
                     ├── meta → log
                     ├── data → pushStreamBatch → push / pushGPS
                     └── gps  → pushGPS
```

Every incoming sample ends up in the same `store.ts` pipeline the simulator
uses, so the UI is identical in sim and car modes (see
[data_flow.md](data_flow.md)).
