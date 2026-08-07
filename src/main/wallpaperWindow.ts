import { BrowserWindow, screen, Display } from 'electron'
import path from 'node:path'
import { getDisplayAssignment, getWallpaperById } from './db'

const wallpaperWindows = new Map<number, BrowserWindow>()
let isGlobalPlaying = true

export function wallpaperRendererUrlFor(displayId: number): string {
  if (process.env['ELECTRON_RENDERER_URL']) {
    return `${process.env['ELECTRON_RENDERER_URL']}/wallpaper.html?displayId=${displayId}`
  }
  return `file://${path.join(__dirname, '../renderer/wallpaper.html')}?displayId=${displayId}`
}

export function createWallpaperWindow(display: Display): BrowserWindow {
  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    type: 'desktop',
    frame: false,
    transparent: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    roundedCorners: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/wallpaper.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  })

  win.webContents.on('console-message', (event) => {
    const line = event.lineNumber ?? ''
    if (event.level === 'error' || event.level === 'warning') {
      console.log(`[WallpaperRenderer:${event.level}] ${event.message} (line ${line})`)
    }
  })

  win.setIgnoreMouseEvents(true, { forward: true })
  win.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true
  })

  win.loadURL(wallpaperRendererUrlFor(display.id))
  win.showInactive()

  wallpaperWindows.set(display.id, win)
  return win
}

let galleryWindowGetter: (() => BrowserWindow | null) | null = null

export function setGalleryWindowGetter(getter: () => BrowserWindow | null): void {
  galleryWindowGetter = getter
}

export function syncWallpaperWindows(): void {
  const displays = screen.getAllDisplays()
  const liveIds = new Set(displays.map((d) => d.id))

  for (const [id, win] of wallpaperWindows) {
    if (!liveIds.has(id)) {
      win.destroy()
      wallpaperWindows.delete(id)
    }
  }

  for (const display of displays) {
    if (!wallpaperWindows.has(display.id)) {
      createWallpaperWindow(display)
    } else {
      const win = wallpaperWindows.get(display.id)
      if (win) {
        win.setBounds({
          x: display.bounds.x,
          y: display.bounds.y,
          width: display.bounds.width,
          height: display.bounds.height
        })
      }
    }
  }

  const galleryWin = galleryWindowGetter ? galleryWindowGetter() : null
  if (galleryWin && !galleryWin.isDestroyed()) {
    const list = displays.map((d) => {
      const assignment = getDisplayAssignment(String(d.id))
      return {
        id: d.id,
        label: d.label || `Display ${d.id}`,
        bounds: d.bounds,
        scaleFactor: d.scaleFactor,
        assignedWallpaperId: assignment.wallpaperId,
        performanceMode: assignment.performanceMode
      }
    })
    galleryWin.webContents.send('display:changed', list)
  }
}

export function applyWallpaperToDisplay(displayId: number, wallpaperId: string): void {
  const wallpaper = getWallpaperById(wallpaperId)
  if (!wallpaper) return

  const win = wallpaperWindows.get(displayId)
  if (win) {
    win.webContents.send('wallpaper:changed', {
      wallpaper,
      displayId
    })
  }
}

export function setPerformanceModeForDisplay(displayId: number, mode: string): void {
  const win = wallpaperWindows.get(displayId)
  if (win && !win.isDestroyed()) {
    win.webContents.send('performance:mode-changed', mode)
  }
}

export function setGlobalPlaybackState(isPlaying: boolean): void {
  isGlobalPlaying = isPlaying
  for (const win of wallpaperWindows.values()) {
    if (!win.isDestroyed()) win.webContents.send('playback:state-changed', isPlaying)
  }
}

export function getGlobalPlaybackState(): boolean {
  return isGlobalPlaying
}

export function broadcastCacheProgress(progress: {
  url: string
  received: number
  total: number
  pct: number
}): void {
  for (const win of wallpaperWindows.values()) {
    if (win.isDestroyed()) continue
    win.webContents.send('cache:progress', progress)
  }
}

export function setLockScreenMode(isLocked: boolean): void {
  for (const win of wallpaperWindows.values()) {
    if (win.isDestroyed()) continue
    if (isLocked) {
      win.setAlwaysOnTop(true, 'screen-saver')
      win.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true
      })
      win.showInactive()
    } else {
      win.setAlwaysOnTop(false)
      win.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true
      })
      win.showInactive()
    }
  }
}

export function setupDisplayListeners(): void {
  screen.on('display-added', syncWallpaperWindows)
  screen.on('display-removed', syncWallpaperWindows)
  screen.on('display-metrics-changed', syncWallpaperWindows)
}
