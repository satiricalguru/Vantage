import React, { useEffect, useRef } from 'react'

interface AiStillLayerProps {
  src: string
  isPlaying: boolean
  performanceMode: string
}

export const AiStillLayer: React.FC<AiStillLayerProps> = ({ src, isPlaying, performanceMode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let time = 0
    let lastFrameAt = 0
    const frameInterval =
      performanceMode === 'quality' ? 1000 / 60 : performanceMode === 'battery-saver' ? 1000 / 15 : 1000 / 30

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const particles = Array.from({ length: 45 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 2 + 0.5,
      alpha: Math.random() * 0.5 + 0.2,
      speed: Math.random() * 0.4 + 0.1
    }))

    const render = (timestamp: number) => {
      if (!isPlaying || performanceMode === 'pause') return
      if (timestamp - lastFrameAt < frameInterval) {
        animId = requestAnimationFrame(render)
        return
      }
      lastFrameAt = timestamp

      time += frameInterval / 1000
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (const p of particles) {
        p.y -= p.speed
        if (p.y < 0) p.y = canvas.height

        ctx.fillStyle = `rgba(110, 231, 218, ${p.alpha * (Math.sin(time + p.x) * 0.3 + 0.7)})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }

      animId = requestAnimationFrame(render)
    }

    animId = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [isPlaying, performanceMode])

  return (
    <div className="w-full h-full relative overflow-hidden bg-void">
      <img
        src={src}
        alt="Animated Still Wallpaper"
        className={`w-full h-full object-cover transition-transform duration-[20000ms] ease-in-out scale-105 hover:scale-110 ${
          isPlaying && performanceMode !== 'pause' ? 'animate-pulse' : ''
        }`}
        style={{
          animationDuration: '12s'
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
    </div>
  )
}
