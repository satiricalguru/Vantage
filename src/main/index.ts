import { app, BrowserWindow, ipcMain, dialog, screen, shell, protocol } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import { initDatabase, getAllWallpapers, getWallpaperById, setDisplayAssignment, getDisplayAssignment, setPerformanceMode, toggleFavoriteInDb, deleteWallpaperFromDb, addWallpaperToDb, pruneUserFolderEntries, closeDatabase, getWallpaperFileReferences } from './db'
import { syncWallpaperWindows, applyWallpaperToDisplay, setPerformanceModeForDisplay, setupDisplayListeners, getGlobalPlaybackState, setGalleryWindowGetter, broadcastCacheProgress, isWallpaperRenderer } from './wallpaperWindow'
import { createTray } from './tray'
import { initPowerManager } from './powerManager'
import { ensureCached, getCacheStatus, clearCache, evictToLimit, setCacheLimitBytes, getCacheDir, isAllowedRemoteMediaUrl, onCacheProgress, getCacheLimitBytes, CACHE_FLOOR_BYTES, CACHE_CEILING_BYTES } from './videoCache'
import { syncStaticWallpapers, getStaticSourceDirs } from './staticLibrary'
import store from './store'
import { INITIAL_WALLPAPERS } from './contentSources'
import { ALLOWED_SETTINGS_KEYS, DEFAULT_WALLPAPER_ID } from '../shared/types'
import { toMediaUrl } from './mediaUrl'
import { installVantageScreenSaver, setupVantageScreenSaver, syncSelectedScreenSaverVideo } from './screenSaver'

import { generateVideoThumbnail, pruneOrphanThumbnails } from './thumbnailGenerator'
import { getMediaDimensions } from './mediaInfo'
import { freeUpMemory } from './memoryManager'
import { hardenWindowNavigation } from './windowSecurity'

// Global safety nets — log diagnostics for truly unexpected failures so they
// never disappear silently into the void.
process.on('uncaughtException', (err, origin) => {
  console.error(`[Fatal] Uncaught exception (${origin}):`, err)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Fatal] Unhandled promise rejection:', reason, promise)
})

// Register media:// custom protocol for local video & asset streaming
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      secure: true,
      supportFetchAPI: true,
      standard: true,
      stream: true
    }
  }
])

// store is now imported from ./store (single shared instance)
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

// Stored watcher handles — closed before re-watching to prevent leaks
let folderWatcher: fs.FSWatcher | null = null
const staticWatchers: fs.FSWatcher[] = []

function watchVantageWallpapersFolder(): void {
  // Close previous watcher if called again (re-watch guard)
  if (folderWatcher) {
    folderWatcher.close()
    folderWatcher = null
  }
  const targetDir = getVantageWallpapersFolder()
  try {
    folderWatcher = fs.watch(targetDir, (_eventType, filename) => {
      if (!filename) return
      if (scanTimer) clearTimeout(scanTimer)
      scanTimer = setTimeout(() => {
        void enqueueScan().then(() => notifyCatalogChanged())
      }, 500)
    })
    console.log('[FolderScanner] Watching:', targetDir)
  } catch (err) {
    console.error('[FolderScanner] Failed to watch folder:', err)
  }
}

function watchStaticLibrary(): void {
  // Close previous watchers if called again (re-watch guard)
  for (const w of staticWatchers) w.close()
  staticWatchers.length = 0

  const staticDirs = getStaticSourceDirs()
  for (const dir of staticDirs) {
    try {
      const watcher = fs.watch(dir, (_eventType, filename) => {
        if (!filename) return
        if (staticTimer) clearTimeout(staticTimer)
        staticTimer = setTimeout(() => {
          void enqueueStaticSync().then(() => notifyCatalogChanged())
        }, 3000)
      })
      staticWatchers.push(watcher)
      console.log('[StaticLibrary] Watching:', dir)
    } catch (err) {
      console.error('[StaticLibrary] Failed to watch folder:', dir, err)
    }
  }
}

