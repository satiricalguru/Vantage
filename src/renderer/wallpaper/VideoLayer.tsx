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

    if (isPlaying && performanceMode !== 'pause') {
      video.play().catch((err) => console.log('Video autoplay error:', err))
    } else {
      video.pause()
    }
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

  return (
    <div className="w-full h-full relative overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={src}
        autoPlay
        loop
        muted
        playsInline
        className="w-full h-full object-cover pointer-events-none"
      />
    </div>
  )
}
