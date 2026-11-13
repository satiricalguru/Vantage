import { create } from 'zustand'
import type { WallpaperItem, DisplayInfo } from '../../../shared/types'
export type { WallpaperItem, DisplayInfo }

export type FormatFilter = 'all' | 'video' | 'generative' | '4k'
export type SortMode = 'featured' | 'az' | 'resolution'
export type Density = 'comfy' | 'compact'
export type Screen = 'gallery' | 'settings' | 'credits'

export interface Toast {
  id: number
  message: string
  tone: 'ok' | 'error'
}

interface GalleryStore {
  activeCategory: string
  formatFilter: FormatFilter
  sortMode: SortMode
  density: Density
  searchQuery: string
  wallpapers: WallpaperItem[]
  counts: Record<string, number>
  displays: DisplayInfo[]
  selectedDisplayId: number | null
  selectedWallpaper: WallpaperItem | null
  activeScreen: Screen
  isLoading: boolean
  error: string | null
  toasts: Toast[]

  setActiveCategory: (cat: string) => void
  setFormatFilter: (filter: FormatFilter) => void
  setSortMode: (mode: SortMode) => void
  setDensity: (density: Density) => void
  setSearchQuery: (q: string) => void
  setSelectedDisplayId: (id: number) => void
  setSelectedWallpaper: (item: WallpaperItem | null) => void
  stepSelected: (dir: 1 | -1) => void
  setActiveScreen: (screen: Screen) => void
  fetchWallpapers: (silent?: boolean) => Promise<void>
  fetchCounts: () => Promise<void>
  fetchDisplays: () => Promise<void>
  applyWallpaper: (displayId: number, wallpaperId: string) => Promise<void>
  applyToAllDisplays: (wallpaperId: string) => Promise<void>
  shuffle: () => Promise<void>
  toggleFavorite: (wallpaperId: string, currentFav?: boolean) => Promise<void>
  deleteWallpaper: (wallpaperId: string) => Promise<void>
  importFile: () => Promise<void>
  openWallpaperFolder: () => Promise<void>
  toast: (message: string, tone?: Toast['tone']) => void
  dismissToast: (id: number) => void
}

let fetchSeq = 0
let toastSeq = 0
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

const readPref = <T extends string>(key: string, fallback: T, allowed: readonly T[]): T => {
  try {
    const v = localStorage.getItem(key) as T | null
    return v && allowed.includes(v) ? v : fallback
  } catch {
    return fallback
  }
}
const writePref = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* preferences are a convenience only */
  }
}

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : fallback)

/** Filtering and sorting that happen on the client after the DB query. */
export function visibleWallpapers(items: WallpaperItem[], format: FormatFilter, sort: SortMode): WallpaperItem[] {
  let list = items
  if (format === 'video') list = list.filter((i) => i.type === 'video')
  else if (format === 'generative') list = list.filter((i) => i.type === 'generative')
  else if (format === '4k') list = list.filter((i) => i.resolution.width >= 3840)
  if (sort === 'az') list = [...list].sort((a, b) => a.title.localeCompare(b.title))
  else if (sort === 'resolution') list = [...list].sort((a, b) => b.resolution.width * b.resolution.height - a.resolution.width * a.resolution.height)
  return list
}

export const resolutionLabel = (item: WallpaperItem): string =>
  item.type === 'generative' ? 'Live' : item.resolution.width >= 3840 ? '4K' : item.resolution.width >= 2560 ? '2K' : item.resolution.width >= 1920 ? 'HD' : `${item.resolution.height || 1080}p`

