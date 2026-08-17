import { TABS } from '../tabs'
import type { TabId } from '../tabs'
import { EventPicker } from './EventPicker'
import { SearchBox } from './SearchBox'
import { SourceToggle } from './SourceToggle'

function Header({ activeTab, onTab, search, onSearch }: {
  activeTab: TabId
  onTab: (tab: TabId) => void
  search: string
  onSearch: (v: string) => void
}) {
  return (
    <header>
      <div className="logo">UBC <span>Solar</span></div>
      <nav className="top-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            className={`top-tab${t.id === activeTab ? ' active' : ''}`}
            onClick={() => onTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <SourceToggle />
      <EventPicker />
      <SearchBox visible={activeTab === 'data'} value={search} onChange={onSearch} />
    </header>
  )
}

export { Header }
