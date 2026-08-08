import Store from 'electron-store'

/** Single shared electron-store instance for the main process */
const store = new Store({
  schema: {
    showInDock: { type: 'boolean', default: false },
    openAtLogin: { type: 'boolean', default: true },
    maxCacheSizeGb: { type: 'number', minimum: 1, maximum: 100, default: 5 },
    theme: { type: 'string', enum: ['dark', 'light', 'system'], default: 'dark' },
    pexelsApiKey: { type: 'string', default: '' },
    unsplashApiKey: { type: 'string', default: '' }
  }
})
export default store
