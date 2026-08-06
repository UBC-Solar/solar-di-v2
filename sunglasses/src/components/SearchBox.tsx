function SearchBox({ visible, value, onChange }: {
  visible: boolean
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className={`header-search${visible ? '' : ' hidden'}`}>
      <svg className="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        placeholder="Search signals…"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}

export { SearchBox }
