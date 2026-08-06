function DataTab() {
  return (
    <div id="dataTab">
      <div id="mainArea">
        <div className="plot-panel">
          <div className="plot-empty">
            <div className="plot-empty-hint">Select a signal from the sidebar to view its plot</div>
            <div className="plot-empty-sub">Hold Ctrl / ⌘ to overlay up to 3 signals</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DataTab
