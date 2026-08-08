// Shared type definitions used across main, preload, and renderer processes

export type WallpaperType = 'video' | 'generative' | 'user-import' | 'image' | string
export type WallpaperCategory = 'all' | 'anime' | 'games' | 'nature' | 'generative' | 'imported' | 'videos' | 'static' | string
export type WallpaperSource = 'local' | 'custom' | 'user' | 'static' | 'pexels' | 'unsplash' | string
export type PerformanceMode = 'quality' | 'balanced' | 'battery-saver' | 'pause' | string

export interface WallpaperItem {
  id: string
  title: string
  category: WallpaperCategory
  type: WallpaperType
  previewUrl: string
  sourceUrl: string
  resolution: { width: number; height: number }
  duration?: number
  source: WallpaperSource
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
  performanceMode: PerformanceMode
}

export interface AppSettings {
  openAtLogin: boolean
  showInDock: boolean
  maxCacheSizeGb: number
  theme: 'dark' | 'light' | 'system' | string
}

export interface CacheStatus {
  usedBytes: number
  count: number
  limitBytes: number
}

/** The default wallpaper ID used when no assignment exists */
export const DEFAULT_WALLPAPER_ID = 'motionbgs-celestial-veil'

/** Settings keys that the renderer is allowed to write via IPC */
export const ALLOWED_SETTINGS_KEYS: ReadonlySet<string> = new Set([
  'showInDock',
  'maxCacheSizeGb',
  'theme',
  'openAtLogin'
])
