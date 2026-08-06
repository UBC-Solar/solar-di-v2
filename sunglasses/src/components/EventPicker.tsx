import { onEventSelected, useEvents, useTelemetry } from '../telemetry'

function EventPicker() {
  const { dataSource, selectedEvent } = useTelemetry()
  const events = useEvents()
  if (dataSource !== 'car' || events.length === 0) return null

  return (
    <div className="event-picker-wrap">
      <span className="event-picker-label">Event</span>
      <select
        className="event-select"
        value={selectedEvent ?? ''}
        onChange={e => onEventSelected(e.target.value)}
      >
        <option value="">— select event —</option>
        {events.map(e => (
          <option key={e.name} value={e.name}>{e.name} ({e.status})</option>
        ))}
      </select>
    </div>
  )
}

export { EventPicker }
