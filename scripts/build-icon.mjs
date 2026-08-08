import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const svgIcon = path.join(root, 'assets', 'icon.svg')
const buildDir = path.join(root, 'build')
const resourcesIconsDir = path.join(root, 'resources', 'icons')
const pngTarget = path.join(buildDir, 'icon.png')
const resourcesPngTarget = path.join(resourcesIconsDir, 'icon.png')
const icnsTarget = path.join(buildDir, 'icon.icns')
const iconsetDir = path.join(buildDir, 'icon.iconset')

if (!fs.existsSync(svgIcon)) {
  console.error(`[BuildIcon] Source SVG not found: ${svgIcon}`)
  process.exit(1)
}

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true })
}
if (!fs.existsSync(resourcesIconsDir)) {
  fs.mkdirSync(resourcesIconsDir, { recursive: true })
}

if (process.platform === 'darwin') {
  try {
    const tmpDir = path.join(buildDir, 'tmp_icon_gen')
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
    execFileSync('/usr/bin/qlmanage', ['-t', '-s', '1024', '-o', tmpDir, svgIcon], { stdio: 'ignore' })
    const generatedPng = path.join(tmpDir, 'icon.svg.png')

    if (fs.existsSync(generatedPng)) {
      fs.copyFileSync(generatedPng, pngTarget)
      fs.copyFileSync(generatedPng, resourcesPngTarget)

      if (!fs.existsSync(iconsetDir)) fs.mkdirSync(iconsetDir, { recursive: true })
      const sizes = [16, 32, 64, 128, 256, 512, 1024]
      for (const size of sizes) {
        if (size === 1024) {
          execFileSync('sips', ['-z', String(size), String(size), generatedPng, '--out', path.join(iconsetDir, 'icon_512x512@2x.png')], { stdio: 'ignore' })
        } else if (size === 16) {
          execFileSync('sips', ['-z', String(size), String(size), generatedPng, '--out', path.join(iconsetDir, 'icon_16x16.png')], { stdio: 'ignore' })
          execFileSync('sips', ['-z', '32', '32', generatedPng, '--out', path.join(iconsetDir, 'icon_16x16@2x.png')], { stdio: 'ignore' })
        } else if (size === 32) {
          execFileSync('sips', ['-z', '32', '32', generatedPng, '--out', path.join(iconsetDir, 'icon_32x32.png')], { stdio: 'ignore' })
          execFileSync('sips', ['-z', '64', '64', generatedPng, '--out', path.join(iconsetDir, 'icon_32x32@2x.png')], { stdio: 'ignore' })
        } else if (size === 128) {
          execFileSync('sips', ['-z', '128', '128', generatedPng, '--out', path.join(iconsetDir, 'icon_128x128.png')], { stdio: 'ignore' })
          execFileSync('sips', ['-z', '256', '256', generatedPng, '--out', path.join(iconsetDir, 'icon_128x128@2x.png')], { stdio: 'ignore' })
        } else if (size === 256) {
          execFileSync('sips', ['-z', '256', '256', generatedPng, '--out', path.join(iconsetDir, 'icon_256x256.png')], { stdio: 'ignore' })
          execFileSync('sips', ['-z', '512', '512', generatedPng, '--out', path.join(iconsetDir, 'icon_256x256@2x.png')], { stdio: 'ignore' })
        } else if (size === 512) {
          execFileSync('sips', ['-z', '512', '512', generatedPng, '--out', path.join(iconsetDir, 'icon_512x512.png')], { stdio: 'ignore' })
        }
      }

      execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', icnsTarget], { stdio: 'ignore' })
      fs.rmSync(iconsetDir, { recursive: true, force: true })
      fs.rmSync(tmpDir, { recursive: true, force: true })
      console.log('[BuildIcon] Successfully generated PNG & ICNS app icons!')
    }
  } catch (err) {
    console.warn('[BuildIcon] Could not generate ICNS using sips/iconutil:', err)
  }
}
