# Development Guide

How to work on this project: the commands, the config files, and the gotchas
the team has learned the hard way.

## Commands

All run from the repo root.

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server (browser only) at `http://localhost:5183` |
| `npm run electron:dev` | Start Vite **and** open an Electron window pointed at it |
| `npm run build` | Type-check (`tsc -b`) then bundle (`vite build`) into `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run lint` | Run ESLint over the project |
| `npm run electron:build` | `VITE_API_BASE=http://localhost:8000 npm run build && electron .` — build for a local Sunbeam, then open Electron |

There is no test suite (old smoke tests were removed — see the git history
`a051894 removed smoke tests`). The "tests" are `npm run build` (type-check) and
`npm run lint`.

## Install

This is a single-package project — everything (app, Vite config, and Electron
runtime) lives in the repo root, so one install covers it:

```bash
npm install
```

## Config files

### `vite.config.ts`

- `base: './'` — relative asset URLs, required for Electron's `file://` loading.
- `server.proxy['/events']` → `http://localhost:8000` — routes car-mode API
  calls through the dev server in development (Sunbeam sends no CORS headers).
- `plugins: [react()]` — the React plugin (JSX/TSX transform + Fast Refresh).
- There's a **disabled Content-Security-Policy plugin** — see gotchas below.

### `tsconfig*.json`

- `tsconfig.json` — a "solution" file that references the other two (it has
  `files: []`).
- `tsconfig.app.json` — type-checks `src/` (the React app). `jsx: react-jsx`,
  DOM libs, `vite/client` types.
- `tsconfig.node.json` — type-checks `vite.config.ts`. Node types, `nodenext`
  module resolution.
- Both are strict-ish and `noEmit` — TypeScript only checks; Vite compiles.
- `erasableSyntaxOnly: true` — only syntax that TypeScript can erase is allowed
  (no enums, no parameter properties). Use plain types/interfaces and
  `as const` (see `tabs/index.ts`, `signalMapping.ts`).

### `eslint.config.js`

Flat config (ESLint 9+ style). Extends:
- `js.configs.recommended`
- `tseslint.configs.recommended`
- `reactHooks.configs.flat.recommended` — enforces the Rules of Hooks (this is
  why every `useEffect` has proper deps and every effect has cleanup).
- `reactRefresh.configs.vite`

Ignores `dist/`.

### `electron/main.cjs`

The whole desktop shell is ~20 lines. Two modes:
- `VITE_DEV_SERVER_URL` set → `win.loadURL(...)` (dev).
- otherwise → `win.loadFile('dist/index.html')` (built).

## Known gotchas

### 1. CSP is disabled (deliberately, with a TODO)

`vite.config.ts:2` has a commented-out CSP injection plugin. It was disabled
because the injected policy's `img-src 'self' data:` blocked Leaflet's
OpenStreetMap tiles (`https://*.tile.openstreetmap.org`), making the map render
blank while the colored trace still showed.

- The app doesn't depend on CSP to run.
- Re-enabling requires adding the tile host to `img-src` or self-hosting tiles.
- `style-src` needs `'unsafe-inline'` because the app sets inline styles and
  `--card-color` custom properties.
- `connect-src` must allow same-origin (dev proxy) + the `VITE_API_BASE` host.
- Only inject CSP into production builds (`apply: 'build'`) — the dev server
  injects inline scripts for React Fast Refresh, so a strict `script-src`
  would break HMR.

### 2. Leaflet's dynamic import and the `default` export quirk

`MapTab.tsx:146` imports Leaflet dynamically inside a mount effect:

```tsx
import('leaflet').then(mod => {
  const L = (mod as unknown as { default: typeof import('leaflet') }).default
  …
})
```

Two reasons:
1. Leaflet touches `window`/`document` at module load; dynamic import keeps the
   module SSR-safe for `renderToString` smoke tests.
2. Vite's production build emits Leaflet's UMD as a default-only export, so the
   `.default` access is required. The dev prebundle also exposes `default`.

### 3. ECharts: use `notMerge: true` when the option fully rebuilds

`EChart.tsx:72` calls `setOption(option, { notMerge: true })`. The app passes a
complete declarative option every rebuild, and ECharts' default by-id merge
corrupts the multi-`yAxis` → series binding when the axis count changes
(1→2→3 signals). `notMerge` keeps the layout exact. The comment at
`EChart.tsx:64` documents this.

### 4. The store trims history to 1 hour

`MAX_MS = 3600 * 1000` (`constants.ts:74`). Every `push`/`pushGPS` shifts out
points older than one hour. If you need longer analysis windows, bump this (and
mind memory: 38 signals × 2 Hz × points).

### 5. GPS teleport resets the trace

`GPS_TELEPORT_THRESHOLD_M = 1000` (`constants.ts:76`). A GPS jump > 1 km wipes
`gpsHistory` (`store.ts:105`). The Map tab detects the shrink and refits the
view (`MapTab.tsx:175`).

### 6. StrictMode double-invocation

`main.tsx:10` wraps `<App/>` in `<StrictMode/>`. In dev, effects mount → unmount →
mount, and state initializers run twice. The codebase handles this by:
- giving every effect a cleanup (see [react_patterns.md](react_patterns.md)),
- `ensureSeeded()` guarding the sim's history seeding (`sim.ts:262`),
- EChart disposing its chart in cleanup so the second init is fresh.

### 7. Car signals get default 0..1 plot ranges

Adopted car signals use `yMin: 0, yMax: 1` defaults because real ranges aren't
known until data arrives (`api.ts:25`). `PlotCanvas` widens the domain when
values exceed those bounds, so a 90 V pack still plots correctly
(`PlotCanvas.tsx:104`).

### 8. Don't write reconnect logic in `api.ts`

The SSE stream intentionally has no manual reconnect (`api.ts:154`).
`EventSource` auto-reconnects and sends `Last-Event-ID`; the server resumes
without gaps or duplicates. Revisit only if real-car testing shows missed data.

## Working on a feature: typical loop

1. `npm run dev` — browser first; it's faster than Electron.
2. Make a change — Vite hot-reloads the changed module (React Fast Refresh).
3. Keep the Rules of Hooks happy: `npm run lint`.
4. Type-check before finishing: `npm run build`.
5. Check the desktop shell occasionally: `npm run electron:dev`.
6. Verify car mode against a local Sunbeam on `localhost:8000` when your change
   touches `api.ts` or signal handling.
