import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useGalleryStore, visibleWallpapers, resolutionLabel, WallpaperItem, FormatFilter, SortMode } from '../store/useGalleryStore'
import { ApertureIrisIcon } from '../components/ApertureIrisIcon'
import { MediaThumb } from '../components/ui'
import { GenerativeIcon } from '../components/GenerativeIcon'
import { Play, Heart, Trash2, Search, Shuffle, LayoutGrid, Grid3x3, Check, X, MonitorPlay, ArrowUpDown } from 'lucide-react'

const PAGE = 48
const isMac = navigator.userAgent.includes('Mac')

const CATEGORY_TITLES: Record<string, { title: string; blurb: string }> = {
  all: { title: 'Discover', blurb: 'Every living wallpaper in your library.' },
  favorites: { title: 'Favorites', blurb: 'The ones you keep coming back to.' },
  imported: { title: 'My Imports', blurb: 'Your own videos and images.' },
  anime: { title: 'Anime', blurb: 'Animated scenes from your favorite series.' },
  games: { title: 'Gaming', blurb: 'Splash art and worlds from games.' },
  heroes: { title: 'Heroes & Comics', blurb: 'Capes, masks and multiverses.' },
  nature: { title: 'Nature', blurb: 'Forests, oceans, skies and seasons.' },
  space: { title: 'Space', blurb: 'Planets, nebulae and the deep black.' },
  cars: { title: 'Cars & Streets', blurb: 'Night drives, neon and rain.' },
  'ai-art': { title: 'Digital Art', blurb: 'Lo-fi, fantasy and illustrated loops.' },
  generative: { title: 'Generative', blurb: 'Procedural scenes rendered live on your GPU. Zero downloads, never repeats.' },
  static: { title: 'Still Images', blurb: 'High-resolution stills, plus anything in your Static folder.' }
}

const FORMATS: { id: FormatFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'video', label: 'Video' },
  { id: 'generative', label: 'Generative' },
  { id: '4k', label: '4K' }
]
const SORTS: { id: SortMode; label: string }[] = [
  { id: 'featured', label: 'Featured' },
  { id: 'az', label: 'A → Z' },
  { id: 'resolution', label: 'Resolution' }
]

