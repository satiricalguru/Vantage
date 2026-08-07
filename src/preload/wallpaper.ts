import { contextBridge, ipcRenderer } from 'electron'
import type { WallpaperItem } from '../shared/types'

contextBridge.exposeInMainWorld('wallpaperApi', {
  getInitialState: () => ipcRenderer.invoke('wallpaper:get-initial-state'),
  onWallpaperChange: (callback: (data: { wallpaper: WallpaperItem; displayId: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { wallpaper: WallpaperItem; displayId: number }) => callback(data)
    ipcRenderer.on('wallpaper:changed', handler)
    return () => ipcRenderer.removeListener('wallpaper:changed', handler)
  },
  onPerformanceModeChange: (callback: (mode: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, mode: string) => callback(mode)
    ipcRenderer.on('performance:mode-changed', handler)
    return () => ipcRenderer.removeListener('performance:mode-changed', handler)
  },
  onPlaybackStateChange: (callback: (isPlaying: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, isPlaying: boolean) => callback(isPlaying)
    ipcRenderer.on('playback:state-changed', handler)
    return () => ipcRenderer.removeListener('playback:state-changed', handler)
  },
  ensureCached: (url: string) => ipcRenderer.invoke('cache:ensure', url),
  onCacheProgress: (callback: (data: { url: string; received: number; total: number; pct: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { url: string; received: number; total: number; pct: number }) => callback(data)
    ipcRenderer.on('cache:progress', handler)
    return () => ipcRenderer.removeListener('cache:progress', handler)
  }
})
