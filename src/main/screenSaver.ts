import { app, screen, shell, net } from 'electron'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { getDisplayAssignment, getWallpaperById } from './db'
import { getCachedFilePath, getCacheDir } from './videoCache'
import { DEFAULT_WALLPAPER_ID, WallpaperItem } from '../shared/types'

const SCREEN_SAVER_NAME = 'Vantage.saver'
const SCREEN_SAVER_DATA_DIR_NAME = 'Vantage'
const SCREEN_SAVER_SELECTION_NAME = 'screen-saver-video.txt'
const execFileAsync = promisify(execFile)

function bundledScreenSaverPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, SCREEN_SAVER_NAME)
  }
  return path.join(app.getAppPath(), 'build', 'screen-saver', SCREEN_SAVER_NAME)
}

function installedScreenSaverPath(): string {
  return path.join(app.getPath('home'), 'Library', 'Screen Savers', SCREEN_SAVER_NAME)
}

function selectionFilePath(): string {
  return path.join(
    app.getPath('appData'),
    SCREEN_SAVER_DATA_DIR_NAME,
    SCREEN_SAVER_SELECTION_NAME
  )
}

function localPathFromMediaUrl(url: string | undefined | null): string | null {
  if (!url || typeof url !== 'string') return null
  if (!url.startsWith('media://')) {
    if (url.startsWith('/') && fs.existsSync(url)) return url
    return null
  }
  try {
    const resolved = path.resolve(decodeURIComponent(url.replace(/^media:\/+/i, '/')))
    return fs.existsSync(resolved) ? resolved : null
  } catch {
    return null
  }
}

function isVideoPath(filePath: string): boolean {
  return /\.(mp4|m4v|mov|webm|mkv)$/i.test(filePath)
}

/**
 * Sets the macOS system desktop wallpaper to a local image path via AppleScript.
 * This ensures that when macOS locks (Lock Screen), the wallpaper's thumbnail/image is displayed!
 */
export async function setMacSystemWallpaper(imagePath: string): Promise<boolean> {
  if (process.platform !== 'darwin') return false
  if (!imagePath || !fs.existsSync(imagePath)) {
    console.warn('[SystemWallpaper] Image path does not exist for macOS system wallpaper:', imagePath)
    return false
  }

  const safePath = imagePath.replace(/"/g, '\\"')
  const script = `tell application "System Events" to set picture of every desktop to (POSIX file "${safePath}")`
  try {
    await execFileAsync('/usr/bin/osascript', ['-e', script])
    console.log('[SystemWallpaper] Updated macOS system desktop wallpaper (Lock Screen background):', imagePath)
    return true
  } catch (err) {
    console.warn('[SystemWallpaper] Could not set macOS system wallpaper via osascript:', err)
    return false
  }
}

async function ensureLocalThumbnail(wallpaper: WallpaperItem): Promise<string | null> {
  const previewPath = localPathFromMediaUrl(wallpaper.previewUrl)
  if (previewPath) return previewPath

  const sourcePath = localPathFromMediaUrl(wallpaper.sourceUrl)
  if (sourcePath && !isVideoPath(sourcePath)) return sourcePath

  if (typeof wallpaper.previewUrl === 'string' && /^https?:\/\//i.test(wallpaper.previewUrl)) {
    const cleanUrl = wallpaper.previewUrl.split('?')[0]
    const ext = path.extname(cleanUrl) || '.jpg'
    const hash = crypto.createHash('sha1').update(wallpaper.previewUrl).digest('hex')
    const cachedThumbPath = path.join(getCacheDir(), `thumb-${hash}${ext}`)

    if (fs.existsSync(cachedThumbPath) && fs.statSync(cachedThumbPath).size > 0) {
      return cachedThumbPath
    }

    try {
      const response = await net.fetch(wallpaper.previewUrl)
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer()
        await fs.promises.mkdir(path.dirname(cachedThumbPath), { recursive: true })
        await fs.promises.writeFile(cachedThumbPath, Buffer.from(arrayBuffer))
        return cachedThumbPath
      }
    } catch (err) {
      console.warn('[SystemWallpaper] Failed to download remote thumbnail:', err)
    }
  }

  return null
}

/** Install the native screen saver module for the current user. */
export async function installVantageScreenSaver(): Promise<string> {
  const source = bundledScreenSaverPath()
  const target = installedScreenSaverPath()

  if (!fs.existsSync(source)) {
    throw new Error(`Bundled screen saver not found: ${source}. Run npm run build first.`)
  }

  await fs.promises.mkdir(path.dirname(target), { recursive: true })
  await fs.promises.cp(source, target, { recursive: true, force: true })
  console.log('[ScreenSaver] Installed native module:', target)
  return target
}

/**
 * Synchronize current active wallpaper for both macOS System Desktop / Lock Screen
 * and the native Vantage Screen Saver module.
 */
export async function syncLockScreenAndSystemWallpaper(): Promise<void> {
  const primaryDisplay = screen.getPrimaryDisplay()
  const assignment = getDisplayAssignment(String(primaryDisplay.id))
  const wallpaper = getWallpaperById(assignment.wallpaperId || DEFAULT_WALLPAPER_ID)
  if (!wallpaper) return

  let videoPath: string | null = null
  if (wallpaper.type === 'video') {
    videoPath = localPathFromMediaUrl(wallpaper.sourceUrl)
    if (!videoPath && /^https?:\/\//i.test(wallpaper.sourceUrl)) {
      videoPath = getCachedFilePath(wallpaper.sourceUrl)
    }
    if (videoPath && (!isVideoPath(videoPath) || !fs.existsSync(videoPath))) {
      videoPath = null
    }
  }

  const thumbnailPath = await ensureLocalThumbnail(wallpaper)

  // 1. Update macOS System Wallpaper so Lock Screen displays the wallpaper image/thumbnail
  if (thumbnailPath) {
    await setMacSystemWallpaper(thumbnailPath)
  }

  // 2. Export media file to native Screen Saver (live video if cached/local, otherwise thumbnail/image)
  const screenSaverMedia = videoPath || thumbnailPath
  if (screenSaverMedia && fs.existsSync(screenSaverMedia)) {
    const target = selectionFilePath()
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, `${screenSaverMedia}\n`, { encoding: 'utf8', mode: 0o600 })
    try {
      fs.chmodSync(target, 0o600)
    } catch {
      // ignore
    }
    console.log('[ScreenSaver] Lock screen media synchronized:', screenSaverMedia)
  }
}

export function syncSelectedScreenSaverVideo(): void {
  void syncLockScreenAndSystemWallpaper()
}

async function activateVantageScreenSaver(installedPath: string): Promise<void> {
  await execFileAsync('/usr/bin/defaults', [
    '-currentHost',
    'write',
    'com.apple.screensaver',
    'moduleDict',
    '-dict',
    'moduleName',
    'Vantage',
    'path',
    installedPath,
    'type',
    '0'
  ])
  console.log('[ScreenSaver] Activated native module for the current macOS user.')
}

export async function setupVantageScreenSaver(): Promise<{ path: string }> {
  const installedPath = await installVantageScreenSaver()
  await syncLockScreenAndSystemWallpaper()
  await activateVantageScreenSaver(installedPath)
  await shell.openExternal('x-apple.systempreferences:com.apple.Wallpaper-Settings.extension')
  return { path: installedPath }
}

