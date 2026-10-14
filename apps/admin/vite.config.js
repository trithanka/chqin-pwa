import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 5175: next to the guest app (5173) and the venue dashboard (5174), and the
// one origin the API's /admin routes answer in development.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5175, strictPort: true },
})