export const useGalleryStore = create<GalleryStore>((set, get) => ({
  activeCategory: 'all',
  formatFilter: 'all',
  sortMode: readPref<SortMode>('vantage.sort', 'featured', ['featured', 'az', 'resolution']),
  density: readPref<Density>('vantage.density', 'comfy', ['comfy', 'compact']),
  searchQuery: '',
  wallpapers: [],
  counts: {},
  displays: [],
  selectedDisplayId: null,
  selectedWallpaper: null,
  activeScreen: 'gallery',
  isLoading: false,
  error: null,
  toasts: [],

  setActiveCategory: (category) => {
    set({ activeCategory: category, formatFilter: category === 'videos' ? 'video' : 'all', activeScreen: 'gallery' })
    get().fetchWallpapers()
  },

  setFormatFilter: (filter) => set({ formatFilter: filter }),
  setSortMode: (mode) => {
    writePref('vantage.sort', mode)
    set({ sortMode: mode })
  },
  setDensity: (density) => {
    writePref('vantage.density', density)
    set({ density })
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query })
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(() => get().fetchWallpapers(), 220)
  },

  setSelectedDisplayId: (id) => set({ selectedDisplayId: id }),
  setSelectedWallpaper: (item) => set({ selectedWallpaper: item }),
  stepSelected: (dir) => {
    const { selectedWallpaper, wallpapers, formatFilter, sortMode } = get()
    if (!selectedWallpaper) return
    const list = visibleWallpapers(wallpapers, formatFilter, sortMode)
    const idx = list.findIndex((w) => w.id === selectedWallpaper.id)
    if (idx === -1 || list.length < 2) return
    set({ selectedWallpaper: list[(idx + dir + list.length) % list.length] })
  },
  setActiveScreen: (screen) => set({ activeScreen: screen }),

  fetchWallpapers: async (silent = false) => {
    const seq = ++fetchSeq
    if (!silent) set({ isLoading: true, error: null })
    if (!window.galleryApi) {
      if (seq === fetchSeq) set({ isLoading: false })
      return
    }
    try {
      const items = await window.galleryApi.getWallpapers(get().activeCategory, get().searchQuery)
      if (seq === fetchSeq) set({ wallpapers: items, isLoading: false })
    } catch (error) {
      if (seq === fetchSeq) set({ isLoading: false, error: errorMessage(error, 'Unable to load wallpapers.') })
    }
  },

  fetchCounts: async () => {
    try {
      const counts = await window.galleryApi?.getCategoryCounts?.()
      if (counts) set({ counts })
    } catch {
      /* counts are decorative */
    }
  },

  fetchDisplays: async () => {
    if (!window.galleryApi) return
    try {
      const list = await window.galleryApi.getDisplays()
      const current = get().selectedDisplayId
      set({
        displays: list,
        selectedDisplayId: current && list.some((d) => d.id === current) ? current : (list[0]?.id ?? null)
      })
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to read displays.') })
    }
  },

  applyWallpaper: async (displayId, wallpaperId) => {
    if (!window.galleryApi) return
    try {
      await window.galleryApi.applyToDisplay(displayId, wallpaperId)
      await get().fetchDisplays()
      const display = get().displays.find((d) => d.id === displayId)
      const item = get().wallpapers.find((w) => w.id === wallpaperId)
      get().toast(`${item?.title ?? 'Wallpaper'} → ${display?.label ?? 'display'}`)
    } catch (error) {
      get().toast(errorMessage(error, 'Unable to apply wallpaper.'), 'error')
    }
  },

  applyToAllDisplays: async (wallpaperId) => {
    if (!window.galleryApi) return
    try {
      await Promise.all(get().displays.map((d) => window.galleryApi!.applyToDisplay(d.id, wallpaperId)))
      await get().fetchDisplays()
      get().toast(`Applied to all ${get().displays.length} displays`)
    } catch (error) {
      get().toast(errorMessage(error, 'Unable to apply wallpaper to all displays.'), 'error')
    }
  },

  shuffle: async () => {
    const { wallpapers, formatFilter, sortMode, selectedDisplayId, displays } = get()
    const list = visibleWallpapers(wallpapers, formatFilter, sortMode)
    const displayId = selectedDisplayId ?? displays[0]?.id
    if (!list.length || displayId == null) return
    const current = displays.find((d) => d.id === displayId)?.assignedWallpaperId
    const pool = list.length > 1 ? list.filter((w) => w.id !== current) : list
    const pick = pool[Math.floor(Math.random() * pool.length)]
    await get().applyWallpaper(displayId, pick.id)
  },

  toggleFavorite: async (wallpaperId, currentFav) => {
    if (!window.galleryApi) return
    // Optimistic update so the heart responds instantly.
    const flip = (w: WallpaperItem) => (w.id === wallpaperId ? { ...w, is_favorite: !currentFav } : w)
    set((s) => ({
      wallpapers: s.wallpapers.map(flip),
      selectedWallpaper: s.selectedWallpaper ? flip(s.selectedWallpaper) : null
    }))
    try {
      await window.galleryApi.toggleFavorite(wallpaperId, !currentFav)
      if (get().activeCategory === 'favorites') await get().fetchWallpapers(true)
      get().fetchCounts()
    } catch (error) {
      set((s) => ({ wallpapers: s.wallpapers.map((w) => (w.id === wallpaperId ? { ...w, is_favorite: currentFav } : w)) }))
      get().toast(errorMessage(error, 'Unable to update favorite.'), 'error')
    }
  },

  deleteWallpaper: async (wallpaperId) => {
    if (!window.galleryApi) return
    try {
      await window.galleryApi.deleteWallpaper(wallpaperId)
      if (get().selectedWallpaper?.id === wallpaperId) set({ selectedWallpaper: null })
      await get().fetchWallpapers(true)
      get().fetchCounts()
      get().toast('Removed from your library')
    } catch (error) {
      get().toast(errorMessage(error, 'Unable to delete wallpaper.'), 'error')
    }
  },

  importFile: async () => {
    if (!window.galleryApi) return
    try {
      const newItem = await window.galleryApi.importFile()
      if (newItem) {
        await get().fetchWallpapers()
        get().fetchCounts()
        set({ selectedWallpaper: newItem })
        get().toast(`Imported ${newItem.title}`)
      }
    } catch (error) {
      get().toast(errorMessage(error, 'Unable to import wallpaper.'), 'error')
    }
  },

  openWallpaperFolder: async () => {
    if (!window.galleryApi) return
    try {
      await window.galleryApi.openFolder()
      const added = await window.galleryApi.scanLocalFolder()
      await get().fetchWallpapers()
      get().fetchCounts()
      if (added > 0) get().toast(`Found ${added} new file${added === 1 ? '' : 's'}`)
    } catch (error) {
      get().toast(errorMessage(error, 'Unable to scan wallpaper folder.'), 'error')
    }
  },

  toast: (message, tone = 'ok') => {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, tone }] }))
    setTimeout(() => get().dismissToast(id), 3200)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))
