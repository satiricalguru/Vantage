import React, { useEffect } from 'react'
import { useGalleryStore } from './store/useGalleryStore'
import { Gallery } from './screens/Gallery'
import { Settings } from './screens/Settings'
import { SourcesAndCredits } from './screens/SourcesAndCredits'
import { ItemDetail } from './screens/ItemDetail'
import { ApertureIrisIcon } from './components/ApertureIrisIcon'
import { ErrorBoundary } from './components/ErrorBoundary'
import {
  Compass,
  Flame,
  Shield,
  Gamepad2,
  TreePine,
  Rocket,
  Sparkles,
  Palette,
  FolderDown,
  Heart,
  Image as ImageIcon,
  Settings as SettingsIcon,
  ShieldCheck,
  PlusCircle
} from 'lucide-react'

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
    importFile,
    openWallpaperFolder
  } = useGalleryStore()

  useEffect(() => {
    fetchWallpapers()
    fetchDisplays()

    if (window.galleryApi) {
      const unsub = window.galleryApi.onDisplayChanged(() => {
        fetchDisplays()
      })
      const unsubCatalog = window.galleryApi.onCatalogChanged(() => {
        fetchWallpapers()
      })
      return () => {
        unsub()
        unsubCatalog()
      }
    }
  }, [])

  const categories = [
    { id: 'all', label: 'All Wallpapers', icon: Compass },
    { id: 'anime', label: 'Anime World', icon: Flame },
    { id: 'games', label: 'Gaming & Esports', icon: Gamepad2 },
    { id: 'heroes', label: 'Heroes & Comics', icon: Shield },
    { id: 'nature', label: 'Nature & Oceans', icon: TreePine },
    { id: 'space', label: 'Space & NASA', icon: Rocket },
    { id: 'generative', label: 'Generative Canvas', icon: Sparkles },
    { id: 'ai-art', label: 'AI Art Pipeline', icon: Palette },
    { id: 'static', label: 'Static Wallpapers', icon: ImageIcon },
    { id: 'imported', label: 'My Imports', icon: FolderDown },
    { id: 'favorites', label: 'Favorites', icon: Heart }
  ]

  return (
    <ErrorBoundary>
    <div className="flex h-screen w-screen bg-void text-ink select-none overflow-hidden">
      {/* Sidebar Rail */}
      <aside className="w-56 bg-panel/70 border-r border-line flex flex-col justify-between px-3 pb-3 pt-8 select-none">
        <div>
          {/* App Header Branding with macOS Traffic Light Clearance */}
          <div className="flex items-center gap-2.5 px-3 py-2.5 mb-4 [-webkit-app-region:drag]">
            <ApertureIrisIcon className="w-5 h-5 text-glow shrink-0" />
            <span className="font-bold text-base tracking-wide text-ink">Vantage</span>
            <span className="text-[10px] font-mono text-glow px-1.5 py-0.5 rounded bg-glow/10 border border-glow/20 ml-auto select-none">
              macOS
            </span>
          </div>

          {/* Navigation Categories */}
          <nav className="space-y-1">
            <div className="px-3 text-[10px] font-mono uppercase text-ink-dim tracking-wider mb-2">
              Catalog
            </div>
            {categories.map((cat) => {
              const Icon = cat.icon
              const isActive = activeScreen === 'gallery' && activeCategory === cat.id
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveScreen('gallery')
                    setActiveCategory(cat.id)
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                    isActive
                      ? 'bg-glow/10 text-glow border border-glow/30'
                      : 'text-ink-dim hover:text-ink hover:bg-panel-hover'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{cat.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Footer Actions & Settings */}
        <div className="space-y-1 border-t border-line pt-3">
          <button
            onClick={() => openWallpaperFolder()}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-ink-dim hover:text-ink hover:bg-panel-hover transition"
            title="Open local wallpapers folder in Finder to drag and drop MP4 / MOV files"
          >
            <FolderDown className="w-4 h-4 text-glow" />
            <span>Open Folder in Finder</span>
          </button>

          <button
            onClick={() => importFile()}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-ink-dim hover:text-ink hover:bg-panel-hover transition"
          >
            <PlusCircle className="w-4 h-4 text-glow" />
            <span>Import Personal File</span>
          </button>

          <button
            onClick={() => setActiveScreen('settings')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
              activeScreen === 'settings'
                ? 'bg-glow/10 text-glow border border-glow/30'
                : 'text-ink-dim hover:text-ink hover:bg-panel-hover'
            }`}
          >
            <SettingsIcon className="w-4 h-4" />
            <span>Preferences & Energy</span>
          </button>

          <button
            onClick={() => setActiveScreen('credits')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
              activeScreen === 'credits'
                ? 'bg-glow/10 text-glow border border-glow/30'
                : 'text-ink-dim hover:text-ink hover:bg-panel-hover'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Sources & Credits</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full bg-void overflow-hidden">
        {activeScreen === 'gallery' && <Gallery />}
        {activeScreen === 'settings' && <Settings />}
        {activeScreen === 'credits' && <SourcesAndCredits />}
      </main>

      {/* Detail Modal */}
      {selectedWallpaper && (
        <ItemDetail item={selectedWallpaper} onClose={() => setSelectedWallpaper(null)} />
      )}
    </div>
    </ErrorBoundary>
  )
}
