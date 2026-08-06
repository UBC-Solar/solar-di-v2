import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/leaflet/leaflet.css'
import './css/dashboard.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
