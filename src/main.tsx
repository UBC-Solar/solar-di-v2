import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/leaflet/leaflet.css'
import './css/dashboard.css'
import App from './App.tsx'

// Entry point file

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
