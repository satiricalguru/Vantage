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
const defaultVideoCandidates = [
  path.join(root, 'resources', 'wallpapers', 'V8.mp4'),
  path.join(root, 'Extracted_Video_Wallpapers', 'V8.mp4')
]
const defaultVideoPath = defaultVideoCandidates.find((p) => existsSync(p))

if (process.platform !== 'darwin') {
  console.log('[ScreenSaver] Skipping native .saver build on non-macOS host.')
  process.exit(0)
}

for (const requiredPath of [sourcePath, infoPath]) {
  if (!existsSync(requiredPath)) {
    throw new Error(`[ScreenSaver] Required file is missing: ${requiredPath}`)
  }
}
if (!defaultVideoPath) {
  for (const p of defaultVideoCandidates) console.log(`[ScreenSaver] Missing default video candidate: ${p}`)
  throw new Error(`[ScreenSaver] Required default wallpaper video is missing: ${defaultVideoCandidates.join(' or ')}`)
}

rmSync(outputDir, { recursive: true, force: true })
mkdirSync(macOsDir, { recursive: true })
mkdirSync(resourcesDir, { recursive: true })

try {
  build()
} catch (err) {
  // Never leave a partial .saver bundle behind — a stale artifact could end
  // up shipped in the next DMG.
  rmSync(outputDir, { recursive: true, force: true })
  throw err
}

function build() {
  const sdkResult = spawnSync('xcrun', ['--sdk', 'macosx', '--show-sdk-path'], { encoding: 'utf8' })
  if (sdkResult.status !== 0) {
    throw new Error(`[ScreenSaver] Could not locate the macOS SDK: ${sdkResult.stderr}`)
  }
  const sdkPath = sdkResult.stdout.trim()

  const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const version = packageJson.version
  let infoPlist = readFileSync(infoPath, 'utf8')
  const templated = infoPlist
    .replace('<string>1.0</string>', `<string>${version}</string>`)
    .replace('<string>1</string>', `<string>${version}</string>`)
  if (templated === infoPlist) {
    throw new Error('[ScreenSaver] Info.plist version templating matched nothing — update the CFBundleVersion/CFBundleShortVersionString templates in Info.plist.')
  }
  infoPlist = templated

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

  const signResult = spawnSync('codesign', ['--force', '--sign', '-', outputDir], { stdio: 'inherit' })
  if (signResult.status !== 0) {
    throw new Error('[ScreenSaver] Could not ad-hoc sign the screen saver bundle.')
  }

  // Post-build validation: the artifact must be a real universal binary and a
  // valid code signature, or we refuse to report success.
  const lipoInfo = spawnSync('lipo', ['-info', binaryPath], { encoding: 'utf8' })
  if (lipoInfo.status !== 0) {
    throw new Error('[ScreenSaver] lipo validation failed on the built binary.')
  }
  const arches = (lipoInfo.stdout || '').match(/arm64|x86_64/g) || []
  if (!arches.includes('arm64') || !arches.includes('x86_64')) {
    throw new Error(`[ScreenSaver] Universal binary is missing an architecture: ${lipoInfo.stdout}`)
  }

  const plistLint = spawnSync('plutil', ['-lint', path.join(contentsDir, 'Info.plist')], { encoding: 'utf8' })
  if (plistLint.status !== 0) {
    throw new Error(`[ScreenSaver] Info.plist validation failed: ${plistLint.stderr || plistLint.stdout}`)
  }

  const verifyResult = spawnSync('codesign', ['--verify', '--strict', '--verbose=2', outputDir], { encoding: 'utf8' })
  if (verifyResult.status !== 0) {
    throw new Error(`[ScreenSaver] codesign verification failed: ${verifyResult.stderr || verifyResult.stdout}`)
  }

  console.log(`[ScreenSaver] Built universal bundle: ${outputDir}`)
}
