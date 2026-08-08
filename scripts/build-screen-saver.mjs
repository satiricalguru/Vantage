import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = path.resolve(import.meta.dirname, '..')
const sourceDir = path.join(root, 'native', 'VantageScreenSaver')
const outputDir = path.join(root, 'build', 'screen-saver', 'Vantage.saver')
const contentsDir = path.join(outputDir, 'Contents')
const macOsDir = path.join(contentsDir, 'MacOS')
const resourcesDir = path.join(contentsDir, 'Resources')
const binaryPath = path.join(macOsDir, 'VantageScreenSaver')
const sourcePath = path.join(sourceDir, 'VantageScreenSaver.swift')
const infoPath = path.join(sourceDir, 'Info.plist')
const defaultVideoPath = path.join(root, 'Extracted_Video_Wallpapers', 'V8.mp4')

if (process.platform !== 'darwin') {
  console.log('[ScreenSaver] Skipping native .saver build on non-macOS host.')
  process.exit(0)
}

for (const requiredPath of [sourcePath, infoPath, defaultVideoPath]) {
  if (!existsSync(requiredPath)) {
    throw new Error(`[ScreenSaver] Required file is missing: ${requiredPath}`)
  }
}

rmSync(outputDir, { recursive: true, force: true })
mkdirSync(macOsDir, { recursive: true })
mkdirSync(resourcesDir, { recursive: true })

const sdkResult = spawnSync('xcrun', ['--sdk', 'macosx', '--show-sdk-path'], { encoding: 'utf8' })
if (sdkResult.status !== 0) {
  throw new Error(`[ScreenSaver] Could not locate the macOS SDK: ${sdkResult.stderr}`)
}
const sdkPath = sdkResult.stdout.trim()

const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const infoPlist = readFileSync(infoPath, 'utf8')
  .replace('<string>1.0</string>', `<string>${packageJson.version}</string>`)
  .replace('<string>1</string>', `<string>${packageJson.version}</string>`)

const archOutputPaths = []
for (const arch of ['arm64', 'x86_64']) {
  const archOutput = path.join(macOsDir, `VantageScreenSaver-${arch}`)
  const result = spawnSync('swiftc', [
    sourcePath,
    '-parse-as-library',
    '-module-name', 'VantageScreenSaver',
    '-sdk', sdkPath,
    '-target', `${arch}-apple-macosx12.0`,
    '-emit-library',
    '-o', archOutput,
    '-Xlinker', '-bundle',
    '-Xlinker', '-undefined',
    '-Xlinker', 'dynamic_lookup',
    '-framework', 'AppKit',
    '-framework', 'AVFoundation',
    '-framework', 'ScreenSaver'
  ], { stdio: 'inherit' })

  if (result.status !== 0) {
    throw new Error(`[ScreenSaver] Swift build failed for ${arch}.`)
  }
  archOutputPaths.push(archOutput)
}

const lipoResult = spawnSync('lipo', ['-create', ...archOutputPaths, '-output', binaryPath], { stdio: 'inherit' })
if (lipoResult.status !== 0) {
  throw new Error('[ScreenSaver] Could not create the universal screen saver binary.')
}

for (const archOutput of archOutputPaths) {
  rmSync(archOutput, { force: true })
}

writeFileSync(path.join(contentsDir, 'Info.plist'), infoPlist)
cpSync(defaultVideoPath, path.join(resourcesDir, 'VantageDefault.mp4'))

const signResult = spawnSync('codesign', ['--force', '--deep', '--sign', '-', outputDir], { stdio: 'inherit' })
if (signResult.status !== 0) {
  throw new Error('[ScreenSaver] Could not ad-hoc sign the screen saver bundle.')
}

console.log(`[ScreenSaver] Built universal bundle: ${outputDir}`)
