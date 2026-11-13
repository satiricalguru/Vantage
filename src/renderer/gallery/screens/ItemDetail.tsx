import React, { useEffect, useRef, useState } from 'react'
import { useGalleryStore, WallpaperItem, resolutionLabel } from '../store/useGalleryStore'
import { ApertureIrisIcon } from '../components/ApertureIrisIcon'
import { MediaThumb } from '../components/ui'
import { GenerativeIcon } from '../components/GenerativeIcon'
import { X, Heart, Monitor, Check, Trash2, Layers, ChevronLeft, ChevronRight } from 'lucide-react'

interface ItemDetailProps {
  item: WallpaperItem
  onClose: () => void
}

export const ItemDetail: React.FC<ItemDetailProps> = ({ item, onClose }) => {
  const { displays, applyWallpaper, applyToAllDisplays, toggleFavorite, deleteWallpaper, stepSelected, activeCategory } = useGalleryStore()
  const isUserItem = item.source === 'user' || item.id.startsWith('user-')
  const isAllAssigned = displays.length > 0 && displays.every((d) => d.assignedWallpaperId === item.id)
  const [buffering, setBuffering] = useState(item.type === 'video')
  const [videoFailed, setVideoFailed] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setBuffering(item.type === 'video')
    setVideoFailed(false)
  }, [item.id, item.type])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') stepSelected(1)
      else if (e.key === 'ArrowLeft') stepSelected(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [onClose, stepSelected])

  const facts: [string, React.ReactNode][] = [
    ['Format', item.type === 'video' ? 'Video loop' : item.type === 'generative' ? 'Procedural (GPU)' : 'Still image'],
    ['Resolution', item.type === 'generative' ? 'Native — any display' : `${item.resolution.width} × ${item.resolution.height} · ${resolutionLabel(item)}`],
    ...(item.duration ? ([['Loop length', `${Math.round(item.duration)}s`]] as [string, React.ReactNode][]) : []),
    ['Source', item.attribution || item.source],
    ['License', item.license]
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8 backdrop-blur-xl animate-fade-in" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <button onClick={() => stepSelected(-1)} aria-label="Previous wallpaper" className="absolute left-4 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/[0.06] text-ink-dim ring-1 ring-line transition hover:bg-white/10 hover:text-ink">
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button onClick={() => stepSelected(1)} aria-label="Next wallpaper" className="absolute right-4 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/[0.06] text-ink-dim ring-1 ring-line transition hover:bg-white/10 hover:text-ink">
        <ChevronRight className="h-5 w-5" />
      </button>

      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallpaper-detail-title"
        className="flex max-h-full w-full max-w-[980px] flex-col overflow-hidden rounded-2xl bg-panel shadow-lift ring-1 ring-line-strong outline-none animate-pop"
      >
        <div className="relative aspect-video max-h-[58vh] w-full shrink-0 overflow-hidden bg-black">
          {item.type === 'video' && !videoFailed ? (
            <>
              <video
                key={item.id}
                src={item.sourceUrl}
                poster={item.previewUrl}
                autoPlay
                loop
                muted
                playsInline
                onWaiting={() => setBuffering(true)}
                onPlaying={() => setBuffering(false)}
                onCanPlay={() => setBuffering(false)}
                onError={() => {
                  setVideoFailed(true)
                  setBuffering(false)
                }}
                className="h-full w-full object-cover"
              />
              {buffering && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/25">
                  <span className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] text-ink-dim ring-1 ring-line">
                    <ApertureIrisIcon className="h-4 w-4 animate-spin text-glow" /> Streaming preview…
                  </span>
                </div>
              )}
            </>
          ) : item.type === 'image' || item.type === 'user-import' ? (
            <img src={item.sourceUrl || item.previewUrl} alt={item.title} className="h-full w-full object-cover" />
          ) : (
            <MediaThumb key={item.id} item={item} active className="absolute inset-0" />
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-panel to-transparent" />
          <button onClick={onClose} aria-label="Close" className="glass absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-ink ring-1 ring-line transition hover:bg-black/70">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 gap-6 overflow-y-auto px-6 pb-6 pt-1 md:grid-cols-[1.2fr_1fr]">
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-1.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
                  {item.type === 'generative' && <GenerativeIcon className="h-3 w-3" />}
                  <span>{item.category === 'ai-art' ? 'Digital art' : item.category}</span>
                </div>
                <h2 id="wallpaper-detail-title" className="text-[24px] font-semibold leading-tight tracking-tight text-ink">{item.title}</h2>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {activeCategory === 'imported' && isUserItem && (
                  <button
                    onClick={() => {
                      deleteWallpaper(item.id)
                      onClose()
                    }}
                    aria-label="Delete wallpaper"
                    className="grid h-9 w-9 place-items-center rounded-xl text-ink-dim ring-1 ring-line transition hover:bg-ember/10 hover:text-ember hover:ring-ember/30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => toggleFavorite(item.id, item.is_favorite)}
                  aria-pressed={!!item.is_favorite}
                  aria-label={item.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                  className={`grid h-9 w-9 place-items-center rounded-xl ring-1 transition ${item.is_favorite ? 'bg-ember/10 text-ember ring-ember/30' : 'text-ink-dim ring-line hover:text-ink hover:ring-line-strong'}`}
                >
                  <Heart className={`h-4 w-4 ${item.is_favorite ? 'fill-ember' : ''}`} />
                </button>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-[110px_1fr] gap-x-4 gap-y-2.5 text-[13px]">
              {facts.map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt className="text-ink-faint">{k}</dt>
                  <dd className="truncate text-ink-dim" title={typeof v === 'string' ? v : undefined}>{v}</dd>
                </React.Fragment>
              ))}
            </dl>
            <p className="mt-5 flex items-center gap-2 text-[11px] text-ink-faint">
              <span className="kbd">←</span><span className="kbd">→</span> browse · <span className="kbd">esc</span> close
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-medium text-ink-dim">Set as wallpaper on</span>
              {displays.length > 1 && (
                <button onClick={() => applyToAllDisplays(item.id)} className={`chip ${isAllAssigned ? 'chip-on' : ''}`}>
                  <Layers className="h-3.5 w-3.5" />
                  {isAllAssigned ? 'On all displays' : 'All displays'}
                </button>
              )}
            </div>
            <div className="space-y-2">
              {displays.length === 0 && <p className="rounded-xl border border-line px-4 py-3 text-[13px] text-ink-dim">No displays detected.</p>}
              {displays.map((disp) => {
                const isAssigned = disp.assignedWallpaperId === item.id
                return (
                  <button
                    key={disp.id}
                    onClick={() => applyWallpaper(disp.id, item.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-4 py-3 text-[13px] ring-1 transition ${
                      isAssigned ? 'bg-glow/10 text-glow ring-glow/40' : 'bg-white/[0.03] text-ink ring-line hover:bg-white/[0.06] hover:ring-line-strong'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Monitor className="h-4 w-4" />
                      {disp.label}
                    </span>
                    {isAssigned ? (
                      <span className="flex items-center gap-1 text-[12px] font-medium">
                        <Check className="h-3.5 w-3.5" /> Live
                      </span>
                    ) : (
                      <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-void">Set</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
