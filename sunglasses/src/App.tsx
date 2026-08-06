import { useEffect, useState } from 'react'
import { boot, shutdown } from './telemetry'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import CalcTab from './tabs/CalcTab'
import DataTab from './tabs/DataTab'
import LapAnalysisTab from './tabs/LapAnalysisTab'
import MapTab from './tabs/MapTab'
import OverviewTab from './tabs/OverviewTab'
import type { TabId } from './tabs'

function App() {
  const [tab, setTab] = useState<TabId>('overview')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    boot()
    return () => shutdown()
  }, [])

  return (
    <div className="shell">
      <Header activeTab={tab} onTab={setTab} search={search} onSearch={setSearch} />
      <div className={`body-layout${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
        <Sidebar show={tab === 'data'} open={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} search={search} />
        <div id="mainContent">
          {tab === 'overview' && <OverviewTab />}
          {tab === 'data' && <DataTab />}
          {tab === 'map' && <MapTab />}
          {tab === 'calc' && <CalcTab />}
          {tab === 'lapanalysis' && <LapAnalysisTab />}
        </div>
      </div>
    </div>
  )
}

export default App
