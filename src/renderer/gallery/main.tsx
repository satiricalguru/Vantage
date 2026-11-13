/// <reference types="vite/client" />
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import '../index.css'

async function boot(): Promise<void> {
  // Browser UI preview (npm run preview:ui) has no Electron preload — use the mock API.
  if (import.meta.env.DEV && !window.galleryApi && import.meta.env.MODE === 'ui-preview') {
    const { installDevMock } = await import('./devMock')
    await installDevMock()
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
boot()
