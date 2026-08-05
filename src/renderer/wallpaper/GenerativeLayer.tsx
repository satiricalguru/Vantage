import React, { useEffect, useRef } from 'react'

interface GenerativeLayerProps {
  generatorId?: string
  isPlaying: boolean
  performanceMode: string
}

export const GenerativeLayer: React.FC<GenerativeLayerProps> = ({
  generatorId = 'aurora',
  isPlaying,
  performanceMode
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let time = 0

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Particle nodes for quantum generator
    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      size: Math.random() * 2 + 1
    }))

    const render = () => {
      if (!isPlaying || performanceMode === 'pause') return

      time += performanceMode === 'battery-saver' ? 0.005 : 0.015
      const width = canvas.width
      const height = canvas.height

      if (generatorId === 'quantum') {
        // Quantum Stream particle network
        ctx.fillStyle = '#0A0B0D'
        ctx.fillRect(0, 0, width, height)

        ctx.lineWidth = 0.5
        for (let i = 0; i < particles.length; i++) {
          const p1 = particles[i]
          p1.x += p1.vx
          p1.y += p1.vy

          if (p1.x < 0 || p1.x > width) p1.vx *= -1
          if (p1.y < 0 || p1.y > height) p1.vy *= -1

          ctx.fillStyle = '#6EE7DA'
          ctx.beginPath()
          ctx.arc(p1.x, p1.y, p1.size, 0, Math.PI * 2)
          ctx.fill()

          for (let j = i + 1; j < particles.length; j++) {
            const p2 = particles[j]
            const dx = p1.x - p2.x
            const dy = p1.y - p2.y
            const dist = Math.sqrt(dx * dx + dy * dy)

            if (dist < 140) {
              ctx.strokeStyle = `rgba(110, 231, 218, ${1 - dist / 140})`
              ctx.beginPath()
              ctx.moveTo(p1.x, p1.y)
              ctx.lineTo(p2.x, p2.y)
              ctx.stroke()
            }
          }
        }
      } else if (generatorId === 'nebula') {
        // Deep Cosmic Nebula
        ctx.fillStyle = 'rgba(10, 11, 13, 0.2)'
        ctx.fillRect(0, 0, width, height)

        const cx = width / 2 + Math.sin(time) * 100
        const cy = height / 2 + Math.cos(time * 0.7) * 100

        const grad = ctx.createRadialGradient(cx, cy, 50, cx, cy, Math.max(width, height) * 0.7)
        grad.addColorStop(0, 'rgba(110, 231, 218, 0.25)')
        grad.addColorStop(0.5, 'rgba(23, 24, 28, 0.4)')
        grad.addColorStop(1, 'rgba(10, 11, 13, 0.95)')

        ctx.fillStyle = grad
        ctx.fillRect(0, 0, width, height)
      } else {
        // Aurora Energy Flow (default)
        ctx.fillStyle = '#0A0B0D'
        ctx.fillRect(0, 0, width, height)

        for (let i = 0; i < 5; i++) {
          ctx.beginPath()
          ctx.moveTo(0, height)

          for (let x = 0; x <= width; x += 30) {
            const y =
              height * 0.5 +
              Math.sin(x * 0.003 + time + i) * 120 +
              Math.cos(x * 0.001 + time * 0.5) * 80
            ctx.lineTo(x, y)
          }

          ctx.lineTo(width, height)
          ctx.closePath()

          const alpha = 0.15 - i * 0.02
          ctx.fillStyle = i % 2 === 0 ? `rgba(110, 231, 218, ${alpha})` : `rgba(29, 31, 36, ${alpha * 2})`
          ctx.fill()
        }
      }

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', resize)
    }
  }, [generatorId, isPlaying, performanceMode])

  return (
    <div className="w-full h-full relative overflow-hidden bg-void">
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  )
}
