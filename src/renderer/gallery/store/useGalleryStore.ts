import { create } from 'zustand'
import type { WallpaperItem, DisplayInfo } from '../../../shared/types'
export type { WallpaperItem, DisplayInfo }

interface GalleryStore {
  activeCategory: string
  formatFilter: 'all' | 'video'
  searchQuery: string
  wallpapers: WallpaperItem[]
  displays: DisplayInfo[]
  selectedDisplayId: number | null
  selectedWallpaper: WallpaperItem | null
  activeScreen: 'gallery' | 'settings' | 'credits'
  isLoading: boolean
  error: string | null

  setActiveCategory: (cat: string) => void
  setFormatFilter: (filter: 'all' | 'video') => void
  setSearchQuery: (q: string) => void
  setSelectedDisplayId: (id: number) => void
  setSelectedWallpaper: (item: WallpaperItem | null) => void
  setActiveScreen: (screen: 'gallery' | 'settings' | 'credits') => void
  fetchWallpapers: (silent?: boolean) => Promise<void>
  fetchDisplays: () => Promise<void>
  applyWallpaper: (displayId: number, wallpaperId: string) => Promise<void>
  toggleFavorite: (wallpaperId: string, currentFav?: boolean) => Promise<void>
  deleteWallpaper: (wallpaperId: string) => Promise<void>
  importFile: () => Promise<void>
  openWallpaperFolder: () => Promise<void>
}

let fetchSeq = 0
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

export const useGalleryStore = create<GalleryStore>((set, get) => ({
  activeCategory: 'all',
  formatFilter: 'all',
  searchQuery: '',
  wallpapers: [],
  displays: [],
  selectedDisplayId: null,
  selectedWallpaper: null,
  activeScreen: 'gallery',
  isLoading: false,
  error: null,

  setActiveCategory: (category) => {
    let fmt: 'all' | 'video' = 'all'
    if (category === 'videos') fmt = 'video'
    set({ activeCategory: category, formatFilter: fmt })
    get().fetchWallpapers()
  },

  setFormatFilter: (filter) => {
    set({ formatFilter: filter })
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query })
    // Debounce search to avoid a DB query per keystroke
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(() => {
      get().fetchWallpapers()
    }, 250)
  },

  setSelectedDisplayId: (id) => set({ selectedDisplayId: id }),
  setSelectedWallpaper: (item) => set({ selectedWallpaper: item }),
  setActiveScreen: (screen) => set({ activeScreen: screen }),

  fetchWallpapers: async (silent = false) => {
    const seq = ++fetchSeq
    if (!silent) {
      set({ isLoading: true, error: null })
    }
    if (window.galleryApi) {
      try {
        const items = await window.galleryApi.getWallpapers(
          get().activeCategory,
          get().searchQuery
        )
        if (seq === fetchSeq) {
          set({ wallpapers: items, isLoading: false })
        }
      } catch (error) {
        if (seq === fetchSeq) {
          set({ isLoading: false, error: error instanceof Error ? error.message : 'Unable to load wallpapers.' })
        }
      }
    } else {
      if (seq === fetchSeq) set({ isLoading: false })
    }
  },

  fetchDisplays: async () => {
    if (window.galleryApi) {
      try {
        const list = await window.galleryApi.getDisplays()
        set({
          displays: list,
          selectedDisplayId: get().selectedDisplayId || (list[0]?.id ?? null)
        })
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Unable to read displays.' })
      }
    }
  },

  applyWallpaper: async (displayId, wallpaperId) => {
    if (window.galleryApi) {
      try {
        await window.galleryApi.applyToDisplay(displayId, wallpaperId)
        await get().fetchDisplays()
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Unable to apply wallpaper.' })
      }
    }
  },

  toggleFavorite: async (wallpaperId, currentFav) => {
    if (window.galleryApi) {
      try {
        await window.galleryApi.toggleFavorite(wallpaperId, !currentFav)
        await get().fetchWallpapers(true)
        const updated = get().wallpapers.find((w) => w.id === wallpaperId)
        const selected = get().selectedWallpaper
        if (selected && updated && selected.id === wallpaperId) {
          set({ selectedWallpaper: { ...selected, ...updated } })
        }
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Unable to update favorite.' })
      }
    }
  },

  deleteWallpaper: async (wallpaperId) => {
    if (window.galleryApi) {
      try {
        await window.galleryApi.deleteWallpaper(wallpaperId)
        if (get().selectedWallpaper?.id === wallpaperId) {
          set({ selectedWallpaper: null })
        }
        await get().fetchWallpapers(true)
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Unable to delete wallpaper.' })
      }
    }
  },

  importFile: async () => {
    if (window.galleryApi) {
      try {
        const newItem = await window.galleryApi.importFile()
        if (newItem) {
          await get().fetchWallpapers()
          set({ selectedWallpaper: newItem })
        }
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Unable to import wallpaper.' })
      }
    }
  },

  openWallpaperFolder: async () => {
    if (window.galleryApi) {
      try {
        await window.galleryApi.openFolder()
        await window.galleryApi.scanLocalFolder()
        await get().fetchWallpapers()
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Unable to scan wallpaper folder.' })
      }
    }
  }
}))
