import { powerMonitor, screen } from 'electron'
import { setGlobalPlaybackState, setPerformanceModeForDisplay, setLockScreenMode, getGlobalPlaybackState } from './wallpaperWindow'
import { getDisplayAssignment } from './db'
import { refreshTrayMenu } from './tray'
import store from './store'

let playbackBeforeLock: boolean | null = null

export function initPowerManager(): void {
  powerMonitor.on('lock-screen', () => {
    const showOnLockScreen = store.get('showOnLockScreen', true)
    console.log(`[PowerManager] Screen locked. showOnLockScreen: ${showOnLockScreen}`)
    // Remember the user's playback state so we can restore it exactly on unlock
    playbackBeforeLock = getGlobalPlaybackState()
    if (showOnLockScreen) {
      setLockScreenMode(true)
    } else {
      setLockScreenMode(false)
      setGlobalPlaybackState(false)
    }
    refreshTrayMenu()
  })

  powerMonitor.on('unlock-screen', () => {
    console.log('[PowerManager] Screen unlocked. Restoring normal desktop wallpaper mode.')
    setLockScreenMode(false)
    // Restore the exact state the user had before locking; never force-play over a pause
    if (playbackBeforeLock !== null) {
      setGlobalPlaybackState(playbackBeforeLock)
      playbackBeforeLock = null
    }
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