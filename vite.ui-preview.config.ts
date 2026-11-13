// Browser preview of the gallery UI with a mocked API: `npm run preview:ui`
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  define: { __CATALOG_ROOT__: JSON.stringify(__dirname) },
  server: { port: 5181, strictPort: true, fs: { allow: [__dirname] } },
  css: { postcss: resolve(__dirname, 'postcss.config.js') }
})
