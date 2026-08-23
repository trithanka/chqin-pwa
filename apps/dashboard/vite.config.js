import { networkInterfaces } from 'node:os'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The desk QR has to be reachable from a phone, so in dev it needs this
// machine's LAN address — localhost is whatever device scans the code.
const lanIp = () =>
  Object.values(networkInterfaces())
    .flat()
    .find((i) => i.family === 'IPv4' && !i.internal)?.address ?? 'localhost'

// 5174 so the guest PWA (5173) and the dashboard can run side by side.
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  server: { port: 5174, host: true, strictPort: true },
  define:
    command === 'serve' && !process.env.VITE_GUEST_APP_URL
      ? {
          'import.meta.env.VITE_GUEST_APP_URL': JSON.stringify(
            `http://${lanIp()}:5173`,
          ),
        }
      : {},
}))