async function scanVantageWallpapersFolder(): Promise<number> {
  const targetDir = getVantageWallpapersFolder()
  let addedCount = 0
  const presentIds: string[] = []
  // Stable IDs preserve selections across scans while a short digest prevents
  // distinct names that sanitize identically from overwriting the same row.
  try {
    const files = await fs.promises.readdir(targetDir)
    interface ScanTask {
      file: string
      id: string
      filePath: string
      isVideo: boolean
    }
    const tasks: ScanTask[] = []
    for (const file of files) {
      if (file.startsWith('.')) continue
      const ext = path.extname(file).toLowerCase()
      if (['.mp4', '.mov', '.webm', '.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
        // Skip scanning files that belong to the built-in catalog (e.g. V8.mp4, V233.mp4, V295.mp4)
        const isCatalogFile = INITIAL_WALLPAPERS.some(
          (item) => item.sourceUrl && item.sourceUrl.toLowerCase() === `extracted/${file.toLowerCase()}`
        )
        if (isCatalogFile) continue

        const filePath = path.join(targetDir, file)
        let stat: fs.Stats
        try {
          stat = await fs.promises.stat(filePath)
        } catch {
          continue
        }
        if (!stat.isFile()) continue
        const isVideo = ['.mp4', '.mov', '.webm'].includes(ext)
        const id = userFolderId(file, filePath)
        presentIds.push(id)
        tasks.push({ file, id, filePath, isVideo })
      }
    }

    // Thumbnail generation (qlmanage) and dimension probing (mdls) spawn helper
    // processes; cap concurrency so a large folder does not spawn 50 at once.
    const CONCURRENCY = 3
    let cursor = 0
    const workers = Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, async () => {
      while (cursor < tasks.length) {
        const { file, id, filePath, isVideo } = tasks[cursor++]

        let previewPath = filePath
        if (isVideo) {
          const thumbPath = await generateVideoThumbnail(filePath)
          if (thumbPath) {
            previewPath = thumbPath
          }
        }

        const newItem = {
          id,
          title: file.replace(/\.[^/.]+$/, ''),
          category: isVideo ? ('imported' as const) : ('static' as const),
          type: isVideo ? ('video' as const) : ('image' as const),
          previewUrl: toMediaUrl(previewPath),
          sourceUrl: toMediaUrl(filePath),
          resolution: await getMediaDimensions(filePath),
          source: isVideo ? ('user' as const) : ('static' as const),
          license: 'Local Folder Import',
          attribution: 'Local File'
        }
        addWallpaperToDb(newItem)
        addedCount++
      }
    })
    await Promise.all(workers)

    // Purge DB entries for files that no longer exist in the folder
    pruneUserFolderEntries(presentIds)

    // Garbage-collect generated thumbnails no longer referenced by any DB row
    pruneOrphanThumbnails(getWallpaperFileReferences())
  } catch (err) {
    console.error('[FolderScanner] Error scanning Vantage Wallpapers folder:', err)
  }
  return addedCount
}

let scanTimer: ReturnType<typeof setTimeout> | null = null
let staticTimer: ReturnType<typeof setTimeout> | null = null

// Serialize folder scans so overlapping watcher/startup/manual scans can never
// interleave (two concurrent scans previously raced on the prune step and tore
// DB rows out from under each other).
let scanQueue: Promise<number> = Promise.resolve(0)
let staticSyncQueue: Promise<number> = Promise.resolve(0)

function enqueueScan(): Promise<number> {
  const run = scanQueue.then(() => {
    if (isQuitting) return 0
    return scanVantageWallpapersFolder()
  }).catch((err) => {
    console.error('[FolderScanner] Scan failed:', err)
    return 0
  })
  scanQueue = run.then(
    () => 0,
    () => 0
  )
  return run
}

function enqueueStaticSync(): Promise<number> {
  const run = staticSyncQueue.then(() => {
    if (isQuitting) return 0
    return syncStaticWallpapers()
  }).catch((err) => {
    console.error('[StaticLibrary] Sync failed:', err)
    return 0
  })
  staticSyncQueue = run.then(
    () => 0,
    () => 0
  )
  return run
}

function notifyCatalogChanged(): void {
  if (galleryWindow && !galleryWindow.isDestroyed()) {
    galleryWindow.webContents.send('catalog:changed')
  }
}

function forwardRendererLogs(win: BrowserWindow): void {
  win.webContents.on('console-message', (event) => {
    const line = event.lineNumber ?? ''
    if (event.level === 'error' || event.level === 'warning') {
      console.log(`[Renderer:${event.level}] ${event.message} (line ${line})`)
    }
  })
}

