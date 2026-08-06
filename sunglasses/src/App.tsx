import { useEffect } from 'react'
import { boot, shutdown } from './telemetry'

function App() {
  useEffect(() => {
    boot()
    return () => shutdown()
  }, [])

  return <div className="shell" />
}

export default App
