import React, { useEffect, useRef, useState } from 'react'
import { useGalleryStore, WallpaperItem } from '../store/useGalleryStore'
import { ApertureIrisIcon } from '../components/ApertureIrisIcon'
import { Play, Sparkles, Heart } from 'lucide-react'

interface WallpaperTileProps {
  item: WallpaperItem
  onSelect: (item: WallpaperItem) => void
}

const GenerativeThumbnailCanvas: React.FC<{ generatorId?: string }> = ({
  generatorId = 'aurora'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let time = 0

    const width = (canvas.width = 360)
    const height = (canvas.height = 200)

    const particles = Array.from({ length: 30 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.7,
      vy: (Math.random() - 0.5) * 0.7,
      size: Math.random() * 2 + 1
    }))

    const render = () => {
      time += 0.025
      ctx.clearRect(0, 0, width, height)

      if (generatorId === 'quantum') {
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
            if (dist < 90) {
              ctx.strokeStyle = `rgba(110, 231, 218, ${1 - dist / 90})`
              ctx.beginPath()
              ctx.moveTo(p1.x, p1.y)
              ctx.lineTo(p2.x, p2.y)
              ctx.stroke()
            }
          }
        }
      } else if (generatorId === 'nebula') {
        const cx = width / 2 + Math.sin(time) * 35
        const cy = height / 2 + Math.cos(time * 0.7) * 35
        const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, width * 0.7)
        grad.addColorStop(0, 'rgba(110, 231, 218, 0.45)')
        grad.addColorStop(0.5, 'rgba(23, 24, 28, 0.7)')
        grad.addColorStop(1, 'rgba(10, 11, 13, 1)')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, width, height)
      } else {
        // Aurora Energy Flow
        ctx.fillStyle = '#0A0B0D'
        ctx.fillRect(0, 0, width, height)

        for (let i = 0; i < 4; i++) {
          ctx.beginPath()
          ctx.moveTo(0, height)
          for (let x = 0; x <= width; x += 15) {
            const y =
              height * 0.5 +
              Math.sin(x * 0.01 + time + i) * 35 +
              Math.cos(x * 0.005 + time * 0.5) * 25
            ctx.lineTo(x, y)
          }
          ctx.lineTo(width, height)
          ctx.closePath()
          const alpha = 0.3 - i * 0.05
          ctx.fillStyle = i % 2 === 0 ? `rgba(110, 231, 218, ${alpha})` : `rgba(38, 40, 46, ${alpha * 2})`
          ctx.fill()
        }
      }

      animId = requestAnimationFrame(render)
    }

    render()
    return () => cancelAnimationFrame(animId)
  }, [generatorId])

  return <canvas ref={canvasRef} className="w-full h-full object-cover" />
}

const WallpaperTile: React.FC<WallpaperTileProps> = ({ item, onSelect }) => {
  const [isHovered, setIsHovered] = useState(false)
  const [hasImageError, setHasImageError] = useState(false)
  const [hasVideoError, setHasVideoError] = useState(false)
  const { toggleFavorite } = useGalleryStore()

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onSelect(item)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(item)
        }
      }}
      role="button"
      tabIndex={0}
      className="group relative bg-panel border border-line hover:border-glow/60 rounded-xl overflow-hidden cursor-pointer transition-all duration-300 transform hover:-translate-y-1 hover:shadow-2xl flex flex-col"
    >
      {/* Media Aspect Container */}
      <div className="relative aspect-video w-full bg-black overflow-hidden flex items-center justify-center">
        {hasImageError ? (
          <div className="w-full h-full bg-gradient-to-br from-void via-panel to-panel-hover flex flex-col items-center justify-center p-4">
            <ApertureIrisIcon className="w-8 h-8 text-glow/60 mb-1" />
            <span className="text-[10px] font-mono text-ink-dim uppercase">Live Media Asset</span>
          </div>
        ) : item.type === 'video' ? (
          isHovered && !hasVideoError && !/^https?:\/\//i.test(item.sourceUrl) ? (
            <video
              src={item.sourceUrl}
              poster={item.previewUrl}
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              onError={() => setHasVideoError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <img
              src={item.previewUrl || item.sourceUrl}
              alt={item.title}
              loading="lazy"
              decoding="async"
              onError={() => setHasImageError(true)}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          )
        ) : item.type === 'generative' ? (
          <GenerativeThumbnailCanvas generatorId={item.generatorId} />
        ) : (
          <img
            src={item.previewUrl || item.sourceUrl}
            alt={item.title}
            loading="lazy"
            decoding="async"
            onError={() => setHasImageError(true)}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}

        {/* Top Badges */}
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1">
          {item.type === 'video' ? (
            <span className="flex items-center gap-1 font-mono text-[9px] uppercase px-2 py-0.5 rounded bg-black/80 backdrop-blur-md text-ink border border-white/10">
              <Play className="w-2.5 h-2.5 fill-ink" />
              <span>Loop</span>
            </span>
          ) : item.type === 'generative' ? (
            <span className="flex items-center gap-1 font-mono text-[9px] uppercase px-2 py-0.5 rounded bg-glow/20 backdrop-blur-md text-glow border border-glow/30">
              <Sparkles className="w-2.5 h-2.5" />
              <span>Generative</span>
            </span>
          ) : (
            <span className="font-mono text-[9px] uppercase px-2 py-0.5 rounded bg-black/80 backdrop-blur-md text-ink-dim border border-white/10">
              Animated Still
            </span>
          )}
        </div>

        {/* Favorite Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleFavorite(item.id, item.is_favorite)
          }}
          aria-label={item.is_favorite ? `Remove ${item.title} from favorites` : `Add ${item.title} to favorites`}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-black/60 backdrop-blur-md text-ink-dim hover:text-rose-400 transition"
        >
          <Heart
            className={`w-3.5 h-3.5 ${item.is_favorite ? 'fill-rose-400 text-rose-400' : ''}`}
          />
        </button>

        {/* Hover Active Iris Indicator */}
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition z-10">
          <ApertureIrisIcon className="w-4 h-4 text-glow" />
        </div>
      </div>

      {/* Card Info Footer */}
      <div className="p-3 bg-panel flex items-center justify-between border-t border-line">
        <div className="min-w-0 flex-1 pr-2">
          <h4 className="text-xs font-semibold text-ink truncate leading-snug">{item.title}</h4>
          <span className="font-mono text-[10px] text-ink-dim uppercase block mt-0.5">
            {item.source}
          </span>
        </div>
        <span className="font-mono text-[10px] text-ink-dim bg-void px-1.5 py-0.5 rounded border border-line shrink-0">
          {item.resolution.width}p
        </span>
      </div>
    </div>
  )
}

