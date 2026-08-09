import React, { useEffect, useRef } from 'react'

interface VideoLayerProps {
  src: string
  isPlaying: boolean
  performanceMode: string
}

export const VideoLayer: React.FC<VideoLayerProps> = ({ src, isPlaying, performanceMode }) => {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const shouldPlay = isPlaying && performanceMode !== 'pause'
    const tryPlay = () => {
      if (shouldPlay) {
        video.play().catch(() => { /* expected before data is loaded */ })
      }
    }

    if (!shouldPlay) {
      video.pause()
      return
    }

    // play() rejects until the new source has at least started loading; retry
    // once the element reports data instead of swallowing the failure forever.
    tryPlay()
    video.addEventListener('loadeddata', tryPlay)
    return () => video.removeEventListener('loadeddata', tryPlay)
  }, [isPlaying, performanceMode, src])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (performanceMode === 'battery-saver') {
      video.playbackRate = 0.75
    } else {
      video.playbackRate = 1.0
    }
  }, [performanceMode])

  useEffect(() => {
    if (!window.wallpaperApi?.onMemoryPurge) return
    return window.wallpaperApi.onMemoryPurge(() => {
      const video = videoRef.current
      if (!video) return
      const currentPos = video.currentTime
      video.load()
      video.currentTime = currentPos
      if (isPlaying && performanceMode !== 'pause') {
        const retryPlay = () => video.play().catch(() => {})
        video.addEventListener('loadeddata', retryPlay, { once: true })
        retryPlay()
      }
    })
  }, [isPlaying, performanceMode])

  return (
    <div className="w-full h-full relative overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={src}
        loop
        muted
        playsInline
        className="w-full h-full object-cover pointer-events-none"
      />
    </div>
  )
}
