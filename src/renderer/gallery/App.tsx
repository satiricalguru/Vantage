import React, { useEffect, useMemo } from 'react'
import { useGalleryStore } from './store/useGalleryStore'
import { Gallery } from './screens/Gallery'
import { Settings } from './screens/Settings'
import { SourcesAndCredits } from './screens/SourcesAndCredits'
import { ItemDetail } from './screens/ItemDetail'
import { ApertureIrisIcon } from './components/ApertureIrisIcon'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Toasts } from './components/ui'
import { GenerativeIcon } from './components/GenerativeIcon'
import {
  Compass,
  Flame,
  Shield,
  Gamepad2,
  TreePine,
  Rocket,
  Palette,
  FolderDown,
  Heart,
  Image as ImageIcon,
  Settings as SettingsIcon,
  ShieldCheck,
  Plus,
  Car,
  Monitor,
  FolderOpen
} from 'lucide-react'

const isMac = navigator.userAgent.includes('Mac')

const LIBRARY = [
  { id: 'all', label: 'Discover', icon: Compass },
  { id: 'favorites', label: 'Favorites', icon: Heart },
  { id: 'imported', label: 'My Imports', icon: FolderDown }
]
const CATEGORIES = [
  { id: 'anime', label: 'Anime', icon: Flame },
  { id: 'games', label: 'Gaming', icon: Gamepad2 },
  { id: 'heroes', label: 'Heroes & Comics', icon: Shield },
  { id: 'nature', label: 'Nature', icon: TreePine },
  { id: 'space', label: 'Space', icon: Rocket },
  { id: 'cars', label: 'Cars & Streets', icon: Car },
  { id: 'ai-art', label: 'Digital Art', icon: Palette },
  { id: 'generative', label: 'Generative', icon: GenerativeIcon },
  { id: 'static', label: 'Still Images', icon: ImageIcon }
]

