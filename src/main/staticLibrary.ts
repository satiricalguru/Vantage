import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import type { WallpaperItem } from '../shared/types'
import { addWallpaperToDb, pruneStaticWallpapers, getWallpaperById } from './db'
import { toMediaUrl } from './mediaUrl'
import { getMediaDimensions } from './mediaInfo'

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']

interface ScannedImage {
  filePath: string
  name: string
}

export interface StaticManifest {
  items: WallpaperItem[]
  presentIds: string[]
}

/** Folders that back the Static Wallpapers catalog:
 *  - the bundled thumbnail preview collection (resources/thumbnails)
 *  - the extracted Wallpaper X `Papers` folder checked out next to the app
 *  - a user drop-in `Static` folder inside the managed Vantage Wallpapers folder
 */
export function getStaticSourceDirs(): string[] {
  const dirs: string[] = []

  const appRoot = app.isPackaged ? process.resourcesPath : app.getAppPath()
  const bundledThumbs = path.join(appRoot, 'resources', 'thumbnails')
  if (fs.existsSync(bundledThumbs)) {
    dirs.push(bundledThumbs)
  }

  const extractedPapers = path.join(appRoot, 'Extracted_Video_Wallpapers', 'Papers')
  if (fs.existsSync(extractedPapers)) {
    dirs.push(extractedPapers)
  }

  const dropIn = path.join(app.getPath('pictures'), 'Vantage Wallpapers', 'Static')
  try {
    // Create the drop-in directory once so it is also watched when the user
    // adds it after the first launch.
    fs.mkdirSync(dropIn, { recursive: true })
    dirs.push(dropIn)
  } catch {
    // The user may have denied access to Pictures; keep the bundled source
    // available and let the caller report any watch failure.
  }

  return dirs
}

export function isStaticSourcePath(filePath: string): boolean {
  const resolved = path.resolve(filePath).toLowerCase()
  return getStaticSourceDirs().some((dir) =>
    resolved.startsWith(path.resolve(dir).toLowerCase() + path.sep)
  )
}

function scanDir(dir: string): ScannedImage[] {
  let files: string[]
  try {
    files = fs.readdirSync(dir)
  } catch {
    return []
  }

  return files
    .filter((f) => !f.startsWith('.'))
    .filter((f) => IMAGE_EXTS.includes(path.extname(f).toLowerCase()))
    .map((f) => {
      const filePath = path.join(dir, f)
      try {
        const stat = fs.statSync(filePath, { throwIfNoEntry: false })
        if (!stat || !stat.isFile()) return null
        return { filePath, name: f }
      } catch {
        return null
      }
    })
    .filter((f): f is ScannedImage => Boolean(f))
}

/** Scan all static source folders into a manifest of WallpaperItems */
export async function buildStaticManifest(): Promise<StaticManifest> {
  const items: WallpaperItem[] = []
  const presentIds: string[] = []
  const seen = new Set<string>()

  const tasks: Array<{ filePath: string; id: string; base: string; license: string; attribution: string }> = []

  for (const dir of getStaticSourceDirs()) {
    const { license, attribution } = licenseAndAttribution(dir)
    for (const entry of scanDir(dir)) {
      const base = entry.name.replace(/\.[^/.]+$/, '')
      const safeDir = path.basename(dir).replace(/[^a-zA-Z0-9_-]/g, '_')
      const safeBase = base.replace(/[^a-zA-Z0-9_-]/g, '_')
      const id = `static-${safeDir}-${safeBase}`
      if (seen.has(id)) continue
      seen.add(id)
      presentIds.push(id)
      tasks.push({ filePath: entry.filePath, id, base, license, attribution })
    }
  }

  // Probe image dimensions with a small worker pool (header reads are cheap,
  // but hundreds of files should not serialize into a slow startup).
  const CONCURRENCY = 6
  let cursor = 0
  const workers = Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor++]
      const dims = await getMediaDimensions(task.filePath)
      items.push({
        id: task.id,
        title: task.base,
        category: 'static',
        type: 'image',
        previewUrl: toMediaUrl(task.filePath),
        sourceUrl: toMediaUrl(task.filePath),
        resolution: dims,
        source: 'static',
        license: task.license,
        attribution: task.attribution
      })
    }
  })
  await Promise.all(workers)

  return { items, presentIds }
}

function licenseAndAttribution(dir: string): { license: string; attribution: string } {
  const base = path.basename(dir).toLowerCase()
  if (base === 'thumbnails') {
    return {
      license: 'Vantage Bundled Preview Collection',
      attribution: 'Previews bundled with Vantage (motionBGS catalog)'
    }
  }
  return {
    license: 'Wallpaper X Extracted Collection',
    attribution: 'Extracted from Wallpaper X (user-owned)'
  }
}

/** Add any new static wallpapers to the DB and prune removed ones */
export async function syncStaticWallpapers(): Promise<number> {
  const { items, presentIds } = await buildStaticManifest()
  let added = 0
  for (const item of items) {
    if (!getWallpaperById(item.id)) added++
    // Re-sync paths and metadata as well as registering new files. This also
    // repairs records created before media URL escaping was introduced.
    addWallpaperToDb(item)
  }
  pruneStaticWallpapers(presentIds)
  return added
}
