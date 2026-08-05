import { powerMonitor, screen } from 'electron'
import { setGlobalPlaybackState, setPerformanceModeForDisplay } from './wallpaperWindow'
import { getDisplayAssignment } from './db'
import { refreshTrayMenu } from './tray'

export function initPowerManager(): void {
  powerMonitor.on('lock-screen', () => {
    console.log('[PowerManager] Screen locked. Pausing wallpapers.')
    setGlobalPlaybackState(false)
    refreshTrayMenu()
  })

  powerMonitor.on('unlock-screen', () => {
    console.log('[PowerManager] Screen unlocked. Resuming wallpapers.')
    setGlobalPlaybackState(true)
    refreshTrayMenu()
  })

  powerMonitor.on('suspend', () => {
    console.log('[PowerManager] System suspending. Pausing wallpapers.')
    setGlobalPlaybackState(false)
  })

  powerMonitor.on('resume', () => {
    console.log('[PowerManager] System resumed. Resuming wallpapers.')
    setGlobalPlaybackState(true)
  })

  powerMonitor.on('on-battery', () => {
    console.log('[PowerManager] Switched to battery power. Throttling performance.')
    for (const display of screen.getAllDisplays()) {
      setPerformanceModeForDisplay(display.id, 'battery-saver')
    }
  })

  powerMonitor.on('on-ac', () => {
    console.log('[PowerManager] Switched to AC power. Restoring per-display modes.')
    for (const display of screen.getAllDisplays()) {
      const saved = getDisplayAssignment(String(display.id)).performanceMode
      setPerformanceModeForDisplay(display.id, saved)
    }
  })
}