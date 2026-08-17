# Overview: React + Electron + TypeScript

This document explains what the app is, what each of the three technologies
does, how they interact, and how the project is laid out. It's the "big
picture" file — the other docs go deep on specific pieces.

## What the app is

This is a **telemetry dashboard** for the UBC Solar racing team. The car
streams sensor data — pack voltage, motor power, speed, solar
irradiance, GPS position, state of charge, and more. This app visualizes that
data as:

- live readings on an **Overview** screen,
- scrolling time-series **plots**,
- a color-coded **GPS map** with replay,
- **calculations** over a chosen time range (energy, efficiency, per-lap stats),
- **lap analysis** (per-lap averages and trends).

It works with the **real car** over the Sunbeam HTTP/SSE API, and with a
**built-in simulator** so every feature works offline with no backend.

## The three technologies, in one sentence each

| Technology     | What it does here                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **React**      | Renders the user interface. A JavaScript/TypeScript library for building UIs out of small components that re-render when data changes.                                                     |
| **TypeScript** | A typed superset of JavaScript. Lets you describe shapes of data (`interface SignalDef { field: string; unit: string; … }`) so the editor and compiler catch mistakes before the app runs. |
| **Electron**   | Wraps the web app in a desktop window. Chromium renders the React UI; Node.js provides the app shell. The UI code is identical whether you run it in a browser or as a desktop app.        |
| **Vite**       | The dev server and bundler. It compiles the TypeScript/JSX on the fly, hot-reloads changes in the browser, and produces the production `dist/` build that Electron loads.                  |

## How the pieces interact

```
  ┌──────────────────────────────────────────────────────────────┐
  │  ELECTRON (electron/main.cjs)                                │
  │  Opens a BrowserWindow. In dev it loads http://localhost:5173│
  │  (Vite dev server). In production it loads dist/index.html.  │
  └──────────────────────────────┬───────────────────────────────┘
                                 │ loads
  ┌──────────────────────────────▼───────────────────────────────┐
  │  VITE (vite.config.ts)                                       │
  │  Dev server + bundler. Compiles .tsx → browser JS.           │
  │  Proxies /events → http://localhost:8000 (Sunbeam, car mode).│
  └──────────────────────────────┬───────────────────────────────┘
                                 │ bundles
  ┌──────────────────────────────▼───────────────────────────────┐
  │  REACT app (src/)                                            │
  │  index.html → main.tsx → <App /> → header, sidebar, tabs     │
  │  Tabs call hooks (useTelemetry, useLatest…) that read data   │
  │  from the telemetry store and re-render when it changes.     │
  └──────────────────────────────────────────────────────────────┘
```

The important thing to absorb: **Electron is just a window.** The actual
application — all the logic and UI — is a plain web app that works in any
browser. Electron adds the "it's a desktop program" layer (and, in future,
native capabilities). You can do 95% of development in the browser with
`npm run dev` and only use `npm run electron:dev` to check the desktop shell.

## Where TypeScript shows up

TypeScript files use `.ts` (no JSX) or `.tsx` (contains JSX markup). The app has
two TypeScript "projects" (see `tsconfig.json`):

- **`tsconfig.app.json`** — type-checks `src/` (the React app). Has DOM types.
- **`tsconfig.node.json`** — type-checks `vite.config.ts` (Node-side tooling).

Both are `noEmit`: TypeScript is only used to **type-check**. Vite strips types
and does the actual compilation. `npm run build` runs `tsc -b` (check) followed
by `vite build` (bundle).

## Project structure (folder tour)

```
├── electron/main.cjs      # (1) the desktop shell — 21 lines, opens a window
├── index.html             # (2) the single HTML page the app mounts into
├── vite.config.ts         # (3) dev server + Sunbeam proxy + build config
├── package.json           # (4) dependencies and npm scripts
├── tsconfig*.json         # (5) TypeScript project definitions
├── public/                # static files copied verbatim into dist/
└── src/                   # (6) the actual app
    ├── main.tsx           #   entry point: renders <App /> into #root
    ├── App.tsx            #   root component (layout + tab switching)
    ├── components/        #   reusable UI pieces
    ├── tabs/              #   the five tab screens
    ├── telemetry/         #   data layer (no React)
    ├── css/dashboard.css  #   all styling
    └── lib/leaflet/       #   vendored Leaflet map library
```

