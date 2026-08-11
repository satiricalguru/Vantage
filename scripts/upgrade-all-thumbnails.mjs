import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

const repoThumbDir = path.resolve('resources/thumbnails')
const catalogPath = path.resolve('resources/catalog.json')
const cacheMediaDir = path.join(process.env.HOME || '', 'Library/Caches/vantage/media')

console.log('[UpgradeThumbnails] Starting batch thumbnail upgrade for resources/thumbnails...')

let catalog = []
try {
  catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
} catch (err) {
  console.error('[UpgradeThumbnails] Could not load catalog.json:', err)
}

// Map catalog sourceUrl SHA1 to catalog item
const mediaHashToItem = new Map()
for (const item of catalog) {
  if (item.sourceUrl) {
    const hash = crypto.createHash('sha1').update(item.sourceUrl).digest('hex')
    mediaHashToItem.set(hash, item)
  }
}

const files = fs.readdirSync(repoThumbDir).filter((f) => f.endsWith('.jpg') || f.endsWith('.png'))
console.log(`[UpgradeThumbnails] Found ${files.length} thumbnails to check/upgrade.`)

let updatedCount = 0

for (const file of files) {
  const filePath = path.join(repoThumbDir, file)
  const baseName = path.parse(file).name
  
  // Find matching item in catalog
  const catalogItem = catalog.find(
    (w) => w.id === baseName || w.id === `motionbgs-${baseName}` || w.id === `wallpaperx-${baseName}`
  )
  
  let targetWidth = 2560
  if (catalogItem && catalogItem.resolution && catalogItem.resolution.width >= 3840) {
    targetWidth = 3840
  } else if (catalogItem && catalogItem.resolution && catalogItem.resolution.width >= 2560) {
    targetWidth = 2560
  }

  // Check if we have a cached high-res video file for this item
  let cachedVideoPath = null
  if (catalogItem && catalogItem.sourceUrl) {
    const hash = crypto.createHash('sha1').update(catalogItem.sourceUrl).digest('hex')
    const possiblePath = path.join(cacheMediaDir, `${hash}.mp4`)
    if (fs.existsSync(possiblePath) && fs.statSync(possiblePath).size > 0) {
      cachedVideoPath = possiblePath
    }
  }

  if (cachedVideoPath) {
    // Extract crisp frame at 00:00:01 from local video
    try {
      execFileSync('/usr/bin/qlmanage', ['-t', '-s', String(targetWidth), '-o', repoThumbDir, cachedVideoPath], { stdio: 'ignore' })
      const qlOut = path.join(repoThumbDir, `${path.basename(cachedVideoPath)}.png`)
      if (fs.existsSync(qlOut)) {
        fs.renameSync(qlOut, filePath)
        console.log(`[UpgradeThumbnails] Extracted ${targetWidth}px video frame for ${file}`)
        updatedCount++
        continue
      }
    } catch { /* fallback to resample */ }
  }

  // A missing source cannot be repaired by upscaling: interpolation adds no
  // source detail and would make a misleading 2K/4K claim. Leave it untouched.
  if (!cachedVideoPath && catalogItem?.resolution?.width >= 2560) {
    console.warn(`[UpgradeThumbnails] Skipped ${file}: no verified local high-resolution source.`)
  }
}

console.log(`[UpgradeThumbnails] Successfully upgraded ${updatedCount} thumbnails in resources/thumbnails!`)
