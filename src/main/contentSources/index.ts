import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { DEFAULT_WALLPAPER_ID, WallpaperItem } from '../../shared/types'
export type { WallpaperItem }

/**
 * Load the wallpaper catalog from the resources/catalog.json data file instead
 * of inlining 21K lines of data in a TypeScript source file.  The first entry's
 * id is normalised to DEFAULT_WALLPAPER_ID so the constant stays canonical.
 */
function loadCatalog(): WallpaperItem[] {
  const catalogPath = app.isPackaged
    ? path.join(process.resourcesPath, 'resources', 'catalog.json')
    : path.join(app.getAppPath(), 'resources', 'catalog.json')

  try {
    const raw = fs.readFileSync(catalogPath, 'utf8')
    const items: WallpaperItem[] = JSON.parse(raw)

    // Ensure the default wallpaper ID stays in sync with the shared constant
    if (items.length > 0 && items[0].id === 'wallpaperx-v8') {
      items[0].id = DEFAULT_WALLPAPER_ID
    }

    return items
  } catch (err) {
    console.error('[ContentSources] Failed to load catalog.json:', err)
    return []
  }
}

export const INITIAL_WALLPAPERS: WallpaperItem[] = loadCatalog()