const VALID_PERFORMANCE_MODES = new Set(['quality', 'balanced', 'battery-saver'])
const VALID_IMPORT_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.png', '.jpg', '.jpeg', '.webp'])

function userFolderId(fileName: string, filePath: string): string {
  const legacyId = `user-folder-${fileName.replace(/[^a-zA-Z0-9_-]/g, '_')}`
  const mediaUrl = toMediaUrl(filePath)
  const suffix = crypto.createHash('sha256').update(fileName).digest('hex').slice(0, 12)
  const disambiguatedId = `${legacyId}-${suffix}`

  // Preserve existing legacy IDs whenever they already identify this file, but
  // never let two distinct filenames that sanitize alike overwrite each other.
  const disambiguated = getWallpaperById(disambiguatedId)
  if (disambiguated?.sourceUrl === mediaUrl) return disambiguatedId
  const legacy = getWallpaperById(legacyId)
  return !legacy || legacy.sourceUrl === mediaUrl ? legacyId : disambiguatedId
}

function isTrustedIpcSender(event: Electron.IpcMainInvokeEvent): boolean {
  const win = BrowserWindow.fromWebContents(event.sender)
  return Boolean(win && !win.isDestroyed() && (win === galleryWindow || isWallpaperRenderer(event.sender)))
}

function requireTrustedIpcSender(event: Electron.IpcMainInvokeEvent): void {
  if (!isTrustedIpcSender(event)) {
    throw new Error('IPC request rejected from an untrusted renderer')
  }
}

