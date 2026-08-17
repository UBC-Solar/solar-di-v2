# Documentation

This folder explains the `sunglasses` telemetry dashboard. The docs are written
to be approachable — you don't need to already know React to follow them. Each
file focuses on one aspect of the project, so pick the one you care about.

## Reading order (suggested)

1. **[overview.md](overview.md)** — What the app is, what React / Electron /
   TypeScript each do, and how they fit together. Also a full directory and
   component-tree tour. Start here if you're new.
2. **[data_flow.md](data_flow.md)** — The single most important idea: how a
   telemetry sample travels from the simulator (or car) all the way to a number
   on screen, and how user clicks flow back the other way.
3. **[telemetry.md](telemetry.md)** — The data layer in detail: the signal
   manifest, the central store, the simulator, and the car API client.
4. **[tabs.md](tabs.md)** — What each of the five tabs shows and how it's built.
5. **[components.md](components.md)** — The shared components and the patterns
   they demonstrate.
6. **[react_patterns.md](react_patterns.md)** — The React state concepts this
   codebase uses (`useState`, `useMemo`, `useSyncExternalStore`, controlled
   inputs, and more).
7. **[sunbeam_api.md](sunbeam_api.md)** — The backend HTTP/SSE contract the app
   talks to in Car mode.
8. **[development.md](development.md)** — Commands, config files, and gotchas
   for working on the project.

## One-paragraph map of the repo

```
├── electron/main.cjs      # Electron shell: opens the window, loads the app
├── index.html             # the single HTML page (React mounts into #root)
├── vite.config.ts         # dev server config + /events proxy to Sunbeam
├── src/
│   ├── main.tsx           # React entry point: renders <App />
│   ├── App.tsx            # root component: header + sidebar + active tab
│   ├── components/        # reusable UI (Header, Sidebar, charts, pickers…)
│   ├── tabs/              # the 5 tab screens (Overview, Data, Map, Calc, Lap)
│   ├── telemetry/         # the data layer (store, simulator, car client)
│   ├── css/dashboard.css  # all styling
│   └── lib/leaflet/       # vendored Leaflet (maps)
└── package.json           # dependencies + scripts
```

The big architectural split: **`src/telemetry/` knows nothing about React** — it
owns the data. **`src/components/` and `src/tabs/` know nothing about where data
comes from** — they render whatever the telemetry layer hands them. The bridge
between the two is a small set of React hooks exported from
`src/telemetry/index.ts`.

## Conventions used throughout the docs

- `path/file.ts:line` points at the relevant source. Example: `src/App.tsx:21`
  is line 19 of `src/App.tsx`.
- "Signal" means a named telemetry channel (e.g. `VehicleVelocity`, `SOC`).
- "Stage" means a signal group (Ingress, Power, Energy, Efficiency,
  Localization, Weather, SOC).
