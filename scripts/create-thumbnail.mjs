import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
if (args.length === 0) {
  console.log('Usage: node scripts/create-thumbnail.mjs <inputVideoPath> [outputImagePath]')
  process.exit(1)
}

const inputPath = path.resolve(args[0])
if (!fs.existsSync(inputPath)) {
  console.error(`Input file not found: ${inputPath}`)
  process.exit(1)
}

const filename = path.basename(inputPath)
let outputPath = args[1]
  ? path.resolve(args[1])
  : path.join(path.dirname(inputPath), `${path.parse(filename).name}-thumb.png`)

const outputDir = path.dirname(outputPath)
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

let targetSize = '3840'
if (process.platform === 'darwin') {
  try {
    const mdlsOut = execFileSync('mdls', ['-name', 'kMDItemPixelWidth', inputPath], { encoding: 'utf8' })
    const match = mdlsOut.match(/kMDItemPixelWidth\s*=\s*(\d+)/)
    if (match) {
      const w = parseInt(match[1], 10)
      if (w >= 3840) targetSize = '3840'
      else if (w >= 2560) targetSize = '2560'
      else if (w >= 1920) targetSize = '1920'
      else if (w > 0) targetSize = String(Math.max(w, 1280))
    }
  } catch {
    /* fallback to default targetSize */
  }

  try {
    execFileSync('/usr/bin/qlmanage', ['-t', '-s', targetSize, '-o', outputDir, inputPath], { stdio: 'ignore' })
    const generatedPng = path.join(outputDir, `${filename}.png`)
    if (fs.existsSync(generatedPng)) {
      if (generatedPng !== outputPath) {
        fs.renameSync(generatedPng, outputPath)
      }
      console.log(`[Thumbnail] Created ${targetSize}px thumbnail image: ${outputPath}`)
      process.exit(0)
    }
  } catch (err) {
    console.warn('[Thumbnail] qlmanage failed, trying ffmpeg fallback:', err)
  }
}

try {
  execFileSync('ffmpeg', ['-y', '-ss', '00:00:01', '-i', inputPath, '-vframes', '1', '-q:v', '2', outputPath], { stdio: 'ignore' })
  if (fs.existsSync(outputPath)) {
    console.log(`[Thumbnail] Created thumbnail via ffmpeg: ${outputPath}`)
    process.exit(0)
  }
} catch {
  console.error('[Thumbnail] Failed to generate thumbnail. Ensure qlmanage (macOS) or ffmpeg is available.')
  process.exit(1)
}
