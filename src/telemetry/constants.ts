import type { SignalDef, StageDef } from './types'

// Default '' routes same-origin (dev: Vite proxies /events to Sunbeam via
// vite.config.ts server.proxy). Set VITE_API_BASE at build time for a packaged
// Electron app that must hit Sunbeam directly. TODO: settings panel later.
export const API_BASE_URL =
  typeof import.meta.env !== 'undefined' && import.meta.env.VITE_API_BASE
    ? import.meta.env.VITE_API_BASE
    : ''

// Stages with color identities
export const STAGES: StageDef[] = [
  { id: 'ingress',      label: 'Ingress',      color: '#60a5fa' },
  { id: 'power',        label: 'Power',        color: '#c94f3e' },
  { id: 'energy',       label: 'Energy',       color: '#3d9e6b' },
  { id: 'efficiency',   label: 'Efficiency',   color: '#a78bfa' },
  { id: 'localization', label: 'Localization', color: '#f472b6' },
  { id: 'weather',      label: 'Weather',      color: '#38bdf8' },
  { id: 'soc',          label: 'SOC',          color: '#c9a84c' },
]

// Full signal manifest
export const SIGNALS: SignalDef[] = [
  // ── Ingress ──
  { key: 'packVoltage',        field: 'TotalPackVoltage',    stage: 'ingress',    label: 'Pack Voltage',        unit: 'V',    color: '#60a5fa', decimals: 1, yMin: 80,   yMax: 160,  help: 'Voltage of the battery pack.' },
  { key: 'throttle',           field: 'AcceleratorPosition', stage: 'ingress',    label: 'Throttle Position',   unit: '',     color: '#60a5fa', decimals: 2, yMin: 0,    yMax: 1,    help: 'Decimal percentage (0–1) of accelerator position.' },
  { key: 'batteryCurrent',     field: 'BatteryCurrent',      stage: 'ingress',    label: 'Battery Current',     unit: 'A',    color: '#60a5fa', decimals: 1, yMin: -50,  yMax: 200,  help: 'Current flowing into the motor (+draw, −regen).' },
  { key: 'motorVoltage',       field: 'BatteryVoltage',      stage: 'ingress',    label: 'Motor Voltage',       unit: 'V',    color: '#60a5fa', decimals: 1, yMin: 0,    yMax: 160,  help: 'Voltage experienced by the motor.' },
  { key: 'arrayCurrent1',      field: 'CurrentSensor1',      stage: 'ingress',    label: 'Array Current 1',     unit: 'A',    color: '#60a5fa', decimals: 2, yMin: 0,    yMax: 10,   help: 'Current of solar array string 1.' },
  { key: 'arrayCurrent2',      field: 'CurrentSensor2',      stage: 'ingress',    label: 'Array Current 2',     unit: 'A',    color: '#60a5fa', decimals: 2, yMin: 0,    yMax: 10,   help: 'Current of solar array string 2.' },
  { key: 'brake',              field: 'MechBrakePressed',    stage: 'ingress',    label: 'Brake Applied',       unit: '',     color: '#60a5fa', decimals: 0, yMin: 0,    yMax: 1,    help: 'Mechanical brake state: 0=released, 1=pressed.' },
  { key: 'packCurrent',        field: 'PackCurrent',         stage: 'ingress',    label: 'Pack Current',        unit: 'A',    color: '#60a5fa', decimals: 1, yMin: -50,  yMax: 200,  help: 'Signed current out of battery (+draw, −charge).' },
  { key: 'speed',              field: 'VehicleVelocity',     stage: 'ingress',    label: 'Speed',               unit: 'm/s',  color: '#60a5fa', decimals: 1, yMin: 0,    yMax: 50,   help: 'Speed of Brightside in m/s.' },
  { key: 'steeringAngle',      field: 'SteeringAngle',       stage: 'ingress',    label: 'Steering Angle',      unit: '°',    color: '#60a5fa', decimals: 1, yMin: -180, yMax: 180,  help: 'Steering wheel angle. 0=straight, positive=right, negative=left.' },
  { key: 'arrayVoltage1',      field: 'VoltSensor1',         stage: 'ingress',    label: 'Array Voltage 1',     unit: 'V',    color: '#60a5fa', decimals: 1, yMin: 0,    yMax: 80,   help: 'Voltage of solar array string 1.' },
  { key: 'arrayVoltage2',      field: 'VoltSensor2',         stage: 'ingress',    label: 'Array Voltage 2',     unit: 'V',    color: '#60a5fa', decimals: 1, yMin: 0,    yMax: 80,   help: 'Voltage of solar array string 2.' },
  { key: 'weakCell',           field: 'VoltageofLeast',      stage: 'ingress',    label: 'Weakest Cell Voltage', unit: 'V',   color: '#60a5fa', decimals: 2, yMin: 2.5,  yMax: 4.2,  help: 'Voltage of the battery module with lowest voltage.' },

  // ── Power ──
  { key: 'packPower',          field: 'PackPower',           stage: 'power',      label: 'Pack Power',          unit: 'W',    color: '#c94f3e', decimals: 0, yMin: -1000, yMax: 15000, help: 'Net power leaving the battery in W.' },
  { key: 'motorPower',         field: 'MotorPower',          stage: 'power',      label: 'Motor Power',         unit: 'W',    color: '#c94f3e', decimals: 0, yMin: -2000, yMax: 10000, help: 'Net power used by the motor. Negative = regen.' },

  // ── Energy ──
  { key: 'energyVoltEst',      field: 'EnergyVOLExtrapolated',     stage: 'energy', label: 'Energy (Voltage Est.)',   unit: 'Wh',  color: '#3d9e6b', decimals: 0, yMin: 0,   yMax: 5000, help: 'Battery energy estimated from VoltageofLeast & SANYO NCR18650GA datasheet.' },
  { key: 'energyCoulomb',      field: 'EnergyFromIntegratedPower', stage: 'energy', label: 'Energy (Coulomb Count)', unit: 'Wh',   color: '#3d9e6b', decimals: 0, yMin: 0,   yMax: 5000, help: 'Coulomb-counting energy estimate. Smoother short-term, may drift long-term.' },

  // ── Efficiency ──
  { key: 'eff1h',              field: 'Efficiency1Hour',     stage: 'efficiency', label: 'Efficiency 1-hr',     unit: 'J/m',  color: '#a78bfa', decimals: 1, yMin: 0,   yMax: 800,  help: 'Driving efficiency averaged over 1-hour periods.' },
  { key: 'eff5',               field: 'Efficiency5Minute',   stage: 'efficiency', label: 'Efficiency 5-min',    unit: 'J/m',  color: '#a78bfa', decimals: 1, yMin: 0,   yMax: 800,  help: 'Driving efficiency averaged over 5-minute periods.' },
  { key: 'effLap',             field: 'EfficiencyLap',       stage: 'efficiency', label: 'Efficiency per Lap',  unit: 'J/m',  color: '#a78bfa', decimals: 1, yMin: 0,   yMax: 800,  help: 'Driving efficiency averaged over each lap (5.04 km).' },

  // ── Localization ──
  { key: 'lap',                field: 'LapIndex',            stage: 'localization', label: 'Lap Index',         unit: 'lap', color: '#f472b6', decimals: 0, yMin: 0,  yMax: 60,   help: 'Best available lap index. Prefers spreadsheet > integrated speed.' },
  { key: 'trackIndex',         field: 'TrackIndex',          stage: 'localization', label: 'Track Position',     unit: '',    color: '#f472b6', decimals: 2, yMin: 0,  yMax: 1,    help: 'Best available track position index.' },
  { key: 'trackDist',          field: 'TrackDistSpreadsheet',stage: 'localization', label: 'Lap Distance',       unit: 'm',   color: '#f472b6', decimals: 0, yMin: 0,  yMax: 5040, help: 'Distance along current lap from spreadsheet splits + integrated speed.' },

  // ── Weather ──
  { key: 'airTemp',            field: 'AirTemperature',      stage: 'weather',    label: 'Air Temperature',     unit: '°C',   color: '#38bdf8', decimals: 1, yMin: -10, yMax: 45,   help: 'Air temperature at 2 m above surface.' },
  { key: 'dhi',                field: 'DHI',                 stage: 'weather',    label: 'Diffuse Irradiance',  unit: 'W/m²', color: '#38bdf8', decimals: 0, yMin: 0,   yMax: 400,  help: 'Diffuse Horizontal Irradiance — scattered sky radiation.' },
  { key: 'dni',                field: 'DNI',                 stage: 'weather',    label: 'Direct Irradiance',   unit: 'W/m²', color: '#38bdf8', decimals: 0, yMin: 0,   yMax: 1000, help: 'Direct Normal Irradiance — beam radiation from sun direction.' },
  { key: 'ghi',                field: 'GHI',                 stage: 'weather',    label: 'Total Irradiance',    unit: 'W/m²', color: '#38bdf8', decimals: 0, yMin: 0,   yMax: 1200, help: 'Global Horizontal Irradiance — total surface irradiance.' },
  { key: 'precipitation',      field: 'PrecipitationRate',   stage: 'weather',    label: 'Precipitation',       unit: 'mm/h', color: '#38bdf8', decimals: 1, yMin: 0,   yMax: 50,   help: 'Estimated average precipitation rate.' },
  { key: 'windDir',            field: 'WindDirection',       stage: 'weather',    label: 'Wind Direction',      unit: '°',    color: '#38bdf8', decimals: 0, yMin: 0,   yMax: 360,  help: 'Wind direction at 10 m. 0=north, 270=west.' },
  { key: 'windSpeed',          field: 'WindSpeed',           stage: 'weather',    label: 'Wind Speed',          unit: 'm/s',  color: '#38bdf8', decimals: 1, yMin: 0,   yMax: 20,   help: 'Wind speed at 10 m above ground.' },
  { key: 'zenith',             field: 'Zenith',              stage: 'weather',    label: 'Solar Zenith',        unit: '°',    color: '#38bdf8', decimals: 0, yMin: 0,   yMax: 90,   help: 'Angle between sun and zenith. 0=overhead, 90=horizon.' },

  // ── SOC ──
  { key: 'soc',                field: 'SOC',                 stage: 'soc',        label: 'State of Charge',     unit: '',     color: '#c9a84c', decimals: 3, yMin: 0,   yMax: 1,    help: 'Thevenin + Extended Kalman Filter SOC. Uses voltage to correct for sensor drift.' },

  // ── Test ──
  { key: 'nsm',                field: 'NewSignalName',       stage: 'ingress',    label: 'New Signal',          unit: 'W',    color: '#ff0000', decimals: 1, yMin: 0,   yMax: 1000, help: 'Description of what this signal measures.' },
]

// Backwards-compat alias for map color-by & calc engine
export const METRICS = SIGNALS

export const MAX_MS = 3600 * 1000

export const GPS_TELEPORT_THRESHOLD_M = 1000

export const PALETTE = ['#60a5fa', '#c94f3e', '#3d9e6b', '#a78bfa', '#f472b6', '#38bdf8', '#c9a84c']
