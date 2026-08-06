// Shared type definitions used across main, preload, and renderer processes

export interface WallpaperItem {
  id: string
  title: string
  category: string
  type: string
  previewUrl: string
  sourceUrl: string
  resolution: { width: number; height: number }
  duration?: number
  source: string
  license: string
  attribution?: string
  colorPalette?: string[]
  generatorId?: string
  is_favorite?: boolean
}

export interface DisplayInfo {
  id: number
  label: string
  bounds: { x: number; y: number; width: number; height: number }
  scaleFactor: number
  assignedWallpaperId: string | null
  performanceMode: string
}

export interface AppSettings {
  openAtLogin: boolean
  showInDock: boolean
  showOnLockScreen: boolean
  pexelsApiKey?: string
  unsplashApiKey?: string
  maxCacheSizeGb: number
  theme: string
}

export interface CacheStatus {
  usedBytes: number
  count: number
  limitBytes: number
}

/** The default wallpaper ID used when no assignment exists */
export const DEFAULT_WALLPAPER_ID = 'local-v8'

/** Settings keys that the renderer is allowed to write via IPC */
export const ALLOWED_SETTINGS_KEYS: ReadonlySet<string> = new Set([
  'showInDock',
  'showOnLockScreen',
  'maxCacheSizeGb',
  'theme',
  'openAtLogin'
])
