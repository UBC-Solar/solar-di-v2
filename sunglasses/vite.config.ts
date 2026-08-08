import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './', // so electron can find assets
  plugins: [react()],
  server: {
    proxy: {
      // Sunbeam doesn't send CORS headers, so route /events through the dev
      // server. API_BASE_URL defaults to '' (same-origin) to hit this.
      '/events': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
