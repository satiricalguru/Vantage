import { app } from 'electron'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
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
 * Generates a thumbnail image from the first frame of a video file.
 * Returns the local filesystem path to the generated image file.
 */
export async function generateVideoThumbnail(videoPath: string): Promise<string | null> {
  if (!videoPath || typeof videoPath !== 'string' || !fs.existsSync(videoPath)) {
    return null
  }

  const filename = path.basename(videoPath)
  const thumbDir = getThumbnailDir()
  const expectedPngName = `${filename}.png`
  const targetThumbPath = path.join(thumbDir, expectedPngName)

  if (fs.existsSync(targetThumbPath) && fs.statSync(targetThumbPath).size > 0) {
    return targetThumbPath
  }

  // Strategy 1: macOS QuickLook thumbnail generator (qlmanage)
  if (process.platform === 'darwin') {
    try {
      await execFileAsync('/usr/bin/qlmanage', ['-t', '-s', '1280', '-o', thumbDir, videoPath])
      if (fs.existsSync(targetThumbPath) && fs.statSync(targetThumbPath).size > 0) {
        console.log('[ThumbnailGenerator] Generated first frame thumbnail:', targetThumbPath)
        return targetThumbPath
      }
    } catch (err) {
      console.warn('[ThumbnailGenerator] qlmanage failed:', err)
    }
  }

  // Strategy 2: ffmpeg fallback if available
  try {
    const jpgTarget = path.join(thumbDir, `${filename}.jpg`)
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
