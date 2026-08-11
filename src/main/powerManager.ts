import { powerMonitor, screen } from 'electron'
import { setGlobalPlaybackState, setPerformanceModeForDisplay, getGlobalPlaybackState } from './wallpaperWindow'
import { getDisplayAssignment, setPerformanceMode } from './db'
import { refreshTrayMenu } from './tray'

type SystemPauseReason = 'lock' | 'suspend'

// Lock and suspend events can overlap. Snapshot playback only when the first
// system-owned pause starts, then restore it only after the final reason clears.
const systemPauseReasons = new Set<SystemPauseReason>()
let playbackBeforeSystemPause: boolean | null = null
// User-selected per-display modes preserved while the battery override is active
const savedModesBeforeBattery = new Map<number, string>()

function addSystemPause(reason: SystemPauseReason): void {
  if (systemPauseReasons.has(reason)) return
  if (systemPauseReasons.size === 0) {
    playbackBeforeSystemPause = getGlobalPlaybackState()
  }
  systemPauseReasons.add(reason)
  setGlobalPlaybackState(false)
}

function removeSystemPause(reason: SystemPauseReason): void {
  if (!systemPauseReasons.delete(reason) || systemPauseReasons.size > 0) return
  if (playbackBeforeSystemPause !== null) {
    setGlobalPlaybackState(playbackBeforeSystemPause)
    playbackBeforeSystemPause = null
  }
}

export function initPowerManager(): void {
  powerMonitor.on('lock-screen', () => {
    console.log('[PowerManager] Screen locked. macOS owns the authenticated Lock Screen; pausing desktop wallpapers.')
    // An Electron wallpaper window cannot render through macOS's authenticated Lock Screen.
    addSystemPause('lock')
    refreshTrayMenu()
  })

  powerMonitor.on('unlock-screen', () => {
    console.log('[PowerManager] Screen unlocked. Restoring desktop wallpaper playback state when system pauses have ended.')
    removeSystemPause('lock')
    refreshTrayMenu()
  })

  powerMonitor.on('suspend', () => {
    console.log('[PowerManager] System suspending. Pausing wallpapers.')
    addSystemPause('suspend')
    refreshTrayMenu()
  })

  powerMonitor.on('resume', () => {
    console.log('[PowerManager] System resumed. Restoring wallpaper playback state when system pauses have ended.')
    removeSystemPause('suspend')
    refreshTrayMenu()
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