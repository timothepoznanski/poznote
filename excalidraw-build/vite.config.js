import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../src/js/excalidraw-dist',
    lib: {
      entry: 'src/main.jsx',
      name: 'PoznoteExcalidraw',
      fileName: 'excalidraw-bundle',
      formats: ['iife']
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {}
      }
    }
  },
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env': '{}',
    'global': 'globalThis',
    'process': '{env: {NODE_ENV: "production"}}'
  }
})