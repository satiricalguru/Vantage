import { app, BrowserWindow, ipcMain, dialog, screen, shell, protocol, net } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { initDatabase, getAllWallpapers, getWallpaperById, setDisplayAssignment, getDisplayAssignment, setPerformanceMode, toggleFavoriteInDb, addWallpaperToDb } from './db'
import { syncWallpaperWindows, applyWallpaperToDisplay, setPerformanceModeForDisplay, setupDisplayListeners, getGlobalPlaybackState, setGalleryWindowGetter } from './wallpaperWindow'
import { createTray } from './tray'
import { initPowerManager } from './powerManager'
import { clearCache, getCacheUsedBytes } from './cache'
import Store from 'electron-store'

// Register media:// custom protocol for local video & asset streaming
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      secure: true,
      supportFetchAPI: true,
      standard: true,
      bypassCSP: true,
      stream: true
    }
  }
])

const store = new Store()
let galleryWindow: BrowserWindow | null = null
let isQuitting = false

function getVantageWallpapersFolder(): string {
  const picturesDir = app.getPath('pictures')
  const targetDir = path.join(picturesDir, 'Vantage Wallpapers')
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }
  return targetDir
}

function scanVantageWallpapersFolder(): number {
  const targetDir = getVantageWallpapersFolder()
  let addedCount = 0
  try {
    const files = fs.readdirSync(targetDir)
    for (const file of files) {
      if (file.startsWith('.')) continue
      const ext = path.extname(file).toLowerCase()
      if (['.mp4', '.mov', '.webm', '.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
        const filePath = path.join(targetDir, file)
        const isVideo = ['.mp4', '.mov', '.webm'].includes(ext)
        const id = `user-folder-${file.replace(/[^a-zA-Z0-9_-]/g, '_')}`
        const newItem = {
          id,
          title: file.replace(/\.[^/.]+$/, ''),
          category: 'imported' as const,
          type: (isVideo ? 'video' : 'user-import') as any,
          previewUrl: `media://${filePath}`,
          sourceUrl: `media://${filePath}`,
          resolution: { width: 3840, height: 2160 },
          source: 'user' as const,
          license: 'Local Folder Import',
          attribution: 'Local File'
        }
        addWallpaperToDb(newItem)
        addedCount++
      }
    }
  } catch (err) {
    console.error('[FolderScanner] Error scanning Vantage Wallpapers folder:', err)
  }
  return addedCount
}

// Single instance lock to catch app relaunch attempts
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (galleryWindow) {
      if (galleryWindow.isMinimized()) galleryWindow.restore()
      galleryWindow.show()
      galleryWindow.focus()
    } else {
      createGalleryWindow()
    }
  })
}

function createGalleryWindow(): BrowserWindow {
  if (galleryWindow && !galleryWindow.isDestroyed()) {
    if (galleryWindow.isMinimized()) galleryWindow.restore()
    galleryWindow.show()
    galleryWindow.focus()
    return galleryWindow
  }

  galleryWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 840,
    minHeight: 580,
    title: 'Vantage',
    show: false,
    frame: false,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: '#0A0B0D',
    webPreferences: {
      preload: path.join(__dirname, '../preload/gallery.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    galleryWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/gallery.html`)
  } else {
    galleryWindow.loadFile(path.join(__dirname, '../renderer/gallery.html'))
  }

  galleryWindow.once('ready-to-show', () => {
    galleryWindow?.show()
    galleryWindow?.focus()
  })

  galleryWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      galleryWindow?.hide()
    }
  })

  galleryWindow.on('closed', () => {
    galleryWindow = null
  })

  return galleryWindow
}

