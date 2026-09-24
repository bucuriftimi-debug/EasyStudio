import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { rendererConfig } from './renderer.config'

// Runs only the UI in a normal browser (no Electron) — handy for fast testing.
export default defineConfig({
  ...rendererConfig,
  plugins: [...(rendererConfig.plugins ?? []), react()]
})
