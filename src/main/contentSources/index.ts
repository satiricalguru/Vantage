import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { DEFAULT_WALLPAPER_ID, WallpaperItem } from '../../shared/types'
export type { WallpaperItem }

/**
 * Last-resort catalog used when resources/catalog.json is missing or corrupt.
 * Keeps the app fully functional (default wallpaper, gallery) instead of
 * bricking into a black screen and a dangling DEFAULT_WALLPAPER_ID.
 */
function fallbackCatalog(): WallpaperItem[] {
  console.error('[ContentSources] Using minimal fallback catalog.')
  return [
    {
      id: DEFAULT_WALLPAPER_ID,
      title: 'Vantage Default',
      category: 'featured',
      type: 'video',
      source: 'local',
      license: 'Vantage Default',
      attribution: 'Vantage Team',
      previewUrl: '',
      sourceUrl: 'extracted/v8.mp4',
      resolution: { width: 1920, height: 1080 },
      duration: 0
    }
  ]
}

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
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      console.error('[ContentSources] catalog.json is not an array of items.')
      return fallbackCatalog()
    }
    const items = parsed as WallpaperItem[]

    // Ensure the default wallpaper ID stays in sync with the shared constant
    if (items.length > 0 && items[0] && items[0].id === 'wallpaperx-v8') {
      items[0].id = DEFAULT_WALLPAPER_ID
    }

    return items
  } catch (err) {
    console.error('[ContentSources] Failed to load catalog.json:', err)
    return fallbackCatalog()
  }
}

export const INITIAL_WALLPAPERS: WallpaperItem[] = loadCatalog()