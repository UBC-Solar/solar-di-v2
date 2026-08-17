import { useState } from 'react'
import type { CSSProperties } from 'react'
import { setActiveFields, useTelemetry } from '../telemetry'

function Sidebar({ show, open, onToggle, search }: {
  show: boolean
  open: boolean
  onToggle: () => void
  search: string
}) {
  const { signals, stages, latest, activeFields } = useTelemetry()
  const query = search.trim().toLowerCase()

  // Collapsed stage groups. Not tracking "open" — everything starts open, and
  // stages added later (e.g. car mode signal adoption) are open until closed.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggleStage = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const onSignalClick = (field: string, multi: boolean) => {
    const set = new Set(activeFields)
    if (multi) {
      if (set.has(field)) set.delete(field)
      else if (set.size < 3) set.add(field)
    } else {
      if (set.size === 1 && set.has(field)) set.clear()
      else { set.clear(); set.add(field) }
    }
    setActiveFields([...set])
  }

  const valueOf = (field: string, decimals: number): string => {
    const l = latest[field]
    const v = l && l.value !== null && l.value !== undefined ? l.value : null
    return v !== null ? v.toFixed(decimals) : '—'
  }

  const matches = (label: string, field: string, unit: string) =>
    !query || `${label} ${field} ${unit}`.toLowerCase().includes(query)

  return (
    <>
      <div id="sidebar" className={`${open ? '' : 'collapsed'}${show ? '' : ' hidden'}`}>
        <div className="sidebar-inner">
          <div className="sidebar-scroll" id="sidebarScroll">
            {stages.map(stage => {
              const stageSignals = signals.filter(s => s.stage === stage.id)
              if (!stageSignals.length) return null
              const isOpen = query
                ? stageSignals.some(s => matches(s.label, s.field, s.unit))
                : !collapsed.has(stage.id)
              return (
                <div key={stage.id} className={`stage-group${isOpen ? ' open' : ''}`}>
                  <div className="stage-header" onClick={() => toggleStage(stage.id)}>
                    <div className="stage-dot" style={{ background: stage.color }}></div>
                    <div className="stage-name">{stage.label}</div>
                    <div className="stage-count">{stageSignals.length}</div>
                    <svg className="stage-chevron" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="4 2 8 6 4 10" /></svg>
                  </div>
                  <div className="stage-signals">
                    {stageSignals.map(sig => (
                      <div
                        key={sig.field}
                        className={`signal-row${activeFields.includes(sig.field) ? ' active' : ''}${query && !matches(sig.label, sig.field, sig.unit) ? ' hidden-search' : ''}`}
                        style={{ '--stage-color': stage.color } as CSSProperties}
                        onClick={e => onSignalClick(sig.field, e.ctrlKey || e.metaKey)}
                      >
                        <div className="sig-name" title={sig.help}>{sig.label}</div>
                        <div className="sig-value">{valueOf(sig.field, sig.decimals)}</div>
                        <div className="sig-unit">{sig.unit}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div id="sidebarToggle" className={show ? '' : 'hidden'} onClick={onToggle}>
        <svg id="sidebarToggleIcon" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <polyline points={open ? '6 2 3 5 6 8' : '4 2 7 5 4 8'} />
        </svg>
      </div>
    </>
  )
}

export { Sidebar }
