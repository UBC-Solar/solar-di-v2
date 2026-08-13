import { defineConfig } from 'vite'
// TODO: CSP re-enable — uncomment with cspPlugin() below.
// import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// TODO: CSP re-enable (see the plugins comment below). Commented out because
// the injected meta tag's `img-src 'self' data:` blocked the Leaflet
// OpenStreetMap tile images (https://*.tile.openstreetmap.org), so the map
// tab rendered blank while the colored GPS trace still showed. Nothing in the
// app depends on CSP to run. To re-enable: uncomment this function, add the
// tile host to img-src (or self-host tiles), and use plugins: [react(), cspPlugin()].
// Injected only into production builds. The dev server injects inline scripts
// for React Fast Refresh, so a strict script-src there would break HMR.
// style-src needs 'unsafe-inline' because the app sets React inline style
// attributes (colours, --card-color, etc). connect-src allows same-origin
// (dev proxy) plus localhost: for a packaged Electron build pointing at a
// local Sunbeam via VITE_API_BASE; a remote Sunbeam host would need to be
// added here.
// function cspPlugin(): Plugin {
//   const csp = [
//     "default-src 'self'",
//     "script-src 'self'",
//     "style-src 'self' 'unsafe-inline'",
//     "img-src 'self' data:",
//     "font-src 'self' data:",
//     "connect-src 'self' http://localhost:* ws://localhost:*",
//     "worker-src 'self' blob:",
//     "object-src 'none'",
//     "base-uri 'self'",
//     "form-action 'self'",
//   ].join('; ')
//
//   return {
//     name: 'inject-csp',
//     apply: 'build',
//     transformIndexHtml() {
//       return [{
//         tag: 'meta',
//         attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
//         injectTo: 'head-prepend',
//       }]
//     },
//   }
// }

// https://vite.dev/config/
export default defineConfig({
  base: './', // so electron can find assets
  plugins: [react()],
  // TODO: CSP re-enable. Commented out because the injected meta tag's
  // `img-src 'self' data:` blocked the Leaflet OpenStreetMap tile images
  // (https://*.tile.openstreetmap.org), so the map tab rendered blank while
  // the colored GPS trace still showed. Nothing in the app depends on CSP to
  // run. Re-enable (plugins: [react(), cspPlugin()]) once the tile host is
  // added to img-src or tiles are self-hosted.
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
