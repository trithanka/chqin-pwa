import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 5174 so the guest PWA (5173) and the dashboard can run side by side.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5174, host: true },
})
