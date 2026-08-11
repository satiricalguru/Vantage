import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const repoThumbDir = path.resolve('resources/thumbnails')
const catalogPath = path.resolve('resources/catalog.json')

console.log('[GenerateCleanThumbnails] Starting crisp 1080p thumbnail optimization...')

let catalog = []
try {
  catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
} catch (err) {
  console.error('[GenerateCleanThumbnails] Failed to load catalog.json:', err)
  process.exit(1)
}

const files = fs.readdirSync(repoThumbDir).filter((f) => f.endsWith('.jpg') || f.endsWith('.png'))
console.log(`[GenerateCleanThumbnails] Processing ${files.length} thumbnails...`)

let processed = 0
let optimizedCount = 0

const CONCURRENCY = 8
let index = 0

async function worker() {
  while (index < files.length) {
    const file = files[index++]
    const filePath = path.join(repoThumbDir, file)

    try {
      const stat = fs.statSync(filePath)
      // Only process files larger than 250 KB to compress bloated images down to ~100 KB
      if (stat.size > 250 * 1024) {
        const tempPath = `${filePath}.tmp.jpg`
        await execFileAsync('ffmpeg', [
          '-y',
          '-i', filePath,
          '-vf', 'scale=1920:-1:flags=lanczos',
          '-q:v', '5',
          tempPath
        ])
        if (fs.existsSync(tempPath) && fs.statSync(tempPath).size > 0) {
          fs.renameSync(tempPath, filePath)
          optimizedCount++
        }
      }
    } catch {
      /* best effort */
    }

    processed++
    if (processed % 100 === 0 || processed === files.length) {
      console.log(`[GenerateCleanThumbnails] Progress: ${processed}/${files.length} files processed.`)
    }
  }
}

const workers = Array.from({ length: CONCURRENCY }, () => worker())
await Promise.all(workers)

console.log(`[GenerateCleanThumbnails] Optimization complete! Compressed ${optimizedCount} bloated thumbnail files.`)
