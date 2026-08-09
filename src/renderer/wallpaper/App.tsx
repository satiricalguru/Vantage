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

  // Monotonic apply token: async playback resolution is only honored if no
  // newer apply happened in the meantime (prevents a slow download for
  // wallpaper A from overriding a subsequent wallpaper B).
  const applyTokenRef = useRef(0)
  const lastSourceRef = useRef('')
  const wallpaperRef = useRef<WallpaperItem | null>(null)

  const applyPlayback = useCallback(async (item: WallpaperItem, { force = false } = {}) => {
    const isRemoteVideo = item.type === 'video' && /^https?:\/\//i.test(item.sourceUrl || '')

    // Skip re-applying the identical wallpaper unless forced (e.g. memory purge).
    if (!force && lastSourceRef.current === item.sourceUrl) {
      return
    }
    lastSourceRef.current = item.sourceUrl

    if (!isRemoteVideo) {
      setPlaySrc(item.sourceUrl || '')
      setDownloadPct(null)
      downloadUrlRef.current = ''
      return
    }

    const token = ++applyTokenRef.current
    setPlaySrc('')
    setDownloadPct(0)
    downloadUrlRef.current = item.sourceUrl
    try {
      if (window.wallpaperApi) {
        const cachedUrl = await window.wallpaperApi.ensureCached(item.sourceUrl)
        if (token !== applyTokenRef.current) return
        setPlaySrc(cachedUrl)
      } else {
        setPlaySrc(item.sourceUrl)
      }
      setDownloadPct(null)
      downloadUrlRef.current = ''
    } catch (err) {
      if (token !== applyTokenRef.current) return
      console.warn('[Playback] Cache failed, falling back to remote streaming:', err)
      setPlaySrc(item.sourceUrl)
      setDownloadPct(null)
      downloadUrlRef.current = ''
    }
  }, [])

  const setActiveWallpaper = useCallback(
    (item: WallpaperItem | null) => {
      wallpaperRef.current = item
      setWallpaper(item)
    },
    []
  )

  useEffect(() => {
    const api = window.wallpaperApi
    if (api) {
      api
        .getInitialState()
        .then((state) => {
          if (state) {
            setActiveWallpaper(state.wallpaper)
            setPerformanceMode(state.performanceMode || 'balanced')
            setIsPlaying(state.isPlaying !== false)
            if (state.wallpaper) {
              applyPlayback(state.wallpaper)
            }
          }
        })
        .catch((err) => {
          console.warn('[Playback] Could not read initial state:', err)
        })

      const unsub1 = api.onWallpaperChange((data) => {
        if (data && data.wallpaper) {
          setActiveWallpaper(data.wallpaper)
          applyPlayback(data.wallpaper)
        }
      })

      const unsub2 = api.onPerformanceModeChange((mode) => {
        setPerformanceMode(mode)
      })

      const unsub3 = api.onPlaybackStateChange((playing) => {
        setIsPlaying(playing)
      })

      const unsub4 = api.onCacheProgress((progress) => {
        if (progress.url === downloadUrlRef.current) {
          setDownloadPct(progress.pct)
        }
      })

      // After a memory purge the media cache was cleared; re-apply so remote
      // videos are re-fetched instead of hanging on 403 responses.
      const unsub5 = api.onMemoryPurge?.(() => {
        if (wallpaperRef.current) {
          applyPlayback(wallpaperRef.current, { force: true })
        }
      })

      return () => {
        unsub1()
        unsub2()
        unsub3()
        unsub4()
        unsub5?.()
      }
    }
  }, [applyPlayback, setActiveWallpaper])

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
