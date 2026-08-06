import React, { useEffect, useState } from 'react'
import { VideoLayer } from './VideoLayer'
import { GenerativeLayer } from './GenerativeLayer'
import { AiStillLayer } from './AiStillLayer'
import type { WallpaperItem } from '../../shared/types'

declare global {
  interface Window {
    wallpaperApi: {
      getInitialState: () => Promise<{ wallpaper: WallpaperItem | null; performanceMode: string; isPlaying: boolean }>
      onWallpaperChange: (callback: (data: { wallpaper: WallpaperItem; displayId: number }) => void) => () => void
      onPerformanceModeChange: (callback: (mode: string) => void) => () => void
      onPlaybackStateChange: (callback: (isPlaying: boolean) => void) => () => void
    }
  }
}

export const App: React.FC = () => {
  const [wallpaper, setWallpaper] = useState<WallpaperItem | null>(null)
  const [performanceMode, setPerformanceMode] = useState<string>('balanced')
  const [isPlaying, setIsPlaying] = useState<boolean>(true)

  useEffect(() => {
    if (window.wallpaperApi) {
      window.wallpaperApi.getInitialState().then((state) => {
        if (state) {
          setWallpaper(state.wallpaper)
          setPerformanceMode(state.performanceMode || 'balanced')
          setIsPlaying(state.isPlaying !== false)
        }
      })

      const unsub1 = window.wallpaperApi.onWallpaperChange((data) => {
        if (data && data.wallpaper) {
          setWallpaper(data.wallpaper)
        }
      })

      const unsub2 = window.wallpaperApi.onPerformanceModeChange((mode) => {
        setPerformanceMode(mode)
      })

      const unsub3 = window.wallpaperApi.onPlaybackStateChange((playing) => {
        setIsPlaying(playing)
      })

      return () => {
        unsub1()
        unsub2()
        unsub3()
      }
    }
  }, [])

  if (!wallpaper) {
    return <div className="w-full h-full bg-void" />
  }

  if (wallpaper.type === 'video') {
    return <VideoLayer src={wallpaper.sourceUrl} isPlaying={isPlaying} performanceMode={performanceMode} />
  }

  if (wallpaper.type === 'generative') {
    return (
      <GenerativeLayer
        generatorId={wallpaper.generatorId}
        isPlaying={isPlaying}
        performanceMode={performanceMode}
      />
    )
  }

  return <AiStillLayer src={wallpaper.sourceUrl} isPlaying={isPlaying} performanceMode={performanceMode} />
}