const EmptyCategoryState: React.FC<{ category: string }> = ({ category }) => {
  if (category === 'static') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center text-ink-dim space-y-3 px-6">
        <ApertureIrisIcon className="w-8 h-8 text-glow/60" />
        <div>
          <p className="text-sm text-ink">No static wallpapers found yet.</p>
          <p className="font-mono text-xs text-ink-dim mt-2 max-w-md">
            Drop image files (JPG, PNG, WebP...) into{' '}
            <span className="text-glow">~/Pictures/Vantage Wallpapers/Static</span>.
            This folder is watched automatically — files appear here instantly
            (use "Open Folder in Finder" on the left to open it).
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col items-center justify-center text-ink-dim space-y-2">
      <p className="text-sm text-ink">No wallpapers match your selected format or query.</p>
      <p className="font-mono text-xs text-ink-dim">
        Try switching format tabs or selecting another catalog category.
      </p>
    </div>
  )
}

export const Gallery: React.FC = () => {
  const {
    wallpapers,
    isLoading,
    error,
    setSelectedWallpaper,
    searchQuery,
    setSearchQuery,
    formatFilter,
    setFormatFilter,
    activeCategory
  } = useGalleryStore()

  const filteredWallpapers = wallpapers.filter((item) => {
    if (formatFilter === 'video') return item.type === 'video'
    return true
  })

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Search & Format Filter Header */}
      <div className="px-6 pb-4 pt-8 border-b border-line flex items-center justify-between bg-void/60 backdrop-blur-md gap-4 [-webkit-app-region:drag]">
        <div className="relative flex-1 max-w-md [-webkit-app-region:no-drag]">
          <input
            type="text"
            aria-label="Search wallpapers"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search wallpapers (e.g. nature, space, matrix)..."
            className="w-full bg-panel border border-line rounded-lg px-3.5 py-1.5 text-xs text-ink placeholder-ink-dim focus:outline-none focus:border-glow/50 font-sans"
          />
          {error && (
            <div role="alert" className="mt-2 text-[11px] font-mono text-red-300">
              {error}
            </div>
          )}
        </div>

        {/* Media Format Segment Tabs */}
        <div className="flex items-center bg-panel border border-line p-1 rounded-lg gap-1 text-xs select-none shrink-0 [-webkit-app-region:no-drag]">
          <button
            onClick={() => setFormatFilter('all')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition ${
              formatFilter === 'all'
                ? 'bg-glow/20 text-glow border border-glow/30'
                : 'text-ink-dim hover:text-ink'
            }`}
          >
            All Formats
          </button>
          <button
            onClick={() => setFormatFilter('video')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${
              formatFilter === 'video'
                ? 'bg-glow/20 text-glow border border-glow/30'
                : 'text-ink-dim hover:text-ink'
            }`}
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Live Videos</span>
          </button>
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center text-ink-dim space-y-3">
            <ApertureIrisIcon className="w-8 h-8 text-glow animate-spin" />
            <span className="font-mono text-xs text-glow">Loading Library Catalog...</span>
          </div>
        ) : filteredWallpapers.length === 0 ? (
          <EmptyCategoryState category={activeCategory} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredWallpapers.map((item) => (
              <WallpaperTile
                key={item.id}
                item={item}
                onSelect={(selected) => setSelectedWallpaper(selected)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
