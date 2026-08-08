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
 *  - the extracted Wallpaper X `Papers` folder checked out next to the app
 *  - a user drop-in `Static` folder inside the managed Vantage Wallpapers folder
 */
export function getStaticSourceDirs(): string[] {
  const dirs: string[] = []

  const dropIn = path.join(app.getPath('pictures'), 'Vantage Wallpapers', 'Static')
  try {
    // Create the drop-in directory once so it is also watched when the user
    // adds it after the first launch.
    fs.mkdirSync(dropIn, { recursive: true })
    dirs.push(dropIn)
  } catch {
    // Access denied to Pictures
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

  for (const dir of getStaticSourceDirs()) {
    for (const entry of scanDir(dir)) {
      const base = entry.name.replace(/\.[^/.]+$/, '')
      const safeDir = path.basename(dir).replace(/[^a-zA-Z0-9_-]/g, '_')
      const safeBase = base.replace(/[^a-zA-Z0-9_-]/g, '_')
      const id = `static-${safeDir}-${safeBase}`
      if (seen.has(id)) continue
      seen.add(id)
      presentIds.push(id)

      const dims = await getMediaDimensions(entry.filePath)
      items.push({
        id,
        title: base,
        category: 'static',
        type: 'image',
        previewUrl: toMediaUrl(entry.filePath),
        sourceUrl: toMediaUrl(entry.filePath),
        resolution: dims,
        source: 'static',
        license: 'Wallpaper X Extracted Collection',
        attribution: 'Extracted from Wallpaper X (user-owned)'
      })
    }
  }

  return { items, presentIds }
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
