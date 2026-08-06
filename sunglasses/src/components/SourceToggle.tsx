import { setSource, useDataSource, useSourceStatus } from '../telemetry'

function SourceToggle() {
  const source = useDataSource()
  const status = useSourceStatus()
  const simActive = source === 'sim'
  const carActive = source === 'car'

  const carBadgeText = status === 'live' ? 'LIVE'
    : status === 'standby' ? 'STANDBY'
    : carActive ? 'CONNECTING…'
    : 'STANDBY'

  return (
    <div className="source-toggle">
      <button
        type="button"
        className={`source-btn${simActive ? ' active sim-active' : ''}`}
        onClick={() => setSource('sim')}
      >
        <span className="source-dot"></span>
        Simulator
        <span className="source-badge sim">{simActive ? 'SIM' : 'OFF'}</span>
      </button>
      <button
        type="button"
        className={`source-btn${carActive ? ' active car-active' : ''}`}
        onClick={() => setSource('car')}
      >
        <span className="source-dot"></span>
        Car
        <span className={`source-badge ${status === 'live' ? 'live' : 'car'}`}>{carBadgeText}</span>
      </button>
    </div>
  )
}

export { SourceToggle }
