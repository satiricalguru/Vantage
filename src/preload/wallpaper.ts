import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('wallpaperApi', {
  getInitialState: () => ipcRenderer.invoke('wallpaper:get-initial-state'),
  onWallpaperChange: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('wallpaper:changed', handler)
    return () => ipcRenderer.removeListener('wallpaper:changed', handler)
  },
  onPerformanceModeChange: (callback: (mode: string) => void) => {
    const handler = (_event: any, mode: string) => callback(mode)
    ipcRenderer.on('performance:mode-changed', handler)
    return () => ipcRenderer.removeListener('performance:mode-changed', handler)
  },
  onPlaybackStateChange: (callback: (isPlaying: boolean) => void) => {
    const handler = (_event: any, isPlaying: boolean) => callback(isPlaying)
    ipcRenderer.on('playback:state-changed', handler)
    return () => ipcRenderer.removeListener('playback:state-changed', handler)
  }
})