const WallpaperTile: React.FC<{ item: WallpaperItem; index: number }> = ({ item, index }) => {
  const [hover, setHover] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { activeCategory, toggleFavorite, deleteWallpaper, setSelectedWallpaper, applyWallpaper, selectedDisplayId, displays } = useGalleryStore()
  const isLive = displays.some((d) => d.assignedWallpaperId === item.id)
  const isUserItem = item.source === 'user' || item.id.startsWith('user-')

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <div
      onMouseEnter={() => {
        timer.current = setTimeout(() => setHover(true), 180)
      }}
      onMouseLeave={() => {
        if (timer.current) clearTimeout(timer.current)
        setHover(false)
      }}
      onClick={() => setSelectedWallpaper(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setSelectedWallpaper(item)
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${item.title}${isLive ? ', currently live' : ''}`}
      style={{ animationDelay: `${Math.min(index % PAGE, 24) * 18}ms` }}
      className={`group relative aspect-video cursor-pointer overflow-hidden rounded-xl bg-panel shadow-card ring-1 transition duration-300 animate-rise [content-visibility:auto] [contain-intrinsic-size:320px_180px] hover:-translate-y-0.5 hover:shadow-lift ${
        isLive ? 'ring-glow/60' : 'ring-line hover:ring-line-strong'
      }`}
    >
      <MediaThumb item={item} active={hover} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent opacity-80 transition group-hover:opacity-100" />

      <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
        {isLive && (
          <span className="flex items-center gap-1 rounded-full bg-glow px-2 py-[3px] text-[10px] font-semibold uppercase tracking-wide text-void">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-void" />
            Live
          </span>
        )}
      </div>

      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
        {activeCategory === 'imported' && isUserItem && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              deleteWallpaper(item.id)
            }}
            aria-label={`Delete ${item.title}`}
            className="grid h-7 w-7 place-items-center rounded-full bg-black/55 text-ink-dim backdrop-blur-md transition hover:bg-ember/25 hover:text-ember"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleFavorite(item.id, item.is_favorite)
          }}
          aria-label={item.is_favorite ? `Remove ${item.title} from favorites` : `Add ${item.title} to favorites`}
          className="grid h-7 w-7 place-items-center rounded-full bg-black/55 text-ink backdrop-blur-md transition hover:bg-black/75"
        >
          <Heart className={`h-3.5 w-3.5 ${item.is_favorite ? 'fill-ember text-ember' : ''}`} />
        </button>
      </div>
      {item.is_favorite && (
        <Heart className="absolute right-3 top-3 h-3.5 w-3.5 fill-ember text-ember transition group-hover:opacity-0" aria-hidden />
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
        <div className="min-w-0">
          <h4 className="truncate text-[13px] font-semibold leading-tight text-white drop-shadow">{item.title}</h4>
          <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-wider text-white/55">
            {item.type === 'video' ? 'Video' : item.type === 'generative' ? 'Procedural' : 'Still'} · {resolutionLabel(item)}
          </span>
        </div>
        {selectedDisplayId != null && !isLive && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              applyWallpaper(selectedDisplayId, item.id)
            }}
            className="flex shrink-0 translate-y-1 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-void opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100 focus:translate-y-0 focus:opacity-100"
          >
            <Play className="h-3 w-3 fill-void" /> Set
          </button>
        )}
        {isLive && <Check className="h-4 w-4 shrink-0 text-glow" aria-hidden />}
      </div>
    </div>
  )
}

const NowPlaying: React.FC = () => {
  const { displays, selectedDisplayId, wallpapers, shuffle, setSelectedWallpaper } = useGalleryStore()
  const display = displays.find((d) => d.id === selectedDisplayId) ?? displays[0]
  const current = wallpapers.find((w) => w.id === display?.assignedWallpaperId)
  if (!display) return null

  return (
    <div className="relative mb-7 h-[220px] overflow-hidden rounded-2xl ring-1 ring-line shadow-lift animate-rise">
      {current ? <MediaThumb item={current} active className="absolute inset-0" /> : <div className="absolute inset-0 bg-gradient-to-br from-glow/20 via-panel to-iris/20" />}
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-transparent" />
      <div className="relative flex h-full flex-col justify-end gap-3 p-6">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-glow">
          <MonitorPlay className="h-3.5 w-3.5" />
          Now playing on {display.label || 'your display'}
        </div>
        <h2 className="max-w-[520px] text-[28px] font-semibold leading-[1.05] tracking-tight text-white">{current?.title ?? 'Pick something alive'}</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => shuffle()} className="btn-primary">
            <Shuffle className="h-4 w-4" /> Shuffle
          </button>
          {current && (
            <button onClick={() => setSelectedWallpaper(current)} className="btn-ghost bg-black/30 backdrop-blur-md">
              Details
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const EmptyState: React.FC<{ category: string; query: string }> = ({ category, query }) => {
  const { setSearchQuery, importFile, openWallpaperFolder } = useGalleryStore()
  const copy =
    query
      ? { title: `Nothing matches “${query}”`, body: 'Try a character, game, place or mood.' }
      : category === 'favorites'
        ? { title: 'No favorites yet', body: 'Tap the heart on any wallpaper to keep it here.' }
        : category === 'imported'
          ? { title: 'Bring your own', body: 'Import an MP4, MOV, WebM or image — or drop files into the watched folder.' }
          : category === 'static'
            ? { title: 'No still images yet', body: 'Drop JPG, PNG or WebP files into Pictures/Vantage Wallpapers/Static.' }
            : { title: 'Nothing here yet', body: 'Try another category or format.' }
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 text-center animate-fade-in">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.04] ring-1 ring-line">
        <ApertureIrisIcon className="h-7 w-7 text-glow/70" />
      </div>
      <div>
        <p className="text-[15px] font-semibold text-ink">{copy.title}</p>
        <p className="mt-1 max-w-sm text-[13px] text-ink-dim">{copy.body}</p>
      </div>
      <div className="mt-1 flex gap-2">
        {query && <button className="btn-ghost" onClick={() => setSearchQuery('')}>Clear search</button>}
        {(category === 'imported' || category === 'static') && (
          <>
            <button className="btn-primary" onClick={() => importFile()}>Import file</button>
            <button className="btn-ghost" onClick={() => openWallpaperFolder()}>Open folder</button>
          </>
        )}
      </div>
    </div>
  )
}

export const Gallery: React.FC = () => {
  const { wallpapers, isLoading, error, searchQuery, setSearchQuery, formatFilter, setFormatFilter, sortMode, setSortMode, density, setDensity, activeCategory, shuffle, counts } = useGalleryStore()
  const [limit, setLimit] = useState(PAGE)
  const sentinel = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const list = useMemo(() => visibleWallpapers(wallpapers, formatFilter, sortMode), [wallpapers, formatFilter, sortMode])
  const shown = list.slice(0, limit)
  const meta = CATEGORY_TITLES[activeCategory] ?? { title: activeCategory, blurb: '' }

  // Reset paging + scroll when the result set changes.
  useEffect(() => {
    setLimit(PAGE)
    scroller.current?.scrollTo({ top: 0 })
  }, [activeCategory, searchQuery, formatFilter, sortMode])

  // Render tiles in pages as the user scrolls instead of mounting 1,300+ cards at once.
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setLimit((l) => Math.min(l + PAGE, list.length)), { root: scroller.current, rootMargin: '800px' })
    io.observe(el)
    return () => io.disconnect()
  }, [list.length, shown.length])

  const gridCols = density === 'compact' ? 'grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3' : 'grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4'

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <header className={`glass z-10 flex items-center gap-3 border-b border-line px-6 pb-3 [-webkit-app-region:drag] ${isMac ? 'pt-9' : 'pt-1.5 pr-[150px]'}`}>
        <div className="relative max-w-md flex-1 [-webkit-app-region:no-drag]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            id="vantage-search"
            type="search"
            aria-label="Search wallpapers"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setSearchQuery(''), (e.target as HTMLInputElement).blur())}
            placeholder="Search characters, games, places…"
            className="h-9 w-full rounded-xl border border-line bg-white/[0.04] pl-9 pr-16 text-[13px] text-ink placeholder-ink-faint outline-none transition focus:border-glow/50 focus:bg-white/[0.06] [&::-webkit-search-cancel-button]:hidden"
          />
          {searchQuery ? (
            <button onClick={() => setSearchQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-ink-faint hover:bg-white/10 hover:text-ink">
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <span className="kbd absolute right-2.5 top-1/2 -translate-y-1/2">{isMac ? '⌘K' : 'Ctrl K'}</span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5 [-webkit-app-region:no-drag]">
          <label className="relative flex items-center">
            <ArrowUpDown className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-ink-faint" />
            <select
              aria-label="Sort wallpapers"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="h-9 appearance-none rounded-xl border border-line bg-white/[0.04] pl-8 pr-3 text-[12px] text-ink outline-none transition hover:border-line-strong focus:border-glow/50"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
          <div className="flex h-9 items-center rounded-xl border border-line bg-white/[0.04] p-0.5" role="group" aria-label="Grid density">
            <button onClick={() => setDensity('comfy')} aria-pressed={density === 'comfy'} aria-label="Large tiles" className={`grid h-8 w-8 place-items-center rounded-[10px] transition ${density === 'comfy' ? 'bg-white/10 text-ink' : 'text-ink-faint hover:text-ink'}`}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button onClick={() => setDensity('compact')} aria-pressed={density === 'compact'} aria-label="Small tiles" className={`grid h-8 w-8 place-items-center rounded-[10px] transition ${density === 'compact' ? 'bg-white/10 text-ink' : 'text-ink-faint hover:text-ink'}`}>
              <Grid3x3 className="h-4 w-4" />
            </button>
          </div>
          <button onClick={() => shuffle()} className="btn-ghost h-9" title="Apply a random wallpaper from this view to the selected display">
            <Shuffle className="h-4 w-4" /> Shuffle
          </button>
        </div>
      </header>

      <div ref={scroller} className="flex-1 overflow-y-auto px-6 pb-10 pt-6">
        {activeCategory === 'all' && !searchQuery && <NowPlaying />}

        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-ink">{searchQuery ? `Results for “${searchQuery}”` : meta.title}</h1>
            <p className="mt-0.5 text-[13px] text-ink-dim">
              {isLoading ? 'Loading…' : `${list.length.toLocaleString()} wallpaper${list.length === 1 ? '' : 's'}`}
              {!searchQuery && meta.blurb ? ` · ${meta.blurb}` : ''}
            </p>
          </div>
          {activeCategory !== 'generative' && activeCategory !== 'static' && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Format">
              {FORMATS.map((f) => (
                <button key={f.id} onClick={() => setFormatFilter(f.id)} aria-pressed={formatFilter === f.id} className={`chip ${formatFilter === f.id ? 'chip-on' : ''}`}>
                  {f.id === 'video' && <Play className="h-3 w-3 fill-current" />}
                  {f.id === 'generative' && <GenerativeIcon className="h-3.5 w-3.5" />}
                  {f.label}
                  {f.id === 'generative' && counts.generative ? <span className="font-mono text-[10px] opacity-60">{counts.generative}</span> : null}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-ember/30 bg-ember/10 px-4 py-3 text-[13px] text-ember">
            {error}
          </div>
        )}

        {isLoading && wallpapers.length === 0 ? (
          <div className={`grid ${gridCols}`}>
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="skeleton aspect-video rounded-xl" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState category={activeCategory} query={searchQuery} />
        ) : (
          <>
            <div className={`grid ${gridCols} transition-opacity ${isLoading ? 'opacity-50' : ''}`}>
              {shown.map((item, i) => (
                <WallpaperTile key={item.id} item={item} index={i} />
              ))}
            </div>
            {shown.length < list.length && <div ref={sentinel} className="h-px" aria-hidden />}
          </>
        )}
      </div>
    </div>
  )
}
