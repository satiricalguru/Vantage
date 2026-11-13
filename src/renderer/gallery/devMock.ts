/**
 * Browser-only mock of window.galleryApi so the gallery UI can be developed and
 * screenshotted with `npm run preview:ui` (no Electron). Never bundled into the app:
 * main.tsx only imports it when galleryApi is missing in a dev build.
 */
import type { WallpaperItem, DisplayInfo, AppSettings } from '../../shared/types'

declare const __CATALOG_ROOT__: string

export async function installDevMock(): Promise<void> {
  const catalog: WallpaperItem[] = await fetch(`/@fs${__CATALOG_ROOT__}/resources/catalog.json`).then((r) => r.json())
  const items = catalog.map((i) => ({
    ...i,
    previewUrl: i.previewUrl ? `/@fs${__CATALOG_ROOT__}/${i.previewUrl}` : '',
    is_favorite: false
  }))
  const favs = new Set<string>()
  const displays: DisplayInfo[] = [
    { id: 1, label: 'Built-in Retina Display', bounds: { x: 0, y: 0, width: 1512, height: 982 }, scaleFactor: 2, assignedWallpaperId: 'gen-iris-bloom', performanceMode: 'balanced' },
    { id: 2, label: 'Studio Display', bounds: { x: 1512, y: 0, width: 2560, height: 1440 }, scaleFactor: 2, assignedWallpaperId: items[5]?.id ?? null, performanceMode: 'quality' }
  ]
  let settings: AppSettings = { openAtLogin: true, showInDock: false, maxCacheSizeGb: 5, theme: 'dark' }
  const listeners: Array<(d: DisplayInfo[]) => void> = []

  const filter = (category?: string, query?: string) =>
    items
      .map((i) => ({ ...i, is_favorite: favs.has(i.id) }))
      .filter((i) => (category === 'favorites' ? i.is_favorite : !category || category === 'all' ? true : i.category === category))
      .filter((i) => !query || `${i.title} ${i.category}`.toLowerCase().includes(query.toLowerCase()))

  window.galleryApi = {
    getWallpapers: async (c, q) => filter(c, q),
    getCategoryCounts: async () => {
      const counts: Record<string, number> = { all: items.length, favorites: favs.size, static: 0 }
      items.forEach((i) => (counts[i.category] = (counts[i.category] || 0) + 1))
      return counts
    },
    applyToDisplay: async (displayId, wallpaperId) => {
      const d = displays.find((x) => x.id === displayId)
      if (d) d.assignedWallpaperId = wallpaperId
      listeners.forEach((l) => l(displays))
      return true
    },
    toggleFavorite: async (id, fav) => (fav ? favs.add(id) : favs.delete(id), true),
    deleteWallpaper: async () => true,
    getDisplays: async () => displays.map((d) => ({ ...d })),
    getSettings: async () => settings,
    setSettings: async (p) => ((settings = { ...settings, ...p }), true),
    setupScreenSaver: async () => ({ path: '' }),
    setPerformanceMode: async (id, mode) => {
      const d = displays.find((x) => x.id === id)
      if (d) d.performanceMode = mode
      return true
    },
    importFile: async () => null,
    openFolder: async () => '',
    scanLocalFolder: async () => 0,
    clearCache: async () => 0,
    freeUpMemory: async () => ({ freedMb: 42 }),
    getCacheStatus: async () => ({ usedBytes: 1.3e9, count: 12, limitBytes: 5 * 1024 ** 3 }),
    setLoginAtLogin: async () => true,
    openExternal: (url) => window.open(url, '_blank'),
    onDisplayChanged: (cb) => (listeners.push(cb), () => undefined),
    onCatalogChanged: () => () => undefined,
    minimizeWindow: async () => undefined,
    closeWindow: async () => undefined
  }
}
