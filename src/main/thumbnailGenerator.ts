import { app } from 'electron'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function getThumbnailDir(): string {
  const thumbDir = path.join(app.getPath('userData'), 'thumbnails')
  if (!fs.existsSync(thumbDir)) {
    fs.mkdirSync(thumbDir, { recursive: true })
  }
  return thumbDir
}

/**
 * Thumbnail file name is derived from a hash of the source path so identical
 * file names from different folders never collide or overwrite each other.
 */
function thumbnailStem(videoPath: string): string {
  const hash = crypto.createHash('sha1').update(videoPath).digest('hex').slice(0, 16)
  return `${path.basename(videoPath)}-${hash}`
}

/**
 * Generates a thumbnail image from the first frame of a video file.
 * Returns the local filesystem path to the generated image file.
 */
export async function generateVideoThumbnail(videoPath: string): Promise<string | null> {
  if (!videoPath || typeof videoPath !== 'string' || !fs.existsSync(videoPath)) {
    return null
  }

  const thumbDir = getThumbnailDir()
  const stem = thumbnailStem(videoPath)
  const expectedPngName = `${stem}.png`
  const targetThumbPath = path.join(thumbDir, expectedPngName)

  if (fs.existsSync(targetThumbPath) && fs.statSync(targetThumbPath).size > 0) {
    return targetThumbPath
  }

  // Strategy 1: macOS QuickLook thumbnail generator (qlmanage)
  if (process.platform === 'darwin') {
    try {
      await execFileAsync('/usr/bin/qlmanage', ['-t', '-s', '1280', '-o', thumbDir, videoPath])
      // qlmanage writes <basename>.png; normalize to the derived stable name
      const qlOutput = path.join(thumbDir, `${path.basename(videoPath)}.png`)
      if (fs.existsSync(qlOutput)) {
        let copied = false
        try {
          if (fs.statSync(qlOutput).size > 0) {
            fs.copyFileSync(qlOutput, targetThumbPath)
            copied = true
          }
        } finally {
          try {
            fs.unlinkSync(qlOutput)
          } catch {
            /* ignore cleanup failure */
          }
        }
        if (copied && fs.existsSync(targetThumbPath) && fs.statSync(targetThumbPath).size > 0) {
          console.log('[ThumbnailGenerator] Generated first frame thumbnail:', targetThumbPath)
          return targetThumbPath
        }
      }
    } catch (err) {
      console.warn('[ThumbnailGenerator] qlmanage failed:', err)
    }
  }

  // Strategy 2: ffmpeg fallback if available
  try {
    const jpgTarget = path.join(thumbDir, `${stem}.jpg`)
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss', '00:00:00',
      '-i', videoPath,
      '-vframes', '1',
      '-q:v', '2',
      jpgTarget
    ])
    if (fs.existsSync(jpgTarget) && fs.statSync(jpgTarget).size > 0) {
      console.log('[ThumbnailGenerator] Generated thumbnail via ffmpeg:', jpgTarget)
      return jpgTarget
    }
  } catch {
    // ignore
  }

  return null
}

/**
 * Deletes generated thumbnails that are no longer referenced by any wallpaper
 * row in the database.
 *
 * IMPORTANT: the "active" set is the basenames of files the DB currently
 * references (via `getWallpaperFileReferences`), NOT the contents of the
 * managed folder. Folder contents must not be used as the source of truth —
 * a wallpaper can legitimately live somewhere the folder scan does not cover,
 * and deleting its thumbnail would make its gallery tile vanish.
 *
 * Files written within the last few minutes are left alone so an in-flight
 * thumbnail generation is never pruned mid-write. Only files matching the
 * generated naming scheme `<name>-<16 hex>.png|.jpg` are considered.
 * Returns the number of files removed.
 */
export function pruneOrphanThumbnails(referencedBasenames: string[]): number {
  const thumbDir = path.join(app.getPath('userData'), 'thumbnails')
  if (!fs.existsSync(thumbDir)) return 0

  const referenced = new Set(referencedBasenames)
  const thumbPattern = /^.+-\w{16}\.(png|jpg)$/i
  const FRESH_WINDOW_MS = 8 * 60 * 1000
  const now = Date.now()
  let removed = 0

  let entries: string[]
  try {
    entries = fs.readdirSync(thumbDir)
  } catch {
    return 0
  }

  for (const entry of entries) {
    if (!thumbPattern.test(entry)) continue
    if (referenced.has(entry)) continue
    // Never touch files that may still be mid-generation
    let mtimeMs: number
    try {
      mtimeMs = fs.statSync(path.join(thumbDir, entry)).mtimeMs
    } catch {
      continue
    }
    if (now - mtimeMs < FRESH_WINDOW_MS) continue
    try {
      fs.unlinkSync(path.join(thumbDir, entry))
      removed++
    } catch {
      /* best-effort */
    }
  }
  if (removed > 0) {
    console.log(`[ThumbnailGenerator] Pruned ${removed} unreferenced thumbnail(s)`)
  }
  return removed
}
