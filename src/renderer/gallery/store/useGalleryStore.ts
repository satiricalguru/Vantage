import { create } from 'zustand'

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

interface GalleryStore {
  activeCategory: string
  formatFilter: 'all' | 'video' | 'still'
  searchQuery: string
  wallpapers: WallpaperItem[]
  displays: DisplayInfo[]
  selectedDisplayId: number | null
  selectedWallpaper: WallpaperItem | null
  activeScreen: 'gallery' | 'settings' | 'credits'
  isLoading: boolean

  setActiveCategory: (cat: string) => void
  setFormatFilter: (filter: 'all' | 'video' | 'still') => void
  setSearchQuery: (q: string) => void
  setSelectedDisplayId: (id: number) => void
  setSelectedWallpaper: (item: WallpaperItem | null) => void
  setActiveScreen: (screen: 'gallery' | 'settings' | 'credits') => void
  fetchWallpapers: () => Promise<void>
  fetchDisplays: () => Promise<void>
  applyWallpaper: (displayId: number, wallpaperId: string) => Promise<void>
  toggleFavorite: (wallpaperId: string, currentFav?: boolean) => Promise<void>
  importFile: () => Promise<void>
  openWallpaperFolder: () => Promise<void>
}

let fetchSeq = 0

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

  setActiveCategory: (category) => {
    let fmt: 'all' | 'video' | 'still' = 'all'
    if (category === 'videos') fmt = 'video'
    if (category === 'stills') fmt = 'still'
    set({ activeCategory: category, formatFilter: fmt })
    get().fetchWallpapers()
  },

  setFormatFilter: (filter) => {
    set({ formatFilter: filter })
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query })
    get().fetchWallpapers()
  },

  setSelectedDisplayId: (id) => set({ selectedDisplayId: id }),
  setSelectedWallpaper: (item) => set({ selectedWallpaper: item }),
  setActiveScreen: (screen) => set({ activeScreen: screen }),

  fetchWallpapers: async () => {
    const seq = ++fetchSeq
    set({ isLoading: true })
    if (window.galleryApi) {
      await window.galleryApi.scanLocalFolder()
      const items = await window.galleryApi.getWallpapers(
        get().activeCategory,
        get().searchQuery
      )
      if (seq === fetchSeq) {
        set({ wallpapers: items, isLoading: false })
      }
    } else {
      if (seq === fetchSeq) set({ isLoading: false })
    }
  },

  fetchDisplays: async () => {
    if (window.galleryApi) {
      const list = await window.galleryApi.getDisplays()
      set({
        displays: list,
        selectedDisplayId: get().selectedDisplayId || (list[0]?.id ?? null)
      })
    }
  },

  applyWallpaper: async (displayId, wallpaperId) => {
    if (window.galleryApi) {
      await window.galleryApi.applyToDisplay(displayId, wallpaperId)
      await get().fetchDisplays()
    }
  },

  toggleFavorite: async (wallpaperId, currentFav) => {
    if (window.galleryApi) {
      await window.galleryApi.toggleFavorite(wallpaperId, !currentFav)
      await get().fetchWallpapers()
      const updated = get().wallpapers.find((w) => w.id === wallpaperId)
      const selected = get().selectedWallpaper
      if (selected && updated && selected.id === wallpaperId) {
        set({ selectedWallpaper: { ...selected, ...updated } })
      }
    }
  },

  importFile: async () => {
    if (window.galleryApi) {
      const newItem = await window.galleryApi.importFile()
      if (newItem) {
        await get().fetchWallpapers()
        set({ selectedWallpaper: newItem })
      }
    }
  },

  openWallpaperFolder: async () => {
    if (window.galleryApi) {
      await window.galleryApi.openFolder()
      await window.galleryApi.scanLocalFolder()
      await get().fetchWallpapers()
    }
  }
}))
