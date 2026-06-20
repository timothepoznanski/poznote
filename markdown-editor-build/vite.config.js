import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: '../src/js/codemirror-dist',
    emptyOutDir: true,
    lib: {
      entry: 'src/main.js',
      name: 'PoznoteMarkdownCodeMirror',
      fileName: 'markdown-codemirror',
      formats: ['iife']
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {}
      }
    }
  }
})
