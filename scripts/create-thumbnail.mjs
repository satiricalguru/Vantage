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

if (process.platform === 'darwin') {
  try {
    execFileSync('/usr/bin/qlmanage', ['-t', '-s', '1280', '-o', outputDir, inputPath], { stdio: 'ignore' })
    const generatedPng = path.join(outputDir, `${filename}.png`)
    if (fs.existsSync(generatedPng)) {
      if (generatedPng !== outputPath) {
        fs.renameSync(generatedPng, outputPath)
      }
      console.log(`[Thumbnail] Created thumbnail image: ${outputPath}`)
      process.exit(0)
    }
  } catch (err) {
    console.warn('[Thumbnail] qlmanage failed, trying ffmpeg fallback:', err)
  }
}

try {
  execFileSync('ffmpeg', ['-y', '-ss', '00:00:00', '-i', inputPath, '-vframes', '1', '-q:v', '2', outputPath], { stdio: 'ignore' })
  if (fs.existsSync(outputPath)) {
    console.log(`[Thumbnail] Created thumbnail via ffmpeg: ${outputPath}`)
    process.exit(0)
  }
} catch {
  console.error('[Thumbnail] Failed to generate thumbnail. Ensure qlmanage (macOS) or ffmpeg is available.')
  process.exit(1)
}
