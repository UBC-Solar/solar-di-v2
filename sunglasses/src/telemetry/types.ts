export interface SignalDef {
  field: string
  stage: string
  label: string
  unit: string
  color: string
  decimals: number
  yMin: number
  yMax: number
  help: string
  transform?: (raw: number) => number
}

export interface StageDef {
  id: string
  label: string
  color: string
}

export interface Point {
  t: number
  v: number
}

export interface GpsPoint {
  t: number
  lat: number
  lon: number
}

export interface Latest {
  value: number | null
  prev: number | null
}

export type DataSource = 'sim' | 'car'

export type SourceStatus = 'sim' | 'standby' | 'connecting' | 'live'

export interface TelemetryState {
  signals: SignalDef[]
  stages: StageDef[]
  events: ApiEvent[]
  history: Record<string, Point[]>
  latest: Record<string, Latest>
  gpsHistory: GpsPoint[]
  activeFields: string[]
  dataSource: DataSource
  sourceStatus: SourceStatus
  selectedEvent: string | null
  // Monotonic counter bumped once per emit cycle (coalesced pushes). React
  // components use it as a dependency when they must recompute derived data on
  // every telemetry update — e.g. the lap analysis tab's lap map, which has to
  // pick up laps as they complete live.
  dataVersion: number
  // Latest emit time (ms epoch). The data plot uses it as its live "now" so
  // the rolling window can advance during render without an impure Date.now().
  nowMs: number
}

export interface TelemetryBatch {
  timestamp?: number
  lat?: number
  lon?: number
  [field: string]: number | undefined
}

export interface ApiEvent {
  name: string
  status: string
}

export interface ApiSignal {
  name: string
  source?: string
  unit?: string
}

export interface StreamBatch {
  // Every subscribed signal is always present (empty arrays if nothing new).
  // When present, the 'lat'/'lon' keys are GPS coordinates, not signals — they
  // are routed to GPS history by api.ts.
  [field: string]: { timestamps: number[]; values: number[] }
}

export interface StreamGps {
  timestamps: number[]
  lat: number[]
  lon: number[]
}
