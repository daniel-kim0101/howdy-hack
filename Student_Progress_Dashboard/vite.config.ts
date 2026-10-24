import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Tells Vite to listen to GitHub's internal proxy routers
    port: 8443
  }
})
