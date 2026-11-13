import Store from 'electron-store'

/** Single shared electron-store instance for the main process */
const store = new Store({
  schema: {
    showInDock: { type: 'boolean', default: true },
    openAtLogin: { type: 'boolean', default: true },
    maxCacheSizeGb: { type: 'number', minimum: 1, maximum: 100, default: 5 },
    theme: { type: 'string', enum: ['dark', 'light', 'system'], default: 'dark' },
    // One-time migration marker: older builds persisted showInDock=false as the default.
    dockDefaultMigrated: { type: 'boolean', default: false }
  }
})

if (!store.get('dockDefaultMigrated')) {
  store.set('showInDock', true)
  store.set('dockDefaultMigrated', true)
}

export default store
