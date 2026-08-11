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

function isWallpaperItem(value: unknown): value is WallpaperItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  const resolution = item.resolution
  if (!resolution || typeof resolution !== 'object' || Array.isArray(resolution)) return false
  const dimensions = resolution as Record<string, unknown>
  const requiredStrings = ['id', 'title', 'category', 'type', 'source', 'license', 'previewUrl', 'sourceUrl']
  if (!requiredStrings.every((key) => typeof item[key] === 'string')) return false
  if (!Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.height) || Number(dimensions.width) <= 0 || Number(dimensions.height) <= 0) return false
  if (item.duration !== undefined && (!Number.isFinite(item.duration) || Number(item.duration) < 0)) return false
  if (item.attribution !== undefined && typeof item.attribution !== 'string') return false
  if (item.generatorId !== undefined && typeof item.generatorId !== 'string') return false
  return item.colorPalette === undefined || (Array.isArray(item.colorPalette) && item.colorPalette.every((color) => typeof color === 'string'))
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
    const items = parsed.filter(isWallpaperItem)
    if (items.length !== parsed.length) {
      console.warn(`[ContentSources] Ignored ${parsed.length - items.length} malformed catalog item(s).`)
    }

    // Ensure the default wallpaper ID stays in sync with the shared constant.
    // A catalog without a valid default would leave assignments dangling, so use
    // the minimal known-good catalog instead.
    const normalized = items.map((item) =>
      item.id === 'wallpaperx-v8' ? { ...item, id: DEFAULT_WALLPAPER_ID } : item
    )
    if (!normalized.some((item) => item.id === DEFAULT_WALLPAPER_ID)) {
      console.error('[ContentSources] catalog.json has no valid default wallpaper.')
      return fallbackCatalog()
    }

    return normalized
  } catch (err) {
    console.error('[ContentSources] Failed to load catalog.json:', err)
    return fallbackCatalog()
  }
}

export const INITIAL_WALLPAPERS: WallpaperItem[] = loadCatalog()