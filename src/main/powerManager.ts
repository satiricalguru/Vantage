import { powerMonitor, screen } from 'electron'
import { setGlobalPlaybackState, setPerformanceModeForDisplay, getGlobalPlaybackState } from './wallpaperWindow'
import { getDisplayAssignment, setPerformanceMode } from './db'
import { refreshTrayMenu } from './tray'

let playbackBeforeLock: boolean | null = null
let playbackBeforeSuspend: boolean | null = null
// User-selected per-display modes preserved while the battery override is active
const savedModesBeforeBattery = new Map<number, string>()

export function initPowerManager(): void {
  powerMonitor.on('lock-screen', () => {
    console.log('[PowerManager] Screen locked. macOS owns the authenticated Lock Screen; pausing desktop wallpapers.')
    // An Electron wallpaper window cannot render through macOS's authenticated Lock Screen.
    // Pause while hidden and restore the user's exact state after unlock.
    playbackBeforeLock = getGlobalPlaybackState()
    setGlobalPlaybackState(false)
    refreshTrayMenu()
  })

  powerMonitor.on('unlock-screen', () => {
    console.log('[PowerManager] Screen unlocked. Restoring desktop wallpaper playback state.')
    // Restore the exact state the user had before locking; never force-play over a pause
    if (playbackBeforeLock !== null) {
      setGlobalPlaybackState(playbackBeforeLock)
      playbackBeforeLock = null
    }
    refreshTrayMenu()
  })

  powerMonitor.on('suspend', () => {
    console.log('[PowerManager] System suspending. Pausing wallpapers.')
    playbackBeforeSuspend = getGlobalPlaybackState()
    setGlobalPlaybackState(false)
  })

  powerMonitor.on('resume', () => {
    console.log('[PowerManager] System resumed. Restoring wallpaper playback state.')
    if (playbackBeforeSuspend !== null) {
      setGlobalPlaybackState(playbackBeforeSuspend)
      playbackBeforeSuspend = null
    }
  })

  powerMonitor.on('on-battery', () => {
    console.log('[PowerManager] Switched to battery power. Throttling performance.')
    for (const display of screen.getAllDisplays()) {
      const saved = getDisplayAssignment(String(display.id)).performanceMode
      if (saved !== 'battery-saver') {
        savedModesBeforeBattery.set(display.id, saved)
      }
      setPerformanceMode(String(display.id), 'battery-saver')
      setPerformanceModeForDisplay(display.id, 'battery-saver')
    }
    refreshTrayMenu()
  })

  powerMonitor.on('on-ac', () => {
    console.log('[PowerManager] Switched to AC power. Restoring per-display modes.')
    for (const display of screen.getAllDisplays()) {
      const restored = savedModesBeforeBattery.get(display.id) || getDisplayAssignment(String(display.id)).performanceMode
      savedModesBeforeBattery.delete(display.id)
      setPerformanceMode(String(display.id), restored)
      setPerformanceModeForDisplay(display.id, restored)
    }
    refreshTrayMenu()
  })
}