export const App: React.FC = () => {
  const {
    activeCategory,
    setActiveCategory,
    activeScreen,
    setActiveScreen,
    selectedWallpaper,
    setSelectedWallpaper,
    fetchWallpapers,
    fetchDisplays,
    fetchCounts,
    importFile,
    openWallpaperFolder,
    counts,
    displays,
    selectedDisplayId,
    setSelectedDisplayId
  } = useGalleryStore()

  useEffect(() => {
    fetchWallpapers()
    fetchDisplays()
    fetchCounts()
    if (!window.galleryApi) return
    const unsub = window.galleryApi.onDisplayChanged(() => fetchDisplays())
    const unsubNav = window.galleryApi.onNavigate?.((screen) => {
      if (screen === 'settings' || screen === 'credits' || screen === 'gallery') setActiveScreen(screen)
    })
    const unsubCatalog = window.galleryApi.onCatalogChanged(() => {
      fetchWallpapers(true)
      fetchCounts()
    })
    return () => {
      unsub()
      unsubNav?.()
      unsubCatalog()
    }
  }, [])

  // Global shortcuts: ⌘/Ctrl+K or / → search, ⌘/Ctrl+, → preferences, ⌘/Ctrl+O → import
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if ((mod && e.key.toLowerCase() === 'k') || (!typing && e.key === '/')) {
        e.preventDefault()
        setActiveScreen('gallery')
        requestAnimationFrame(() => document.getElementById('vantage-search')?.focus())
      } else if (mod && e.key === ',') {
        e.preventDefault()
        setActiveScreen('settings')
      } else if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        importFile()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [importFile, setActiveScreen])

  const navItem = (cat: { id: string; label: string; icon: React.ElementType }) => {
    const Icon = cat.icon
    const isActive = activeScreen === 'gallery' && activeCategory === cat.id
    const count = counts[cat.id]
    return (
      <button
        key={cat.id}
        onClick={() => setActiveCategory(cat.id)}
        aria-current={isActive ? 'page' : undefined}
        className={`group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition ${
          isActive ? 'bg-white/[0.07] text-ink' : 'text-ink-dim hover:bg-white/[0.04] hover:text-ink'
        }`}
      >
        {isActive && <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-glow" />}
        <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-glow' : ''}`} />
        <span className="truncate">{cat.label}</span>
        {count !== undefined && count > 0 && <span className="ml-auto font-mono text-[10px] tabular-nums text-ink-faint">{count.toLocaleString()}</span>}
      </button>
    )
  }

  const assigned = useMemo(() => new Map(displays.map((d) => [d.id, d.assignedWallpaperId])), [displays])

  return (
    <ErrorBoundary>
      <div className="flex h-screen w-screen select-none overflow-hidden bg-void text-ink">
        <aside className="flex w-[232px] shrink-0 flex-col border-r border-line bg-panel/50">
          <div className={`flex items-center gap-2.5 px-4 pb-3 [-webkit-app-region:drag] ${isMac ? 'pt-11' : 'pt-4'}`}>
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-white/15 to-white/[0.03] ring-1 ring-white/10">
              <ApertureIrisIcon className="h-4 w-4 text-glow" />
            </div>
            <span className="text-[15px] font-semibold tracking-tight">Vantage</span>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-2.5 pb-3">
            {displays.length > 0 && (
              <div>
                <div className="px-2.5 pb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint">Displays</div>
                <div className="space-y-1">
                  {displays.map((d, i) => {
                    const isSel = d.id === selectedDisplayId
                    return (
                      <button
                        key={d.id}
                        onClick={() => setSelectedDisplayId(d.id)}
                        title="Target display for quick apply and shuffle"
                        className={`flex w-full items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left transition ${
                          isSel ? 'border-glow/30 bg-glow/[0.06]' : 'border-transparent hover:bg-white/[0.04]'
                        }`}
                      >
                        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${isSel ? 'bg-glow/15 text-glow' : 'bg-white/[0.05] text-ink-dim'}`}>
                          <Monitor className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] font-medium text-ink">{d.label || `Display ${i + 1}`}</span>
                          <span className="block truncate text-[10px] text-ink-faint">
                            {assigned.get(d.id) ? 'Live' : 'No wallpaper'} · {Math.round(d.bounds.width * (d.scaleFactor || 1))}×{Math.round(d.bounds.height * (d.scaleFactor || 1))}
                          </span>
                        </span>
                        {isSel && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-glow shadow-[0_0_8px_rgba(255,255,255,0.8)]" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <nav aria-label="Library" className="space-y-0.5">
              <div className="px-2.5 pb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint">Library</div>
              {LIBRARY.map(navItem)}
            </nav>

            <nav aria-label="Categories" className="space-y-0.5">
              <div className="px-2.5 pb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint">Categories</div>
              {CATEGORIES.map(navItem)}
            </nav>
          </div>

          <div className="space-y-0.5 border-t border-line p-2.5">
            <button onClick={() => importFile()} className="btn-primary mb-2 w-full">
              <Plus className="h-4 w-4" />
              Import wallpaper
              <span className="ml-auto font-mono text-[10px] opacity-60">{isMac ? '⌘O' : 'Ctrl O'}</span>
            </button>
            <button
              onClick={() => openWallpaperFolder()}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] text-ink-dim transition hover:bg-white/[0.04] hover:text-ink"
              title="Open the watched wallpapers folder — drop MP4/MOV/WebM or images in it"
            >
              <FolderOpen className="h-4 w-4" />
              <span>Open watched folder</span>
            </button>
            <button
              onClick={() => setActiveScreen('settings')}
              aria-current={activeScreen === 'settings' ? 'page' : undefined}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition ${
                activeScreen === 'settings' ? 'bg-white/[0.07] text-ink' : 'text-ink-dim hover:bg-white/[0.04] hover:text-ink'
              }`}
            >
              <SettingsIcon className="h-4 w-4" />
              <span>Preferences</span>
              <span className="ml-auto font-mono text-[10px] text-ink-faint">{isMac ? '⌘,' : 'Ctrl ,'}</span>
            </button>
            <button
              onClick={() => setActiveScreen('credits')}
              aria-current={activeScreen === 'credits' ? 'page' : undefined}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition ${
                activeScreen === 'credits' ? 'bg-white/[0.07] text-ink' : 'text-ink-dim hover:bg-white/[0.04] hover:text-ink'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Sources & credits</span>
            </button>
          </div>
        </aside>

        <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          {activeScreen === 'gallery' && <Gallery />}
          {activeScreen === 'settings' && <Settings />}
          {activeScreen === 'credits' && <SourcesAndCredits />}
        </main>

        {selectedWallpaper && <ItemDetail item={selectedWallpaper} onClose={() => setSelectedWallpaper(null)} />}
        <Toasts />
      </div>
    </ErrorBoundary>
  )
}
