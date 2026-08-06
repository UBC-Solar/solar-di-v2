function Sidebar({ show, open, onToggle }: {
  show: boolean
  open: boolean
  onToggle: () => void
}) {
  return (
    <>
      <div id="sidebar" className={`${open ? '' : 'collapsed'}${show ? '' : ' hidden'}`}>
        <div className="sidebar-inner">
          <div className="sidebar-scroll" id="sidebarScroll">
            {/* Signal list lands here in Step 4 */}
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
