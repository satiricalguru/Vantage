import React, { useEffect, useState } from 'react'
import { useGalleryStore } from '../store/useGalleryStore'
import { Zap, HardDrive, Key, RefreshCw, AppWindow, Sliders } from 'lucide-react'

export const Settings: React.FC = () => {
  const { displays, fetchDisplays } = useGalleryStore()
  const [settings, setSettingsState] = useState<any>({
    openAtLogin: true,
    showInDock: false,
    pexelsApiKey: '',
    unsplashApiKey: '',
    maxCacheSizeGb: 5
  })
  const [clearedBytes, setClearedBytes] = useState<number | null>(null)

  const [cacheStatus, setCacheStatus] = useState<{ usedBytes: number; limitBytes: number } | null>(null)

  useEffect(() => {
    if (window.galleryApi) {
      window.galleryApi.getSettings().then((res) => {
        if (res) setSettingsState(res)
      })
      window.galleryApi.getCacheStatus().then((status) => {
        if (status) setCacheStatus(status)
      })
    }
  }, [])

  const handlePerformanceChange = async (displayId: number, mode: string) => {
    if (window.galleryApi) {
      await window.galleryApi.setPerformanceMode(displayId, mode)
      await fetchDisplays()
    }
  }

  const handleSaveSettings = async (partial: any) => {
    const updated = { ...settings, ...partial }
    setSettingsState(updated)
    if (window.galleryApi) {
      if ('openAtLogin' in partial) {
        await window.galleryApi.setLoginAtLogin(partial.openAtLogin)
      }
      await window.galleryApi.setSettings(partial)
    }
  }

  const handleClearCache = async () => {
    if (window.galleryApi) {
      const bytes = await window.galleryApi.clearCache()
      setClearedBytes(bytes)
      const updatedStatus = await window.galleryApi.getCacheStatus()
      if (updatedStatus) setCacheStatus(updatedStatus)
    }
  }

  return (
    <div className="p-6 pt-8 max-w-4xl mx-auto space-y-8 animate-fade-in">
      <div className="[-webkit-app-region:drag]">
        <h1 className="text-2xl font-bold text-ink mb-1">Preferences & System Settings</h1>
        <p className="text-sm text-ink-dim">
          Configure frame rates, background energy optimization, dock visibility, and cache limits.
        </p>
      </div>

      {/* General Options */}
      <section className="bg-panel border border-line rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-glow font-mono text-xs uppercase tracking-wider">
          <AppWindow className="w-4 h-4" />
          <span>System & Window Behavior</span>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-void border border-line rounded-lg">
            <div>
              <div className="text-sm font-semibold text-ink">Launch at Login</div>
              <div className="text-xs text-ink-dim">
                Automatically launch Vantage in the background when you log into macOS.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.openAtLogin}
              onChange={(e) => handleSaveSettings({ openAtLogin: e.target.checked })}
              className="w-4 h-4 accent-glow cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-void border border-line rounded-lg">
            <div>
              <div className="text-sm font-semibold text-ink">Show in macOS Dock</div>
              <div className="text-xs text-ink-dim">
                When enabled, Vantage will appear in the macOS Dock in addition to the Menu Bar.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.showInDock}
              onChange={(e) => handleSaveSettings({ showInDock: e.target.checked })}
              className="w-4 h-4 accent-glow cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-void border border-line rounded-lg">
            <div>
              <div className="text-sm font-semibold text-ink">Show on macOS Lock Screen</div>
              <div className="text-xs text-ink-dim">
                Keep live video and generative wallpapers active on the macOS Lock Screen when system is locked.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.showOnLockScreen ?? true}
              onChange={(e) => handleSaveSettings({ showOnLockScreen: e.target.checked })}
              className="w-4 h-4 accent-glow cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-void border border-line rounded-lg">
            <div>
              <div className="text-sm font-semibold text-ink">Close to Background</div>
              <div className="text-xs text-ink-dim">
                Clicking the red close button (X) hides the gallery to the background while wallpapers keep playing.
              </div>
            </div>
            <span className="text-xs font-mono text-glow px-2 py-0.5 rounded bg-glow/10 border border-glow/20">
              Enabled (Wallpaper X Behavior)
            </span>
          </div>
        </div>
      </section>


      {/* Performance & Energy Modes */}
      <section className="bg-panel border border-line rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-glow font-mono text-xs uppercase tracking-wider">
          <Zap className="w-4 h-4" />
          <span>Per-Display Performance Controls</span>
        </div>

        <div className="space-y-4">
          {displays.map((disp) => (
            <div
              key={disp.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-void border border-line rounded-lg gap-3"
            >
              <div>
                <div className="font-semibold text-sm text-ink">{disp.label}</div>
                <div className="text-xs font-mono text-ink-dim">
                  Resolution: {disp.bounds.width}×{disp.bounds.height}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {['quality', 'balanced', 'battery-saver'].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => handlePerformanceChange(disp.id, mode)}
                    className={`px-3 py-1.5 rounded text-xs font-mono capitalize border transition ${
                      disp.performanceMode === mode
                        ? 'bg-glow/10 border-glow/40 text-glow'
                        : 'bg-panel-hover border-line text-ink-dim hover:text-ink'
                    }`}
                  >
                    {mode.replace('-', ' ')}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Disk Cache & Storage */}
      <section className="bg-panel border border-line rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-glow font-mono text-xs uppercase tracking-wider">
          <HardDrive className="w-4 h-4" />
          <span>Disk Cache & Storage</span>
        </div>

        <div className="flex items-center justify-between p-3 bg-void border border-line rounded-lg">
          <div>
            <div className="text-sm font-semibold text-ink">Clear Asset Cache</div>
            <div className="text-xs text-ink-dim">
              Evicts downloaded remote wallpaper videos and images.
              {cacheStatus && (
                <span className="block mt-1 font-mono text-[11px] text-glow">
                  Current Usage: {(cacheStatus.usedBytes / (1024 * 1024)).toFixed(1)} MB / {(cacheStatus.limitBytes / (1024 * 1024 * 1024)).toFixed(1)} GB limit
                </span>
              )}
            </div>
          </div>
          <button
            onClick={handleClearCache}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-panel-hover border border-line text-xs font-mono text-ink hover:border-glow/40 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Clear Cache</span>
          </button>
        </div>

        {clearedBytes !== null && (
          <div className="text-xs font-mono text-glow bg-glow/10 border border-glow/20 rounded p-2 text-center">
            Cleared {(clearedBytes / (1024 * 1024)).toFixed(1)} MB of cached assets.
          </div>
        )}
      </section>
    </div>
  )
}