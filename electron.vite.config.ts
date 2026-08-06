import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          wallpaper: resolve(__dirname, 'src/preload/wallpaper.ts'),
          gallery: resolve(__dirname, 'src/preload/gallery.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer')
      }
    },
    plugins: [
      react(),
      {
        // Tighten CSP for production builds: the bundled renderer needs no inline scripts
        name: 'strict-csp',
        apply: 'build',
        transformIndexHtml(html) {
          return html.replace("script-src 'self' 'unsafe-inline'", "script-src 'self'")
        }
      }
    ],
    build: {
      rollupOptions: {
        input: {
          gallery: resolve(__dirname, 'src/renderer/gallery.html'),
          wallpaper: resolve(__dirname, 'src/renderer/wallpaper.html')
        }
      }
    }
  }
})
