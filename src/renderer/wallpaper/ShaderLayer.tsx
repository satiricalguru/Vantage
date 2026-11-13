import React, { useEffect, useRef } from 'react'
import { createShaderRenderer } from '../shared/shaders'

interface ShaderLayerProps {
  generatorId: string
  isPlaying: boolean
  performanceMode: string
  onUnsupported?: () => void
}

/** Render scale and frame cap per performance mode — shaders cost scales with pixel count. */
const MODE = {
  quality: { scale: 0.85, fps: 60 },
  balanced: { scale: 0.6, fps: 30 },
  'battery-saver': { scale: 0.4, fps: 15 }
} as const

export const ShaderLayer: React.FC<ShaderLayerProps> = ({ generatorId, isPlaying, performanceMode, onUnsupported }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouse = useRef({ x: 0.5, y: 0.5, sx: 0.5, sy: 0.5 })
  const timeRef = useRef(0)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current.x = e.clientX / window.innerWidth
      mouse.current.y = 1 - e.clientY / window.innerHeight
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = createShaderRenderer(canvas)
    if (!renderer || !renderer.setGenerator(generatorId)) {
      onUnsupported?.()
      return
    }
    const cfg = MODE[performanceMode as keyof typeof MODE] ?? MODE.balanced
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      renderer.resize(window.innerWidth * dpr * cfg.scale, window.innerHeight * dpr * cfg.scale)
    }
    resize()
    window.addEventListener('resize', resize)

    let raf = 0
    let last = 0
    const interval = 1000 / cfg.fps
    const shouldRun = isPlaying && performanceMode !== 'pause'

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (now - last < interval - 1) return
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0
      last = now
      timeRef.current += dt
      const m = mouse.current
      m.sx += (m.x - m.sx) * 0.06
      m.sy += (m.y - m.sy) * 0.06
      renderer.render(timeRef.current, m.sx, m.sy)
    }

    if (shouldRun) raf = requestAnimationFrame(draw)
    else renderer.render(timeRef.current, mouse.current.sx, mouse.current.sy)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      renderer.dispose()
    }
  }, [generatorId, isPlaying, performanceMode, onUnsupported])

  return (
    <div className="w-full h-full relative overflow-hidden bg-void">
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  )
}
