import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // strictPort: fail loudly rather than drifting onto 5174, which belongs to
  // the dashboard. A silently reassigned port is a confusing half-hour.
  server: { host: true, port: 5173, strictPort: true },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // No update prompt — a kiosk-style check-in flow should never ask the
      // guest to reload.
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-180.png'],
      manifest: {
        name: 'ChqIn — Check in by QR',
        short_name: 'ChqIn',
        description:
          'Scan a QR code at the hotel desk and check in in under a minute.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f1c3f',
        theme_color: '#f8fafc',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Everything the app needs ships in the build — fonts included — so
        // precaching alone gets us a fully offline demo.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      devOptions: {
        // Lets you exercise the service worker with `npm run dev` too.
        enabled: true,
        type: 'module',
      },
    }),
  ],
})
