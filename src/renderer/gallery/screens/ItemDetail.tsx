import React, { useEffect } from 'react'
import { useGalleryStore, WallpaperItem } from '../store/useGalleryStore'
import { ApertureIrisIcon } from '../components/ApertureIrisIcon'
import { X, Heart, Monitor, Check, Trash2 } from 'lucide-react'

interface ItemDetailProps {
  item: WallpaperItem
  onClose: () => void
}

export const ItemDetail: React.FC<ItemDetailProps> = ({ item, onClose }) => {
  const { activeCategory, displays, applyWallpaper, toggleFavorite, deleteWallpaper } = useGalleryStore()
  const isImportedCategory = activeCategory === 'imported'

  // M-9 FIX: Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallpaper-detail-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >      <div className="bg-panel border border-line rounded-xl max-w-3xl w-full overflow-hidden shadow-2xl flex flex-col md:flex-row">
        {/* Preview media pane */}
        <div className="w-full md:w-1/2 bg-black relative flex items-center justify-center min-h-[300px]">
          {item.type === 'video' ? (
            <video
              src={item.sourceUrl}
              poster={item.previewUrl}
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          ) : item.type === 'generative' ? (
            <div className="w-full h-full bg-void flex flex-col items-center justify-center text-ink-dim p-4">
              <ApertureIrisIcon className="w-12 h-12 text-glow mb-3 animate-spin-slow" />
              <span className="font-mono text-xs uppercase tracking-wider text-glow">
                Live Procedural Canvas
              </span>
            </div>
          ) : (
            <img src={item.sourceUrl} alt={item.title} className="w-full h-full object-cover" />
          )}

          <button
            onClick={onClose}
            aria-label="Close wallpaper details"
            className="absolute top-3 right-3 p-1.5 rounded-full bg-black/60 text-ink hover:text-white hover:bg-black transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Controls & Metadata pane */}
        <div className="w-full md:w-1/2 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 id="wallpaper-detail-title" className="text-xl font-semibold text-ink leading-tight">{item.title}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded bg-panel-hover text-glow border border-glow/20">
                    {item.type}
                  </span>
                  <span className="font-mono text-[10px] text-ink-dim uppercase">{item.category}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isImportedCategory && (
                  <button
                    onClick={() => {
                      deleteWallpaper(item.id)
                      onClose()
                    }}
                    title="Delete wallpaper"
                    className="p-2 rounded-lg border border-line text-ink-dim hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/10 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => toggleFavorite(item.id, item.is_favorite)}
                  className={`p-2 rounded-lg border transition ${
                    item.is_favorite
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      : 'border-line text-ink-dim hover:text-ink hover:border-ink-dim'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${item.is_favorite ? 'fill-rose-400' : ''}`} />
                </button>
              </div>
            </div>

            {/* Display assignment buttons */}
            <div className="my-6">
              <label className="text-xs font-mono uppercase text-ink-dim block mb-2">
                Apply to Display
              </label>
              <div className="space-y-2">
                {displays.map((disp) => {
                  const isAssigned = disp.assignedWallpaperId === item.id
                  return (
                    <button
                      key={disp.id}
                      onClick={() => applyWallpaper(disp.id, item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition text-sm ${
                        isAssigned
                          ? 'bg-glow/10 border-glow/40 text-glow'
                          : 'bg-void border-line text-ink hover:border-glow/30'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Monitor className="w-4 h-4" />
                        <span>{disp.label}</span>
                      </div>
                      {isAssigned ? (
                        <div className="flex items-center gap-1 text-xs font-mono">
                          <Check className="w-3.5 h-3.5" />
                          <span>Active</span>
                        </div>
                      ) : (
                        <span className="text-xs text-ink-dim">Set Wallpaper</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Metadata list */}
            <div className="space-y-2 border-t border-line pt-4 text-xs font-mono text-ink-dim">
              <div className="flex justify-between">
                <span>Resolution</span>
                <span className="text-ink">
                  {item.resolution.width} × {item.resolution.height}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Source</span>
                <span className="text-ink uppercase">{item.source}</span>
              </div>
              <div className="flex justify-between">
                <span>License</span>
                <span className="text-glow">{item.license}</span>
              </div>
              {item.attribution && (
                <div className="flex justify-between">
                  <span>Attribution</span>
                  <span className="text-ink truncate max-w-[180px]">{item.attribution}</span>
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-line text-[11px] text-ink-dim flex justify-between items-center">
            <span>Verified Licensed Source</span>
            <ApertureIrisIcon className="w-4 h-4 text-glow" />
          </div>
        </div>
      </div>
    </div>
  )
}
