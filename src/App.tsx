import { useCallback, useEffect, useState } from 'react'
import { boot, setActiveFields, shutdown } from './telemetry'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import CalcTab from './tabs/CalcTab'
import DataTab from './tabs/DataTab'
import LapAnalysisTab from './tabs/LapAnalysisTab'
import MapTab from './tabs/MapTab'
import OverviewTab from './tabs/OverviewTab'
import type { TabId } from './tabs'

// This file holds the app's state. It stores which tab is open, the search b

interface JumpRequest {
  field: string
  from: number
  to: number
}

function App() {
  const [tab, setTab] = useState<TabId>('overview')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [search, setSearch] = useState('')
  const [jump, setJump] = useState<JumpRequest | null>(null)

  useEffect(() => {
    boot()
    return () => shutdown()
  }, [])

  // Manual tab switches clear any pending jump so a stale range never re-applies
  // when DataTab remounts. openInDataTab (below) sets jump + tab together.
  const switchTab = useCallback((t: TabId) => {
    setJump(null)
    setTab(t)
  }, [])

  // Port of the old openInDataTab(): activate the field, freeze the data tab to
  // the requested range, then switch to it. DataTab consumes `jump` in render.
  const openInDataTab = useCallback((field: string, from: number, to: number) => {
    setActiveFields([field])
    setJump({ field, from, to })
    setTab('data')
  }, [])

  return (
    <div className="shell">
      <Header activeTab={tab} onTab={switchTab} search={search} onSearch={setSearch} />
      <div className={`body-layout${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
        <Sidebar show={tab === 'data'} open={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} search={search} />
        <div id="mainContent">
          {tab === 'overview' && <OverviewTab />}
          {tab === 'data' && <DataTab jump={jump} />}
          {tab === 'map' && <MapTab />}
          <CalcTab onOpenInData={openInDataTab} active={tab === 'calc'} />
          {tab === 'lapanalysis' && <LapAnalysisTab />}
        </div>
      </div>
    </div>
  )
}

export default App
