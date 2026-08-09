import type { WallpaperItem, DisplayInfo, AppSettings, CacheStatus, PerformanceMode } from '../shared/types'

declare global {
  interface Window {
    galleryApi?: {
      getWallpapers: (category?: string, query?: string) => Promise<WallpaperItem[]>
      applyToDisplay: (displayId: number, wallpaperId: string) => Promise<boolean>
      toggleFavorite: (wallpaperId: string, isFavorite: boolean) => Promise<boolean>
      deleteWallpaper: (wallpaperId: string) => Promise<boolean>
      getDisplays: () => Promise<DisplayInfo[]>
      getSettings: () => Promise<AppSettings>
      setSettings: (partial: Partial<AppSettings>) => Promise<boolean>
      setupScreenSaver: () => Promise<{ path: string }>
      setPerformanceMode: (displayId: number, mode: PerformanceMode) => Promise<boolean>
      importFile: () => Promise<WallpaperItem | null>
      openFolder: () => Promise<string>
      scanLocalFolder: () => Promise<number>
      clearCache: () => Promise<number>
      freeUpMemory?: () => Promise<{ freedMb: number }>
      getCacheStatus: () => Promise<CacheStatus>
      setLoginAtLogin: (openAtLogin: boolean) => Promise<boolean>
      openExternal: (url: string) => void
      onDisplayChanged: (callback: (displays: DisplayInfo[]) => void) => () => void
      onCatalogChanged: (callback: () => void) => () => void
      minimizeWindow: () => Promise<void>
      closeWindow: () => Promise<void>
    }
    wallpaperApi?: {
      getInitialState: () => Promise<{ wallpaper: WallpaperItem | null; performanceMode: PerformanceMode; isPlaying: boolean }>
      onWallpaperChange: (callback: (data: { wallpaper: WallpaperItem; displayId: number }) => void) => () => void
      onPerformanceModeChange: (callback: (mode: PerformanceMode) => void) => () => void
      onPlaybackStateChange: (callback: (isPlaying: boolean) => void) => () => void
      ensureCached: (url: string) => Promise<string>
      onCacheProgress: (callback: (data: { url: string; received: number; total: number; pct: number }) => void) => () => void
      onMemoryPurge?: (callback: () => void) => () => void
    }
  }
}
