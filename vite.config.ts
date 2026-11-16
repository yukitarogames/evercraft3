import { defineConfig } from 'vite'
import { readFileSync } from 'fs'

const version = JSON.parse(readFileSync('package.json', 'utf-8')).version

// Relative base so the same build works on GitHub Pages and itch.io.
export default defineConfig({
  base: './',
  server: { port: 3000 },
  define: { __APP_VERSION__: JSON.stringify(version) },
})
