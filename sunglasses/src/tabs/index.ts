export type TabId = 'overview' | 'data' | 'map' | 'calc' | 'lapanalysis'

export const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'data', label: 'Data' },
  { id: 'map', label: 'Map' },
  { id: 'calc', label: 'Calculations' },
  { id: 'lapanalysis', label: 'Lap Analysis' },
]
