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
  history: Record<string, Point[]>
  latest: Record<string, Latest>
  gpsHistory: GpsPoint[]
  activeFields: string[]
  dataSource: DataSource
  sourceStatus: SourceStatus
  selectedEvent: string | null
}

export interface TelemetryBatch {
  timestamp?: number
  lat?: number
  lon?: number
  LapIndexSpreadsheet?: number
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
  [field: string]: { timestamps: number[]; values: number[] }
}
