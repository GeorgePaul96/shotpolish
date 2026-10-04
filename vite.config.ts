import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    react(),
    visualizer({ open: false, filename: 'bundle-stats.html' })
  ],
  build: {
    rollupOptions: {
      // museum.html is the same app with Museum of You link-preview tags; the
      // host serves it for /museum* and /m/* (vercel.json, public/_redirects).
      input: { main: 'index.html', museum: 'museum.html' },
    },
  },
  test: {
    environment: 'node',
  },
})