### (1) `electron/main.cjs` — the shell

```js
const createWindow = () => {
  const win = new BrowserWindow({ width: 800, height: 600 });
  if (DEV_SERVER_URL)
    win.loadURL(DEV_SERVER_URL); // dev
  else win.loadFile(path.join(__dirname, "../dist/index.html")); // prod
};
```

It checks whether Vite gave it a dev-server URL; if yes it loads the live
server, otherwise it loads the built files. Nothing else happens in Electron.

### (2) `index.html` — the mount point

```html
<div id="root"></div>
<script type="module" src="/src/main.tsx"></script>
```

React is a browser library; it needs one DOM node to attach to. `#root` is that
node. The `<script>` tag tells Vite to start the app at `src/main.tsx`.

### (3) `vite.config.ts` — dev server + proxy

Two notable things:

- `server.proxy['/events']` forwards requests to `http://localhost:8000` (the
  Sunbeam API) during development, so the app can fetch from the same origin
  without CORS headaches.
- `base: './'` makes asset URLs relative, which Electron's `file://` loading
  needs.

### (4) `package.json` — scripts

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "electron:dev": "concurrently ... \"vite\" ... \"wait-on ... && VITE_DEV_SERVER_URL=http://localhost:5173 electron .\""
}
```

- `npm run dev` — browser-only development.
- `npm run electron:dev` — starts Vite, waits until it's up, then opens Electron
  pointed at the dev server.

### (5) `tsconfig*.json` — see "Where TypeScript shows up" above.

### (6) `src/` — the app

**`main.tsx`** — React's "turn on" file:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

**`App.tsx`** — the root component. It holds the app-level state (which tab is
open, the search box, etc.) and renders the layout:

```
<App>
├── <Header>              — logo, top tabs, source toggle, event picker, search
├── <Sidebar>             — signal list grouped by stage (Data tab only)
└── <div id="mainContent">— the active tab:
    ├── <OverviewTab>     — when tab === 'overview'
    ├── <DataTab>         — when tab === 'data'
    ├── <MapTab>          — when tab === 'map'
    ├── <CalcTab>         — always mounted (see tabs.md)
    └── <LapAnalysisTab>  — when tab === 'lapanalysis'
```

The one-line mental model: **state → render**. `App` keeps `tab` in state;
whichever tab matches is what the user sees. See
[react_patterns.md](react_patterns.md) for the details.

## The two worlds inside `src/`

This is the most important structural fact about the codebase:

- **`src/telemetry/`** — pure data logic. No React, no DOM. Owns the signal
  manifest, the in-memory data store, the simulator, and the car API client.
- **`src/components/` + `src/tabs/`** — pure presentation. They never fetch
  data or talk to the car; they render whatever the telemetry layer gives them.

They connect through a small set of hooks in `src/telemetry/index.ts`:
`useTelemetry()`, `useLatest(field)`, `useSignals()`, `useEvents()`, etc. A tab
calls one of these and React re-renders the tab whenever the store changes.

## Component tree (the whole UI)

```
main.tsx
└── <App>                          App.tsx
    ├── <Header>                   components/Header.tsx
    │   ├── <SourceToggle>         components/SourceToggle.tsx
    │   ├── <EventPicker>          components/EventPicker.tsx
    │   └── <SearchBox>            components/SearchBox.tsx
    ├── <Sidebar>                  components/Sidebar.tsx
    └── <mainContent>
        ├── <OverviewTab>          tabs/OverviewTab.tsx
        ├── <DataTab>              tabs/DataTab.tsx
        │   ├── <DateTimePicker>   components/DateTimePicker.tsx
        │   └── <PlotCanvas>       components/PlotCanvas.tsx
        │       └── <EChart>       components/EChart.tsx
        ├── <MapTab>               tabs/MapTab.tsx
        │   └── <DateTimePicker>
        ├── <CalcTab>              tabs/CalcTab.tsx
        │   ├── <DateTimePicker>
        │   ├── <EChart>           (mini charts)
        │   └── <ResultsView>      (inside CalcTab)
        └── <LapAnalysisTab>       tabs/LapAnalysisTab.tsx
            └── <EChart>
```

## Where to go next

- [data_flow.md](data_flow.md) — how data gets to the screen.
- [telemetry.md](telemetry.md) — the data layer in depth.
- [tabs.md](tabs.md) — what each tab actually shows.
