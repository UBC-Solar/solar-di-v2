import { useOverviewMapping } from '../telemetry/signalMapping'
import type { OverviewKey } from '../telemetry/signalMapping'

// NOTE: Overview renders by mapping key (soc, speed, lap, …) resolved by
// signalMapping.ts against the current signal manifest. If an event's
// manifest omits a key, its card shows '—' (plus one console warning).
function fmt(v: number | null, dec: number): string {
  return v !== null && !isNaN(v) ? v.toFixed(dec) : '—'
}

function powerFmt(v: number | null): string {
  if (v === null || isNaN(v)) return '—'
  return Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v).toString()
}

function OverviewTab() {
  const values = useOverviewMapping()
  const val = (key: OverviewKey): number | null => values[key]

  // SOC
  const socRaw = val('soc')
  const socPct = socRaw !== null ? socRaw * 100 : null
  const socColor = socPct === null ? 'var(--text)' : socPct < 20 ? '#c94f3e' : socPct < 50 ? '#c9a84c' : '#3d9e6b'

  // Speed
  const spd = val('speed')

  // Lap & Track
  const lap = val('lap')
  const trackDist = val('trackDist')
  const trackIdx = val('trackIndex')
  const trackPct = trackIdx !== null ? Math.max(0, Math.min(100, trackIdx * 100)) : 0

  // Battery
  const weakCell = val('weakCell')
  const weakCellColor = weakCell === null ? 'var(--text)' : weakCell < 3.0 ? '#c94f3e' : weakCell < 3.4 ? '#c9a84c' : '#3d9e6b'

  // Power
  const pp = val('packPower')
  const mp = val('motorPower')
  const powerColor = (v: number | null) => v === null ? 'var(--text)' : v > 500 ? '#c94f3e' : v < -200 ? '#3d9e6b' : 'var(--muted)'

  // Drive state pills
  const brake = val('brake')
  const regen = mp !== null && mp < -100

  return (
    <div className="ov-tab active">
      <div className="ov-tab-inner">
        <div className="ov-layout">

          {/* 1: SOC */}
          <div className="ov-card">
            <div className="ov-card-label">State of Charge</div>
            <div className="ov-big">
              <span className="ov-big-val" style={{ color: socColor }}>{fmt(socPct, 1)}</span>
              <span className="ov-big-unit">%</span>
            </div>
            <div className="ov-soc-bar-bg"><div className="ov-soc-bar-fill" style={{ width: socPct !== null ? `${Math.max(0, Math.min(100, socPct))}%` : '0%' }}></div></div>
            <div className="ov-soc-bar-labels"><span style={{ color: '#c94f3e' }}>20%</span><span style={{ color: '#c9a84c' }}>50%</span><span style={{ color: '#3d9e6b' }}>100%</span></div>
          </div>

          {/* 2: Speed */}
          <div className="ov-card">
            <div className="ov-card-label">Speed</div>
            <div className="ov-big">
              <span className="ov-big-val" style={{ color: '#60a5fa' }}>{fmt(spd, 1)}</span>
              <span className="ov-big-unit">m/s</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}><span>{spd !== null ? (spd * 3.6).toFixed(1) : '—'}</span> km/h</div>
          </div>

          {/* 3: Lap & Track */}
          <div className="ov-card">
            <div className="ov-card-label">Lap &amp; Position</div>
            <div className="ov-big">
              <span className="ov-big-val" style={{ color: '#f472b6' }}>{lap !== null ? Math.round(lap) : '—'}</span>
              <span className="ov-big-unit">lap</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Track: <span style={{ color: 'var(--text)' }}>{trackDist !== null ? Math.round(trackDist) : '—'}</span> / 5040 m</div>
            <div className="ov-track-bar-bg"><div className="ov-track-bar-fill" style={{ width: `${trackPct}%` }}></div></div>
          </div>

          {/* 4: Pack */}
          <div className="ov-card">
            <div className="ov-card-label">Battery</div>
            <div className="ov-row-stats">
              <div className="ov-stat">
                <div className="ov-stat-label">Voltage</div>
                <div className="ov-stat-val" style={{ color: '#60a5fa' }}>{fmt(val('packVoltage'), 1)}</div>
                <div className="ov-stat-unit">V</div>
              </div>
              <div className="ov-stat">
                <div className="ov-stat-label">Current</div>
                <div className="ov-stat-val" style={{ color: '#60a5fa' }}>{fmt(val('packCurrent'), 1)}</div>
                <div className="ov-stat-unit">A</div>
              </div>
              <div className="ov-stat">
                <div className="ov-stat-label">Weakest Cell</div>
                <div className="ov-stat-val" style={{ color: weakCellColor }}>{fmt(weakCell, 2)}</div>
                <div className="ov-stat-unit">V</div>
              </div>
            </div>
          </div>

          {/* 5: Power */}
          <div className="ov-card">
            <div className="ov-card-label">Power</div>
            <div className="ov-row-stats">
              <div className="ov-stat">
                <div className="ov-stat-label">Pack</div>
                <div className="ov-stat-val" style={{ color: powerColor(pp) }}>{powerFmt(pp)}</div>
                <div className="ov-stat-unit">W</div>
              </div>
              <div className="ov-stat">
                <div className="ov-stat-label">Motor</div>
                <div className="ov-stat-val" style={{ color: powerColor(mp) }}>{powerFmt(mp)}</div>
                <div className="ov-stat-unit">W</div>
              </div>
            </div>
            <div className="ov-pills">
              <div className={`ov-state-pill${brake ? ' active-brake' : ''}`}><span className="ov-state-dot"></span><span>Brake {brake ? 'ON' : 'OFF'}</span></div>
              <div className={`ov-state-pill${regen ? ' active-regen' : ''}`}><span className="ov-state-dot"></span><span>Regen {regen ? 'ON' : 'OFF'}</span></div>
            </div>
          </div>

          {/* 6: Solar & Efficiency */}
          <div className="ov-card">
            <div className="ov-card-label">Solar &amp; Efficiency</div>
            <div className="ov-row-stats">
              <div className="ov-stat">
                <div className="ov-stat-label">GHI</div>
                <div className="ov-stat-val" style={{ color: '#c9a84c' }}>{fmt(val('ghi'), 0)}</div>
                <div className="ov-stat-unit">W/m²</div>
              </div>
              <div className="ov-stat">
                <div className="ov-stat-label">Eff 5-min</div>
                <div className="ov-stat-val" style={{ color: '#a78bfa' }}>{fmt(val('eff5'), 0)}</div>
                <div className="ov-stat-unit">J/m</div>
              </div>
              <div className="ov-stat">
                <div className="ov-stat-label">Eff 1-hr</div>
                <div className="ov-stat-val" style={{ color: '#a78bfa' }}>{fmt(val('eff1h'), 0)}</div>
                <div className="ov-stat-unit">J/m</div>
              </div>
            </div>
          </div>

          {/* 7: Weather */}
          <div className="ov-card">
            <div className="ov-card-label">Weather</div>
            <div className="ov-row-stats">
              <div className="ov-stat">
                <div className="ov-stat-label">Air Temp</div>
                <div className="ov-stat-val" style={{ color: '#38bdf8' }}>{fmt(val('airTemp'), 1)}</div>
                <div className="ov-stat-unit">°C</div>
              </div>
              <div className="ov-stat">
                <div className="ov-stat-label">Wind</div>
                <div className="ov-stat-val" style={{ color: '#38bdf8' }}>{fmt(val('windSpeed'), 1)}</div>
                <div className="ov-stat-unit">m/s</div>
              </div>
              <div className="ov-stat">
                <div className="ov-stat-label">Wind Dir</div>
                <div className="ov-stat-val" style={{ color: '#38bdf8' }}>{fmt(val('windDir'), 0)}</div>
                <div className="ov-stat-unit">°</div>
              </div>
              <div className="ov-stat">
                <div className="ov-stat-label">Zenith</div>
                <div className="ov-stat-val" style={{ color: '#38bdf8' }}>{fmt(val('zenith'), 0)}</div>
                <div className="ov-stat-unit">°</div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export default OverviewTab
