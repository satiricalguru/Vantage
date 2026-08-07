import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, DisplayInfo } from '../shared/types'

contextBridge.exposeInMainWorld('galleryApi', {
  getWallpapers: (category?: string, query?: string) =>
    ipcRenderer.invoke('wallpaper:list', { category, query }),
  applyToDisplay: (displayId: number, wallpaperId: string) =>
    ipcRenderer.invoke('wallpaper:apply-to-display', { displayId, wallpaperId }),
  toggleFavorite: (wallpaperId: string, isFavorite: boolean) =>
    ipcRenderer.invoke('wallpaper:favorite', { wallpaperId, isFavorite }),
  getDisplays: () => ipcRenderer.invoke('display:list'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial: Partial<AppSettings>) => ipcRenderer.invoke('settings:set', partial),
  setPerformanceMode: (displayId: number, mode: string) =>
    ipcRenderer.invoke('performance:set-mode', { displayId, mode }),
  importFile: () => ipcRenderer.invoke('import:file'),
  openFolder: () => ipcRenderer.invoke('wallpaper:open-folder'),
  scanLocalFolder: () => ipcRenderer.invoke('wallpaper:scan-local-folder'),
  clearCache: () => ipcRenderer.invoke('cache:clear'),
  getCacheStatus: () => ipcRenderer.invoke('cache:status'),
  setLoginAtLogin: (openAtLogin: boolean) =>
    ipcRenderer.invoke('settings:set-login-at-login', openAtLogin),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  onDisplayChanged: (callback: (displays: DisplayInfo[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, displays: DisplayInfo[]) => callback(displays)
    ipcRenderer.on('display:changed', handler)
    return () => ipcRenderer.removeListener('display:changed', handler)
  },
  onCatalogChanged: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('catalog:changed', handler)
    return () => ipcRenderer.removeListener('catalog:changed', handler)
  },
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  closeWindow: () => ipcRenderer.invoke('window:close')
})