function isKnownDisplay(displayId: unknown): displayId is number {
  return (
    typeof displayId === 'number' &&
    Number.isSafeInteger(displayId) &&
    screen.getAllDisplays().some((display) => display.id === displayId)
  )
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

function getAppIconPath(): string | undefined {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icons', 'icon.png')
    : path.join(app.getAppPath(), 'resources', 'icons', 'icon.png')
  return fs.existsSync(iconPath) ? iconPath : undefined
}

function setupDockIcon(): void {
  const iconPath = getAppIconPath()
  if (iconPath && process.platform === 'darwin' && app.dock) {
    try {
      app.dock.setIcon(iconPath)
    } catch (err) {
      console.warn('[AppIcon] Could not set dock icon:', err)
    }
  }
}

function createGalleryWindow(): BrowserWindow {
  if (galleryWindow && !galleryWindow.isDestroyed()) {
    if (galleryWindow.isMinimized()) galleryWindow.restore()
    galleryWindow.show()
    galleryWindow.focus()
    return galleryWindow
  }

  const iconPath = getAppIconPath()
  galleryWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 840,
    minHeight: 580,
    title: 'Vantage',
    icon: iconPath,
    show: false,
    frame: false,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: '#0A0B0D',
    webPreferences: {
      preload: path.join(__dirname, '../preload/gallery.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  forwardRendererLogs(galleryWindow)

  hardenWindowNavigation(
    galleryWindow,
    process.env['ELECTRON_RENDERER_URL']
      ? `${process.env['ELECTRON_RENDERER_URL']}/gallery.html`
      : `file://${path.join(__dirname, '../renderer/gallery.html')}`
  )

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
  ipcMain.handle('wallpaper:list', async (event, payload) => {
    requireTrustedIpcSender(event)
    const { category, query } = payload && typeof payload === 'object' ? payload : {}
    if (category !== undefined && typeof category !== 'string') throw new Error('Invalid wallpaper category')
    if (query !== undefined && typeof query !== 'string') throw new Error('Invalid wallpaper query')
    if (typeof query === 'string' && query.length > 200) throw new Error('Wallpaper query is too long')
    return getAllWallpapers(category, query)
  })

  ipcMain.handle('wallpaper:apply-to-display', (event, payload) => {
    requireTrustedIpcSender(event)
    const { displayId, wallpaperId } = payload && typeof payload === 'object' ? payload : {}
    if (!isKnownDisplay(displayId) || typeof wallpaperId !== 'string') {
      throw new Error('Invalid display or wallpaper ID')
    }
    if (!getWallpaperById(wallpaperId)) throw new Error('Wallpaper does not exist')
    setDisplayAssignment(String(displayId), wallpaperId)
    applyWallpaperToDisplay(displayId, wallpaperId)
    syncSelectedScreenSaverVideo()
    return true
  })

  ipcMain.handle('wallpaper:favorite', (event, payload) => {
    requireTrustedIpcSender(event)
    const { wallpaperId, isFavorite } = payload && typeof payload === 'object' ? payload : {}
    if (typeof wallpaperId !== 'string' || typeof isFavorite !== 'boolean') {
      throw new Error('Invalid favorite request')
    }
    if (!getWallpaperById(wallpaperId)) throw new Error('Wallpaper does not exist')
    toggleFavoriteInDb(wallpaperId, isFavorite)
    return true
  })

  ipcMain.handle('wallpaper:delete', (event, payload) => {
    requireTrustedIpcSender(event)
    const { wallpaperId } = payload && typeof payload === 'object' ? payload : {}
    if (typeof wallpaperId !== 'string') {
      throw new Error('Invalid delete request')
    }
    const item = getWallpaperById(wallpaperId)
    if (!item) throw new Error('Wallpaper does not exist')

    // Never allow built-in catalog wallpapers to be physically deleted.
    const BUILTIN_SOURCES = new Set(['ai', 'custom', 'local'])
    if (BUILTIN_SOURCES.has(item.source)) {
      throw new Error('Cannot delete built-in wallpaper')
    }

    // Delete DB record & reset assignments if needed
    deleteWallpaperFromDb(wallpaperId)

    // Only delete physical files that live inside the managed folder or the
    // generated-thumbnails directory — never files the DB row merely points at
    // elsewhere (e.g. bundled app media or files from the static library).
    const deleteZoneBases = [
      getVantageWallpapersFolder(),
      path.join(app.getPath('userData'), 'thumbnails')
    ]
    const isPathInDeleteZone = (localPath: string): boolean => {
      try {
        const canonicalFile = fs.realpathSync(localPath)
        return deleteZoneBases.some((base) => {
          try {
            const canonicalBase = fs.realpathSync(base)
            const relative = path.relative(canonicalBase, canonicalFile)
            return (
              relative === '' ||
              (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
            )
          } catch {
            return false
          }
        })
      } catch {
        return false
      }
    }

    // Helper to safely delete local physical files if present
    const safelyDeleteFile = (urlOrPath: string) => {
      try {
        let localPath = urlOrPath
        if (localPath.startsWith('file://')) {
          localPath = fileURLToPath(localPath)
        } else if (localPath.startsWith('media://')) {
          localPath = decodeURIComponent(localPath.replace('media://', ''))
        }
        if (!fs.existsSync(localPath)) return
        if (!isPathInDeleteZone(localPath)) {
          console.warn('[DB] Refusing to delete file outside managed zone:', localPath)
          return
        }
        fs.unlinkSync(localPath)
      } catch (err) {
        console.warn('[DB] Could not delete physical file:', urlOrPath, err)
      }
    }

    if (item.sourceUrl) safelyDeleteFile(item.sourceUrl)
    if (item.previewUrl && item.previewUrl !== item.sourceUrl) safelyDeleteFile(item.previewUrl)

    // Garbage-collect generated thumbnails that no DB row references anymore
    // (this row was deleted above, so its preview URL is now unreferenced)
    pruneOrphanThumbnails(getWallpaperFileReferences())

    notifyCatalogChanged()
    return true
  })

  ipcMain.handle('display:list', (event) => {
    requireTrustedIpcSender(event)
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

  ipcMain.handle('settings:get', (event) => {
    requireTrustedIpcSender(event)
    return {
      openAtLogin: app.getLoginItemSettings().openAtLogin,
      showInDock: store.get('showInDock', false),
      maxCacheSizeGb: store.get('maxCacheSizeGb', 5),
      theme: store.get('theme', 'dark')
    }
  })


  ipcMain.handle('settings:set', (event, partial: Record<string, unknown>) => {
    requireTrustedIpcSender(event)
    if (!partial || typeof partial !== 'object' || Array.isArray(partial)) {
      throw new Error('Invalid settings payload')
    }

    const validated: Record<string, unknown> = {}
    // Only allow whitelisted settings keys to be written
    for (const [key, val] of Object.entries(partial)) {
      if (!ALLOWED_SETTINGS_KEYS.has(key)) {
        throw new Error(`Setting is not writable: ${key}`)
      }
      if (['showInDock', 'openAtLogin'].includes(key) && typeof val !== 'boolean') {
        throw new Error(`Setting ${key} must be boolean`)
      }
      if (key === 'theme' && val !== 'dark' && val !== 'light' && val !== 'system') {
        throw new Error(`Unsupported theme: ${val}`)
      }
      if (key === 'maxCacheSizeGb') {
        const gb = Number(val)
        if (!Number.isFinite(gb) || gb < CACHE_FLOOR_BYTES / (1024 ** 3) || gb > CACHE_CEILING_BYTES / (1024 ** 3)) {
          throw new Error('Cache size must be between 1 and 100 GB')
        }
        validated[key] = Math.round(gb * 10) / 10
      } else {
        validated[key] = val
      }
    }

    for (const [key, val] of Object.entries(validated)) {
      store.set(key, val)
    }

    if ('openAtLogin' in validated) {
      app.setLoginItemSettings({ openAtLogin: validated.openAtLogin as boolean })
    }

    if ('maxCacheSizeGb' in validated) {
      const gb = validated.maxCacheSizeGb as number
      setCacheLimitBytes(Math.round(gb * 1024 * 1024 * 1024))
      evictToLimit(getCacheLimitBytes())
    }

    if ('showInDock' in validated) {
      if (validated.showInDock && app.dock) {
        app.dock.show()
      } else if (app.dock) {
        app.dock.hide()
      }
    }
    return true
  })

  ipcMain.handle('performance:set-mode', (event, payload) => {
    requireTrustedIpcSender(event)
    const { displayId, mode } = payload && typeof payload === 'object' ? payload : {}
    if (!isKnownDisplay(displayId) || typeof mode !== 'string' || !VALID_PERFORMANCE_MODES.has(mode)) {
      throw new Error('Invalid display or performance mode')
    }
    setPerformanceMode(String(displayId), mode)
    setPerformanceModeForDisplay(displayId, mode)
    return true
  })

  ipcMain.handle('import:file', async (event) => {
    requireTrustedIpcSender(event)
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

    const sourcePath = result.filePaths[0]
    const filename = path.basename(sourcePath)
    const extension = path.extname(filename).toLowerCase()
    if (!VALID_IMPORT_EXTENSIONS.has(extension)) {
      throw new Error('Unsupported wallpaper file type')
    }
    const sourceStat = fs.statSync(sourcePath)
    if (!sourceStat.isFile()) throw new Error('Selected wallpaper is not a file')
    const isVideo = /\.(mp4|mov|webm)$/i.test(filename)

    // Copy the import into the managed folder so the wallpaper is stable even if
    // the original file is moved, deleted, or the path is outside the allow-list.
    // Never overwrite an existing file with the same name — pick a unique name.
    const targetDir = getVantageWallpapersFolder()
    const uniqueTargetPath = (dir: string, name: string): string => {
      let candidate = path.join(dir, name)
      if (!fs.existsSync(candidate)) return candidate
      const ext = path.extname(name)
      const base = name.slice(0, name.length - ext.length) || name
      for (let i = 1; ; i++) {
        candidate = path.join(dir, `${base} (${i})${ext}`)
        if (!fs.existsSync(candidate)) return candidate
      }
    }
    const targetPath = uniqueTargetPath(targetDir, filename)
    try {
      await fs.promises.copyFile(sourcePath, targetPath)
    } catch (err) {
      console.error('[Import] Failed to copy file into managed folder:', err)
      return null
    }

    const finalName = path.basename(targetPath)
    let previewPath = targetPath
    if (isVideo) {
      const generatedThumb = await generateVideoThumbnail(targetPath)
      if (generatedThumb) {
        previewPath = generatedThumb
      }
    }

    const id = userFolderId(finalName, targetPath)
    const newItem = {
      id,
      title: finalName.replace(/\.[^/.]+$/, ''),
      category: isVideo ? ('imported' as const) : ('static' as const),
      type: isVideo ? ('video' as const) : ('image' as const),
      previewUrl: toMediaUrl(previewPath),
      sourceUrl: toMediaUrl(targetPath),
      resolution: await getMediaDimensions(targetPath),
      source: isVideo ? ('user' as const) : ('static' as const),
      license: 'User Imported File',
      attribution: 'Local File'
    }

    addWallpaperToDb(newItem)
    notifyCatalogChanged()
    return newItem
  })

  ipcMain.handle('cache:clear', (event) => {
    requireTrustedIpcSender(event)
    return clearCache()
  })

  ipcMain.handle('memory:free', (event) => {
    requireTrustedIpcSender(event)
    return freeUpMemory()
  })

  ipcMain.handle('cache:status', (event) => {
    requireTrustedIpcSender(event)
    return getCacheStatus()
  })

  ipcMain.handle('cache:ensure', (event, url: string) => {
    requireTrustedIpcSender(event)
    if (!isAllowedRemoteMediaUrl(url)) {
      return Promise.reject(new Error('Refusing to cache an untrusted media URL'))
    }
    return ensureCached(url).then((cachedPath) => {
      syncSelectedScreenSaverVideo()
      return toMediaUrl(cachedPath)
    })
  })

  ipcMain.handle('screen-saver:setup', async (event) => {
    requireTrustedIpcSender(event)
    return setupVantageScreenSaver()
  })

  onCacheProgress((progress) => {
    broadcastCacheProgress(progress)
  })

  ipcMain.handle('settings:set-login-at-login', (event, openAtLogin: boolean) => {
    requireTrustedIpcSender(event)
    if (typeof openAtLogin !== 'boolean') throw new Error('Invalid login setting')
    app.setLoginItemSettings({ openAtLogin })
    store.set('openAtLogin', openAtLogin)
    return true
  })

  ipcMain.handle('wallpaper:open-folder', (event) => {
    requireTrustedIpcSender(event)
    const folderPath = getVantageWallpapersFolder()
    shell.openPath(folderPath)
    return folderPath
  })

  ipcMain.handle('wallpaper:scan-local-folder', (event) => {
    requireTrustedIpcSender(event)
    return enqueueScan()
  })

  ipcMain.handle('window:minimize', (event) => {
    requireTrustedIpcSender(event)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.minimize()
  })

  ipcMain.handle('window:close', (event) => {
    requireTrustedIpcSender(event)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.close()
  })

  ipcMain.handle('shell:open-external', async (event, url: string) => {
    requireTrustedIpcSender(event)
    let parsed: URL | null = null
    try {
      parsed = new URL(url)
    } catch {
      console.warn('[shell:open-external] Rejected invalid URL:', url)
      return false
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'mailto:') {
      console.warn('[shell:open-external] Rejected non-https URL:', url)
      return false
    }
    try {
      await shell.openExternal(parsed.href)
      return true
    } catch (err) {
      console.warn('[shell:open-external] Failed to open URL:', url, err)
      return false
    }
  })

  ipcMain.handle('wallpaper:get-initial-state', (event) => {
    requireTrustedIpcSender(event)
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
    const wallpaper = getWallpaperById(assignment.wallpaperId || DEFAULT_WALLPAPER_ID) || getWallpaperById(DEFAULT_WALLPAPER_ID)

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

  // RES-03: Cancel pending debounced scans before they can re-open the DB
  // after closeDatabase() below (a late scan called initDatabase() again,
  // reopening a WAL connection mid-quit).
  if (scanTimer) { clearTimeout(scanTimer); scanTimer = null }
  if (staticTimer) { clearTimeout(staticTimer); staticTimer = null }

  // RES-02: Explicitly close DB for clean WAL checkpoint
  closeDatabase()

  // RES-01: Close all file watchers
  if (folderWatcher) { folderWatcher.close(); folderWatcher = null }
  for (const w of staticWatchers) w.close()
  staticWatchers.length = 0
})

app.whenReady().then(async () => {
  setGalleryWindowGetter(() => galleryWindow)

  // Build the set of allowed base directories for the media:// protocol.
  // NOTE: deliberately NOT app.getPath('userData') as a whole — that would
  // expose vantage.db, cookies and the Chromium profile to any renderer webContents.
  const userData = app.getPath('userData')
  const userDataMediaDirs = [
    path.join(userData, 'thumbnails'),
    path.join(userData, 'screen-saver'),
    path.join(userData, 'highres-frames')
  ]
  const allowedMediaBasePaths: string[] = [
    getVantageWallpapersFolder(),
    app.isPackaged ? process.resourcesPath : app.getAppPath(),
    ...userDataMediaDirs,
    getCacheDir(),
    ...getStaticSourceDirs()
  ]

  function isPathAllowed(filePath: string): boolean {
    let canonicalFile: string
    try {
      canonicalFile = fs.realpathSync(filePath).toLowerCase()
    } catch {
      return false
    }

    return allowedMediaBasePaths.some((base) => {
      try {
        const canonicalBase = fs.realpathSync(base).toLowerCase()
        const relative = path.relative(canonicalBase, canonicalFile)
        return (
          relative === '' ||
          (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
        )
      } catch {
        return false
      }
    })
  }

  const MEDIA_MIME_TYPES: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.m4v': 'video/x-m4v',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.heic': 'image/heic',
    '.heif': 'image/heif'
  }

  // Protocol handler for local file media streaming with full Range headers support
  protocol.handle('media', (request) => {
    try {
      const rawPath = request.url.replace(/^media:\/+/i, '/')
      const filePath = path.resolve(decodeURIComponent(rawPath))

      // Report genuinely missing files as 404 before the allow-list check
      // (the allow-list check requires realpath, which fails for missing files)
      if (!fs.existsSync(filePath)) {
        console.warn('[MediaProtocol] File not found:', filePath)
        return new Response('File Not Found', { status: 404 })
      }

      // C-2 FIX: Validate that the resolved path is under an allowed directory
      if (!isPathAllowed(filePath)) {
        console.warn('[MediaProtocol] Blocked access to path outside allowed directories:', filePath)
        return new Response('Forbidden', { status: 403 })
      }

      const stat = fs.statSync(filePath)
      const fileSize = stat.size
      const ext = path.extname(filePath).toLowerCase()
      const contentType = MEDIA_MIME_TYPES[ext] || 'application/octet-stream'
      const rangeHeader = request.headers.get('range')

      if (rangeHeader) {
        // C-4 FIX: Properly handle bytes=START-END, bytes=START- (open-ended), bytes=-N (suffix) and invalid/multi-range headers
        const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim())
        if (!match) {
          return new Response('Requested Range Not Satisfiable', {
            status: 416,
            headers: { 'Content-Range': `bytes */${fileSize}` }
          })
        }

        let start: number
        let end: number

        if (match[1] === '' && match[2] !== '') {
          const suffixLength = parseInt(match[2], 10)
          const length = Math.min(suffixLength, fileSize)
          start = fileSize - length
          end = fileSize - 1
        } else {
          start = parseInt(match[1], 10)
          end = match[2] === '' ? fileSize - 1 : parseInt(match[2], 10)
        }

        if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || start >= fileSize) {
          return new Response('Requested Range Not Satisfiable', {
            status: 416,
            headers: { 'Content-Range': `bytes */${fileSize}` }
          })
        }

        if (end >= fileSize) end = fileSize - 1
        const chunkSize = end - start + 1
        if (chunkSize <= 0) {
          return new Response('Requested Range Not Satisfiable', {
            status: 416,
            headers: { 'Content-Range': `bytes */${fileSize}` }
          })
        }

        const nodeStream = fs.createReadStream(filePath, { start, end })
        if (request.signal) {
          request.signal.addEventListener('abort', () => {
            if (!nodeStream.destroyed) nodeStream.destroy()
          }, { once: true })
        }
        const webStream = Readable.toWeb(nodeStream)

        return new Response(webStream as ReadableStream, {
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
      if (request.signal) {
        request.signal.addEventListener('abort', () => {
          if (!nodeStream.destroyed) nodeStream.destroy()
        }, { once: true })
      }
      const webStream = Readable.toWeb(nodeStream)

      return new Response(webStream as ReadableStream, {
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

  setupDockIcon()
  const showInDock = store.get('showInDock', false)
  if (app.dock && !showInDock) {
    app.dock.hide()
  }

  initDatabase()
  enqueueScan()
  watchVantageWallpapersFolder()
  const staticAdded = await enqueueStaticSync()
  if (staticAdded > 0) {
    console.log(`[StaticLibrary] Registered ${staticAdded} static wallpapers`)
  }
  watchStaticLibrary()
  setupDisplayListeners()
  syncWallpaperWindows()
  initPowerManager()
  void installVantageScreenSaver()
    .then(() => syncSelectedScreenSaverVideo())
    .catch((err) => console.warn('[ScreenSaver] Native module unavailable:', err))
  setCacheLimitBytes((store.get('maxCacheSizeGb', 5) as number) * 1024 * 1024 * 1024)
  evictToLimit(getCacheLimitBytes())
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
