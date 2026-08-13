import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

//TODO: INVESTIGATE THIS
// Injected only into production builds. The dev server injects inline scripts
// for React Fast Refresh, so a strict script-src there would break HMR.
// style-src needs 'unsafe-inline' because the app sets React inline style
// attributes (colours, --card-color, etc). connect-src allows same-origin
// (dev proxy) plus localhost: for a packaged Electron build pointing at a
// local Sunbeam via VITE_API_BASE; a remote Sunbeam host would need to be
// added here.
function cspPlugin(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self' http://localhost:* ws://localhost:*",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')

  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml() {
      return [{
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
        injectTo: 'head-prepend',
      }]
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './', // so electron can find assets
  plugins: [react(), cspPlugin()], // add cspPlugin() later?
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
