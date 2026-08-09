import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const repoThumbDir = path.resolve('resources/thumbnails')
const catalogPath = path.resolve('resources/catalog.json')

console.log('[ExtractVideoFrames] Starting real 4K & 2K video frame extraction...')

let catalog = []
try {
  catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
} catch (err) {
  console.error('[ExtractVideoFrames] Failed to load catalog.json:', err)
  process.exit(1)
}

// Filter items that have a remote mp4 sourceUrl and high resolution (3840 or 2560)
const highResItems = catalog.filter((item) => {
  if (!item.sourceUrl || !item.sourceUrl.startsWith('http')) return false
  const w = item.resolution?.width || 0
  return w >= 2560
})

console.log(`[ExtractVideoFrames] Found ${highResItems.length} 4K/2K catalog video items to process.`)

// Function to get current image pixel width via sips
function getImageWidth(filePath) {
  try {
    const { execFileSync } = require('child_process')
    const out = execFileSync('sips', ['-g', 'pixelWidth', filePath], { encoding: 'utf8' })
    const match = out.match(/pixelWidth:\s*(\d+)/)
    return match ? parseInt(match[1], 10) : 0
  } catch {
    return 0
  }
}

let processed = 0
let extractedCount = 0

const CONCURRENCY = 6
let index = 0

async function worker() {
  while (index < highResItems.length) {
    const item = highResItems[index++]
    const expectedWidth = item.resolution.width
    const filename = `${item.id}.jpg`
    const targetPath = path.join(repoThumbDir, filename)

    // Check if thumbnail already exists and matches true 4K/2K resolution
    if (fs.existsSync(targetPath)) {
      const currentWidth = getImageWidth(targetPath)
      if (currentWidth >= expectedWidth - 50) {
        // Already high-res photo frame!
        processed++
        continue
      }
    }

    console.log(`[ExtractVideoFrames] (${index}/${highResItems.length}) Extracting ${expectedWidth}px real frame from video: ${item.title}...`)

    try {
      // Use ffmpeg to extract photo frame at 00:00:01 directly from the 4K/2K video stream
      await execFileAsync('ffmpeg', [
        '-y',
        '-ss', '00:00:01',
        '-i', item.sourceUrl,
        '-vframes', '1',
        '-q:v', '2',
        targetPath
      ])
      if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
        extractedCount++
      }
    } catch (err) {
      console.warn(`[ExtractVideoFrames] Could not extract frame for ${item.id}:`, err.message || err)
    }

    processed++
  }
}

const workers = Array.from({ length: CONCURRENCY }, () => worker())
await Promise.all(workers)

console.log(`[ExtractVideoFrames] Completed! Extracted ${extractedCount} real 4K/2K video frames into resources/thumbnails.`)
