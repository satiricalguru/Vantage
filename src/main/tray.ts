import { Tray, Menu, app, nativeImage } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import {
  getGlobalPlaybackState,
  setGlobalPlaybackState,
  getGlobalPerformanceMode,
  setGlobalPerformanceMode
} from './wallpaperWindow'
import { freeUpMemory } from './memoryManager'
import store from './store'

let tray: Tray | null = null
let currentOnOpenGallery: (() => void) | null = null

export function updateTrayMenu(): void {
  if (!tray) return

  const isPlaying = getGlobalPlaybackState()
  const currentPerfMode = getGlobalPerformanceMode()

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Vantage Live Wallpapers',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Open Gallery && Controls',
      click: () => {
        if (currentOnOpenGallery) currentOnOpenGallery()
      }
    },
    {
      label: isPlaying ? 'Pause All Wallpapers' : 'Resume All Wallpapers',
      click: () => {
        setGlobalPlaybackState(!isPlaying)
        updateTrayMenu()
      }
    },
    { type: 'separator' },
    {
      label: '⚡ Free Up Memory',
      click: async () => {
        await freeUpMemory()
        updateTrayMenu()
      }
    },
    {
      label: 'Performance Mode',
      submenu: [
        {
          label: 'High Quality (60 FPS)',
          type: 'radio',
          checked: currentPerfMode === 'quality',
          click: () => {
            setGlobalPerformanceMode('quality')
            updateTrayMenu()
          }
        },
        {
          label: 'Balanced (30 FPS)',
          type: 'radio',
          checked: currentPerfMode === 'balanced',
          click: () => {
            setGlobalPerformanceMode('balanced')
            updateTrayMenu()
          }
        },
        {
          label: 'Battery Saver (15 FPS)',
          type: 'radio',
          checked: currentPerfMode === 'battery-saver',
          click: () => {
            setGlobalPerformanceMode('battery-saver')
            updateTrayMenu()
          }
        }
      ]
    },
    { type: 'separator' },
    {
      label: 'Launch at Login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({ openAtLogin: menuItem.checked })
        try {
          store.set('openAtLogin', menuItem.checked)
        } catch {
          // store write is best-effort; OS login item is authoritative
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Vantage',
      click: () => {
        app.quit()
      }
    }
  ])
  tray.setContextMenu(contextMenu)
}

export function refreshTrayMenu(): void {
  updateTrayMenu()
}

export function createTray(onOpenGallery: () => void): Tray {
  if (tray) return tray
  currentOnOpenGallery = onOpenGallery

  // Resolve icon path safely for both dev mode and packaged app
  let iconPath = path.join(__dirname, '../../resources/icons/trayTemplate.png')
  if (!fs.existsSync(iconPath)) {
    iconPath = path.join(app.getAppPath(), 'resources/icons/trayTemplate.png')
  }

  let icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) {
    console.warn('[Tray] Icon empty at path:', iconPath)
  }
  icon.setTemplateImage(true)

  tray = new Tray(icon)
  tray.setToolTip('Vantage — Live Wallpaper Manager')

  tray.on('click', () => {
    onOpenGallery()
  })

  tray.on('double-click', () => {
    onOpenGallery()
  })

  updateTrayMenu()
  return tray
}