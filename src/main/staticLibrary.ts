import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import type { WallpaperItem } from '../shared/types'
import { addWallpaperToDb, pruneStaticWallpapers, getWallpaperById } from './db'

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

  const appRoot = app.isPackaged ? process.resourcesPath : app.getAppPath()
  const extractedPapers = path.join(appRoot, 'Extracted_Video_Wallpapers', 'Papers')
  if (fs.existsSync(extractedPapers)) {
    dirs.push(extractedPapers)
  }

  const dropIn = path.join(app.getPath('pictures'), 'Vantage Wallpapers', 'Static')
  if (fs.existsSync(dropIn)) {
    dirs.push(dropIn)
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
      const stat = fs.statSync(filePath, { throwIfNoEntry: false })
      if (!stat || !stat.isFile()) return null
      return { filePath, name: f }
    })
    .filter((f): f is ScannedImage => Boolean(f))
}

/** Scan all static source folders into a manifest of WallpaperItems */
export function buildStaticManifest(): StaticManifest {
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

      items.push({
        id,
        title: base,
        category: 'static',
        type: 'image',
        previewUrl: `media://${entry.filePath}`,
        sourceUrl: `media://${entry.filePath}`,
        resolution: { width: 3840, height: 2160 },
        source: 'static',
        license: 'Wallpaper X Extracted Collection',
        attribution: 'Extracted from Wallpaper X (user-owned)'
      })
    }
  }

  return { items, presentIds }
}

/** Add any new static wallpapers to the DB and prune removed ones */
export function syncStaticWallpapers(): number {
  const { items, presentIds } = buildStaticManifest()
  let added = 0
  for (const item of items) {
    if (!getWallpaperById(item.id)) {
      addWallpaperToDb(item)
      added++
    }
  }
  pruneStaticWallpapers(presentIds)
  return added
}