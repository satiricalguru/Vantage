import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const repoThumbDir = path.resolve('resources/thumbnails')
const catalogPath = path.resolve('resources/catalog.json')

console.log('[RebuildFreshThumbnails] Purging old thumbnails and generating fresh crisp high-def photo frames...')

// 1. Purge all existing files in resources/thumbnails/
if (fs.existsSync(repoThumbDir)) {
  const oldFiles = fs.readdirSync(repoThumbDir)
  for (const file of oldFiles) {
    try {
      fs.unlinkSync(path.join(repoThumbDir, file))
    } catch {
      /* ignore */
    }
  }
  console.log(`[RebuildFreshThumbnails] Removed ${oldFiles.length} old thumbnails.`)
} else {
  fs.mkdirSync(repoThumbDir, { recursive: true })
}

// 2. Load catalog
let catalog = []
try {
  catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
} catch (err) {
  console.error('[RebuildFreshThumbnails] Failed to load catalog.json:', err)
  process.exit(1)
}

console.log(`[RebuildFreshThumbnails] Processing ${catalog.length} wallpapers...`)

let processed = 0
let extractedCount = 0
let failedCount = 0

const CONCURRENCY = 8
let index = 0

async function worker() {
  while (index < catalog.length) {
    const item = catalog[index++]
    const targetPath = path.join(repoThumbDir, `${item.id}.jpg`)

    try {
      // Case A: Item has a remote video sourceUrl
      if (item.sourceUrl && item.sourceUrl.startsWith('http')) {
        await execFileAsync('ffmpeg', [
          '-y',
          '-ss', '00:00:01',
          '-i', item.sourceUrl,
          '-vf', 'scale=1920:-1:flags=lanczos',
          '-vframes', '1',
          '-q:v', '5',
          targetPath
        ])
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
          extractedCount++
        } else {
          failedCount++
        }
      }
      // Case B: Item is local wallpaper in resources/wallpapers
      else if (item.filePath && fs.existsSync(item.filePath)) {
        if (item.type === 'video' || item.filePath.endsWith('.mp4')) {
          await execFileAsync('ffmpeg', [
            '-y',
            '-ss', '00:00:01',
            '-i', item.filePath,
            '-vf', 'scale=1920:-1:flags=lanczos',
            '-vframes', '1',
            '-q:v', '5',
            targetPath
          ])
        } else {
          // Static image
          await execFileAsync('ffmpeg', [
            '-y',
            '-i', item.filePath,
            '-vf', 'scale=1920:-1:flags=lanczos',
            '-q:v', '5',
            targetPath
          ])
        }
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
          extractedCount++
        }
      }
    } catch {
      failedCount++
    }

    processed++
    if (processed % 50 === 0 || processed === catalog.length) {
      console.log(`[RebuildFreshThumbnails] Progress: ${processed}/${catalog.length} (Extracted: ${extractedCount}, Failed: ${failedCount})`)
    }
  }
}

const workers = Array.from({ length: CONCURRENCY }, () => worker())
await Promise.all(workers)

console.log(`[RebuildFreshThumbnails] Completed! Generated ${extractedCount} brand new crisp high-definition photo frames.`)