function registerIpcHandlers(): void {
  ipcMain.handle('wallpaper:list', (_event, { category, query }) => {
    return getAllWallpapers(category, query)
  })

  ipcMain.handle('wallpaper:apply-to-display', (_event, { displayId, wallpaperId }) => {
    setDisplayAssignment(String(displayId), wallpaperId)
    applyWallpaperToDisplay(displayId, wallpaperId)
    return true
  })

  ipcMain.handle('wallpaper:favorite', (_event, { wallpaperId, isFavorite }) => {
    toggleFavoriteInDb(wallpaperId, isFavorite)
    return true
  })

  ipcMain.handle('display:list', () => {
    return screen.getAllDisplays().map((d) => {
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
  })

  ipcMain.handle('settings:get', () => {
    return {
      openAtLogin: app.getLoginItemSettings().openAtLogin,
      showInDock: store.get('showInDock', false),
      pexelsApiKey: store.get('pexelsApiKey', ''),
      unsplashApiKey: store.get('unsplashApiKey', ''),
      maxCacheSizeGb: store.get('maxCacheSizeGb', 5),
      theme: store.get('theme', 'dark')
    }
  })

  ipcMain.handle('settings:set', (_event, partial) => {
    for (const [key, val] of Object.entries(partial)) {
      store.set(key, val)
    }

    if ('showInDock' in partial) {
      if (partial.showInDock && app.dock) {
        app.dock.show()
      } else if (app.dock) {
        app.dock.hide()
      }
    }
    return true
  })

  ipcMain.handle('performance:set-mode', (_event, { displayId, mode }) => {
    setPerformanceMode(String(displayId), mode)
    setPerformanceModeForDisplay(displayId, mode)
    return true
  })

  ipcMain.handle('import:file', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import Wallpaper Video or Image',
      properties: ['openFile'],
      filters: [
        { name: 'Media Files', extensions: ['mp4', 'mov', 'webm', 'png', 'jpg', 'jpeg', 'webp'] }
      ]
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const filePath = result.filePaths[0]
    const filename = path.basename(filePath)
    const isVideo = /\.(mp4|mov|webm)$/i.test(filename)

    const newItem = {
      id: `imported-${Date.now()}`,
      title: filename.replace(/\.[^/.]+$/, ''),
      category: 'imported' as const,
      type: (isVideo ? 'video' : 'user-import') as any,
      previewUrl: `media://${filePath}`,
      sourceUrl: `media://${filePath}`,
      resolution: { width: 3840, height: 2160 },
      source: 'user' as const,
      license: 'User Imported File',
      attribution: 'Local File'
    }

    addWallpaperToDb(newItem)
    return newItem
  })

  ipcMain.handle('cache:clear', () => {
    return clearCache()
  })

  ipcMain.handle('cache:status', () => {
    const limitGb = (store.get('maxCacheSizeGb', 5) as number)
    return {
      usedBytes: getCacheUsedBytes(),
      limitBytes: limitGb * 1024 * 1024 * 1024
    }
  })

  ipcMain.handle('settings:set-login-at-login', (_event, openAtLogin: boolean) => {
    app.setLoginItemSettings({ openAtLogin })
    return true
  })

  ipcMain.handle('wallpaper:open-folder', () => {
    const folderPath = getVantageWallpapersFolder()
    shell.openPath(folderPath)
    return folderPath
  })

  ipcMain.handle('wallpaper:scan-local-folder', () => {
    return scanVantageWallpapersFolder()
  })

  ipcMain.handle('shell:open-external', (_event, url: string) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
  })

  ipcMain.handle('wallpaper:get-initial-state', (event) => {
    const webContents = event.sender
    const win = BrowserWindow.fromWebContents(webContents)
    if (!win) return { wallpaper: null, performanceMode: 'balanced', isPlaying: true }

    const displays = screen.getAllDisplays()
    const matchingDisplay = displays.find(
      (d) =>
        d.bounds.x === win.getBounds().x &&
        d.bounds.y === win.getBounds().y
    ) || displays[0]

    const assignment = getDisplayAssignment(String(matchingDisplay.id))
    const wallpaper = assignment.wallpaperId ? getWallpaperById(assignment.wallpaperId) : getWallpaperById('local-v8')

    return {
      wallpaper,
      performanceMode: assignment.performanceMode,
      isPlaying: getGlobalPlaybackState()
    }
  })
}

// App lifecycle
app.on('before-quit', () => {
  isQuitting = true
})

app.whenReady().then(() => {
  setGalleryWindowGetter(() => galleryWindow)

  // Protocol handler for local file media streaming with full Range headers support
  protocol.handle('media', (request) => {
    try {
      const rawPath = request.url.replace(/^media:\/+/i, '/')
      const filePath = decodeURIComponent(rawPath)

      if (!fs.existsSync(filePath)) {
        console.warn('[MediaProtocol] File not found:', filePath)
        return new Response('File Not Found', { status: 404 })
      }

      const stat = fs.statSync(filePath)
      const fileSize = stat.size
      const ext = path.extname(filePath).toLowerCase()
      const mimeTypes: Record<string, string> = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp'
      }
      const contentType = mimeTypes[ext] || 'application/octet-stream'
      const rangeHeader = request.headers.get('range')

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1

        if (start >= fileSize || end >= fileSize) {
          return new Response('Requested Range Not Satisfiable', {
            status: 416,
            headers: { 'Content-Range': `bytes */${fileSize}` }
          })
        }

        const chunkSize = end - start + 1
        const nodeStream = fs.createReadStream(filePath, { start, end })
        const webStream = Readable.toWeb(nodeStream)

        return new Response(webStream as any, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunkSize),
            'Content-Type': contentType
          }
        })
      }

      const nodeStream = fs.createReadStream(filePath)
      const webStream = Readable.toWeb(nodeStream)

      return new Response(webStream as any, {
        status: 200,
        headers: {
          'Content-Length': String(fileSize),
          'Accept-Ranges': 'bytes',
          'Content-Type': contentType
        }
      })
    } catch (err) {
      console.error('[MediaProtocol] Error serving file:', request.url, err)
      return new Response('Internal Server Error', { status: 500 })
    }
  })

  const showInDock = store.get('showInDock', false)
  if (app.dock && !showInDock) {
    app.dock.hide()
  }

  initDatabase()
  scanVantageWallpapersFolder()
  setupDisplayListeners()
  syncWallpaperWindows()
  initPowerManager()
  registerIpcHandlers()

  createTray(() => {
    createGalleryWindow()
  })

  createGalleryWindow()
})

app.on('activate', () => {
  createGalleryWindow()
})

app.on('window-all-closed', () => {
  // Keep live wallpaper service running in menu bar
})