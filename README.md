# Sunglasses

A real-time telemetry dashboard. It streams data
from the car over the Sunbeam API and renders the data as numbers, graphs and a map.
Features like per-lap analysis and signals like solar irradiance are not available in "car"
(real data) mode because Sunbeam V2 (UBC Solar's newest data pipeline) does not handle
that data yet. They should be availble in the future. When no real data is available the
dashboard can be fed with fake data in "sim" mode.

Built with **React + TypeScript**, bundled with **Vite**, and wrapped in an
**Electron** desktop shell.

## Requirements

You need **Node.js** (v20 or newer) installed on your computer. Node.js comes
with **npm** (a package manager) automatically.

### Installing Node.js

Go to https://nodejs.org and download the **LTS** (long-term support) version.
Run the installer with the default settings — nothing else is needed. Close and
re-open your terminal after installing, then verify:

```bash
node --version    # should print v20+
npm --version     # should print a version number
```

## Installing the app

First, clone the repository

```bash
git clone https://github.com/UBC-Solar/sunglasses.git
```

Then, navigate into the project and install dependencies

```bash
npm install
```

Now, you can run the app using this command

```bash
npm run electron:dev
```

## Usage

All commands run from the repo root. Use `npm run electron:dev` to run the dashboard on your machine. A window with the dashboard should pop up.

### Sim mode

Sim mode is the **default** and needs _nothing_: no Sunbeam, no backend, no env
vars. Just launch the app (any way above) and it starts feeding fake telemetry —
38 channels plus 3 seeded laps of history, so every tab (plots, map, per-lap
analysis, calculations) works immediately. The header's source toggle already
sits on **Simulator**:

### Car mode

Car mode streams real telemetry from **Sunbeam** over HTTP/SSE. How the app
finds Sunbeam depends on how you launched it.

1. **Launch Sunbeam** on the machine that talks to the car (see the Sunbeam repo
   for instructions — the app expects its HTTP API on port `8000`).
2. **Launch the app** (any way above) and click **Car** in the header's source
   toggle.
3. **Pick an event** from the dropdown; the app pulls the signal manifest,
   connects the live stream, and starts rendering.

### Switching sources

- **Simulator** — default; generates fake telemetry + 3 seeded laps of history
  so plots, map, calculations, and lap analysis all work immediately.
- **Car** — live data streamed from Sunbeam.

## Documentation

This was a basic overview on how to get the dashboard working. The documentation files below go into technical detail about how the dashboard works.

| Document                                         | What it covers                                            |
| ------------------------------------------------ | --------------------------------------------------------- |
| [docs/overview.md](docs/overview.md)             | React + Electron + TypeScript, and the app structure      |
| [docs/telemetry.md](docs/telemetry.md)           | The whole telemetry system (store, simulator, API client) |
| [docs/data_flow.md](docs/data_flow.md)           | How a telemetry sample travels to the screen              |
| [docs/tabs.md](docs/tabs.md)                     | The five tabs and what they do                            |
| [docs/components.md](docs/components.md)         | Shared components and patterns                            |
| [docs/react_patterns.md](docs/react_patterns.md) | React state concepts used in this codebase                |
| [docs/sunbeam_api.md](docs/sunbeam_api.md)       | The backend API contract the app talks to                 |
| [docs/development.md](docs/development.md)       | Commands, configs, and known gotchas                      |
