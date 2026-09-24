import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { rendererConfig } from './renderer.config'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    ...rendererConfig,
    plugins: [...(rendererConfig.plugins ?? []), react()]
  }
})
