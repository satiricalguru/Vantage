import React, { useCallback, useEffect, useRef, useState } from 'react'
import { VideoLayer } from './VideoLayer'
import { GenerativeLayer } from './GenerativeLayer'
import { AiStillLayer } from './AiStillLayer'
import type { WallpaperItem } from '../../shared/types'

export const App: React.FC = () => {
  const [wallpaper, setWallpaper] = useState<WallpaperItem | null>(null)
  const [playSrc, setPlaySrc] = useState<string>('')
  const [downloadPct, setDownloadPct] = useState<number | null>(null)
  const downloadUrlRef = useRef<string>('')
  const [performanceMode, setPerformanceMode] = useState<string>('balanced')
  const [isPlaying, setIsPlaying] = useState<boolean>(true)

  const applyPlayback = useCallback(async (item: WallpaperItem) => {
    const isRemoteVideo = item.type === 'video' && /^https?:\/\//i.test(item.sourceUrl || '')
    if (!isRemoteVideo) {
      setPlaySrc(item.sourceUrl || '')
      setDownloadPct(null)
      downloadUrlRef.current = ''
      return
    }

    setPlaySrc('')
    setDownloadPct(0)
    downloadUrlRef.current = item.sourceUrl
    try {
      if (window.wallpaperApi) {
        const cachedUrl = await window.wallpaperApi.ensureCached(item.sourceUrl)
        setPlaySrc(cachedUrl)
      } else {
        setPlaySrc(item.sourceUrl)
      }
      setDownloadPct(null)
      downloadUrlRef.current = ''
    } catch (err) {
      console.warn('[Playback] Cache failed, falling back to remote streaming:', err)
      setPlaySrc(item.sourceUrl)
      setDownloadPct(null)
      downloadUrlRef.current = ''
    }
  }, [])

  useEffect(() => {
    if (window.wallpaperApi) {
      window.wallpaperApi.getInitialState().then((state) => {
        if (state) {
          setWallpaper(state.wallpaper)
          setPerformanceMode(state.performanceMode || 'balanced')
          setIsPlaying(state.isPlaying !== false)
          if (state.wallpaper) {
            applyPlayback(state.wallpaper)
          }
        }
      })

      const unsub1 = window.wallpaperApi.onWallpaperChange((data) => {
        if (data && data.wallpaper) {
          setWallpaper(data.wallpaper)
          applyPlayback(data.wallpaper)
        }
      })

      const unsub2 = window.wallpaperApi.onPerformanceModeChange((mode) => {
        setPerformanceMode(mode)
      })

      const unsub3 = window.wallpaperApi.onPlaybackStateChange((playing) => {
        setIsPlaying(playing)
      })

      const unsub4 = window.wallpaperApi.onCacheProgress((progress) => {
        if (progress.url === downloadUrlRef.current) {
          setDownloadPct(progress.pct)
        }
      })

      return () => {
        unsub1()
        unsub2()
        unsub3()
        unsub4()
      }
    }
  }, [applyPlayback])

  if (!wallpaper) {
    return <div className="w-full h-full bg-void" />
  }

  if (wallpaper.type === 'video') {
    return (
      <div className="w-full h-full relative bg-black">
        <VideoLayer src={playSrc} isPlaying={isPlaying} performanceMode={performanceMode} />
        {downloadPct !== null && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70 text-white">
            <div className="text-sm font-mono">Downloading wallpaper… {downloadPct}%</div>
            <div className="w-48 h-1 bg-white/20 rounded mt-3 overflow-hidden">
              <div className="h-full bg-white/80 transition-[width] duration-200" style={{ width: `${downloadPct}%` }} />
            </div>
          </div>
        )}
      </div>
    )
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
