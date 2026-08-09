import { app, screen, shell, net } from 'electron'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { getDisplayAssignment, getWallpaperById } from './db'
import { getCachedFilePath, isAllowedRemoteMediaUrl } from './videoCache'
import { DEFAULT_WALLPAPER_ID, WallpaperItem } from '../shared/types'

const SCREEN_SAVER_NAME = 'Vantage.saver'
const SCREEN_SAVER_DATA_DIR_NAME = 'Vantage'
const SCREEN_SAVER_SELECTION_NAME = 'screen-saver-video.txt'
const MAX_THUMBNAIL_DOWNLOAD_BYTES = 32 * 1024 * 1024
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
 * The call is skipped when the image is unchanged to avoid spamming System Events / TCC prompts.
 */
let lastSystemWallpaperPath: string | null = null

/**
 * Escapes a path for safe interpolation into a double-quoted AppleScript
 * string. Backslashes and quotes are escaped; control characters (including
 * newlines) cannot be represented safely and cause the call to be rejected.
 */
function appleScriptEscape(value: string): string | null {
  if (/[\u0000-\u001F\u007F]/.test(value)) return null
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export async function setMacSystemWallpaper(imagePath: string): Promise<boolean> {
  if (process.platform !== 'darwin') return false
  if (!imagePath || !fs.existsSync(imagePath)) {
    console.warn('[SystemWallpaper] Image path does not exist for macOS system wallpaper:', imagePath)
    return false
  }
  if (lastSystemWallpaperPath === imagePath) {
    return true
  }

  const safePath = appleScriptEscape(imagePath)
  if (safePath === null) {
    console.warn('[SystemWallpaper] Refusing to embed path with control characters in AppleScript:', imagePath)
    return false
  }
  const script = `tell application "System Events" to set picture of every desktop to (POSIX file "${safePath}")`
  try {
    await execFileAsync('/usr/bin/osascript', ['-e', script])
    lastSystemWallpaperPath = imagePath
    console.log('[SystemWallpaper] Updated macOS system desktop wallpaper (Lock Screen background):', imagePath)
    return true
  } catch (err) {
    console.warn('[SystemWallpaper] Could not set macOS system wallpaper via osascript (grant Automation permission for Vantage in System Settings > Privacy & Security):', err)
    return false
  }
}

function getScreenSaverAssetDir(): string {
  const dir = path.join(app.getPath('userData'), 'screen-saver')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

async function ensureLocalThumbnail(wallpaper: WallpaperItem): Promise<string | null> {
  const previewPath = localPathFromMediaUrl(wallpaper.previewUrl)
  if (previewPath) return previewPath

  const sourcePath = localPathFromMediaUrl(wallpaper.sourceUrl)
  if (sourcePath && !isVideoPath(sourcePath)) return sourcePath

  if (typeof wallpaper.previewUrl === 'string' && /^https?:\/\//i.test(wallpaper.previewUrl)) {
    if (!isAllowedRemoteMediaUrl(wallpaper.previewUrl)) {
      console.warn('[SystemWallpaper] Refusing to download thumbnail from untrusted host:', wallpaper.previewUrl)
      return null
    }
    const cleanUrl = wallpaper.previewUrl.split('?')[0]
    const ext = path.extname(cleanUrl) || '.jpg'
    const hash = crypto.createHash('sha1').update(wallpaper.previewUrl).digest('hex')
    const cachedThumbPath = path.join(getScreenSaverAssetDir(), `thumb-${hash}${ext}`)

    if (fs.existsSync(cachedThumbPath) && fs.statSync(cachedThumbPath).size > 0) {
      return cachedThumbPath
    }

    try {
      const response = await net.fetch(wallpaper.previewUrl, { redirect: 'error' })
      if (!response.ok || response.body == null) return null
      const total = Number(response.headers.get('content-length')) || 0
      if (total > MAX_THUMBNAIL_DOWNLOAD_BYTES) {
        console.warn('[SystemWallpaper] Remote thumbnail exceeds size limit:', wallpaper.previewUrl)
        return null
      }
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let received = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        received += value.byteLength
        if (received > MAX_THUMBNAIL_DOWNLOAD_BYTES) {
          await reader.cancel()
          return null
        }
        chunks.push(value)
      }
      if (chunks.length === 0) return null
      const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)))
      await fs.promises.writeFile(cachedThumbPath, buffer)
      return cachedThumbPath
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
 * and the native Vantage Screen Saver module. Calls are serialized so a burst of
 * wallpaper changes cannot interleave (last invocation wins).
 */
let syncQueue: Promise<void> = Promise.resolve()

import { getMediaDimensions } from './mediaInfo'

/**
 * Extracts a high-definition 2K/4K static snapshot frame from a video file using macOS native qlmanage.
 */
export async function getHighResVideoFrame(videoPath: string): Promise<string | null> {
  if (process.platform !== 'darwin' || !fs.existsSync(videoPath)) return null

  try {
    const dims = await getMediaDimensions(videoPath)
    let frameSize = 1920
    if (dims.width >= 3840) {
      frameSize = 3840
    } else if (dims.width >= 2560) {
      frameSize = 2560
    } else if (dims.width > 0) {
      frameSize = Math.max(dims.width, 1920)
    }

    const hash = crypto.createHash('sha1').update(`${videoPath}:${frameSize}`).digest('hex')
    const cacheDir = path.join(app.getPath('userData'), 'highres-frames')
    fs.mkdirSync(cacheDir, { recursive: true })

    const targetFramePath = path.join(cacheDir, `frame-${hash}.png`)
    if (fs.existsSync(targetFramePath) && fs.statSync(targetFramePath).size > 0) {
      return targetFramePath
    }

    // Use native macOS qlmanage to extract a 2K/4K frame from the video
    await execFileAsync('/usr/bin/qlmanage', ['-t', '-s', String(frameSize), '-o', cacheDir, videoPath])

    const generatedName = `${path.basename(videoPath)}.png`
    const generatedPath = path.join(cacheDir, generatedName)

    if (fs.existsSync(generatedPath)) {
      await fs.promises.rename(generatedPath, targetFramePath)
      return targetFramePath
    }
  } catch (err) {
    console.warn('[SystemWallpaper] Could not extract high-res video frame via qlmanage:', err)
  }

  return null
}

export function syncSelectedScreenSaverVideo(): void {
  syncQueue = syncQueue.then(() => syncLockScreenAndSystemWallpaper()).catch((err) => {
    console.warn('[ScreenSaver] Sync failed:', err)
  })
}

async function syncLockScreenAndSystemWallpaper(): Promise<void> {
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

  let highResFramePath: string | null = null
  if (videoPath) {
    highResFramePath = await getHighResVideoFrame(videoPath)
  }

  const systemWallpaperPath = highResFramePath || thumbnailPath

  // 1. Update macOS System Wallpaper so Lock Screen displays a crisp 1080p/4K wallpaper snapshot
  if (systemWallpaperPath) {
    await setMacSystemWallpaper(systemWallpaperPath)
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
  try {
    await shell.openExternal('x-apple.systempreferences:com.apple.Wallpaper-Settings.extension')
  } catch {
    try {
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.desktopscreensaver')
    } catch (err) {
      console.warn('[ScreenSaver] Could not open macOS Screen Saver settings pane automatically:', err)
    }
  }
  return { path: installedPath }
}

