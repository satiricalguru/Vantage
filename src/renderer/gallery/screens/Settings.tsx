import React, { useEffect, useRef, useState } from 'react'
import { useGalleryStore } from '../store/useGalleryStore'
import type { AppSettings, CacheStatus } from '../../../shared/types'
import { Zap, HardDrive, RefreshCw, AppWindow, Monitor } from 'lucide-react'

export const Settings: React.FC = () => {
  const { displays, fetchDisplays } = useGalleryStore()
  const [settings, setSettingsState] = useState<AppSettings>({
    openAtLogin: true,
    showInDock: false,
    maxCacheSizeGb: 5,
    theme: 'dark'
  })
  const [clearedBytes, setClearedBytes] = useState<number | null>(null)
  const [screenSaverBusy, setScreenSaverBusy] = useState(false)
  const [screenSaverMessage, setScreenSaverMessage] = useState<string | null>(null)

  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null)

const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSaveRef = useRef<Partial<AppSettings> | null>(null)

  const saveSettingsDebounced = (patch: Partial<AppSettings>) => {
    pendingSaveRef.current = { ...pendingSaveRef.current, ...patch }
    setSettingsState((prev) => ({ ...prev, ...patch }))
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      saveTimeout.current = null
      const toSend = pendingSaveRef.current
      pendingSaveRef.current = null
      if (toSend && window.galleryApi) window.galleryApi.setSettings(toSend).catch(() => {})
    }, 400)
  }

  useEffect(() => {
    // Flush any pending debounced change on unmount
    return () => {
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current)
        saveTimeout.current = null
      }
      const toSend = pendingSaveRef.current
      if (toSend && window.galleryApi) window.galleryApi.setSettings(toSend).catch(() => {})
      pendingSaveRef.current = null
    }
  }, [])

  useEffect(() => {
    if (window.galleryApi) {
      window.galleryApi
        .getSettings()
        .then((res) => {
          if (res) setSettingsState(res)
        })
        .catch(() => {})
      window.galleryApi
        .getCacheStatus()
        .then((status) => {
          if (status) setCacheStatus(status)
        })
        .catch(() => {})
    }
  }, [])

  const handlePerformanceChange = async (displayId: number, mode: string) => {
    if (!window.galleryApi) return
    try {
      await window.galleryApi.setPerformanceMode(displayId, mode)
    } catch (err) {
      console.warn('[Settings] Failed to set performance mode for display', displayId, err)
    }
    await fetchDisplays().catch(() => {})
  }

const handleSaveSettings = async (partial: Partial<AppSettings>) => {
    // Cancel any pending debounced save and fold it into this immediate write
    // so an older debounced partial can never land after a newer one.
    const merged = { ...(pendingSaveRef.current ?? {}), ...partial }
    pendingSaveRef.current = null
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current)
      saveTimeout.current = null
    }
    // Use the functional update: rapid successive saves must not compute from
    // the same stale base and drop the last toggle.
    setSettingsState((prev) => ({ ...prev, ...partial }))
    if (window.galleryApi) {
      try {
        await window.galleryApi.setSettings(merged)
      } catch (err) {
        console.warn('[Settings] Failed to save settings:', err)
      }
    }
  }

  const handleClearCache = async () => {
    if (!window.galleryApi) return
    try {
      const bytes = await window.galleryApi.clearCache()
      setClearedBytes(bytes)
      const updatedStatus = await window.galleryApi.getCacheStatus()
      if (updatedStatus) setCacheStatus(updatedStatus)
    } catch (err) {
      console.warn('[Settings] Failed to clear cache:', err)
    }
  }

  const handleFreeUpMemory = async () => {
    if (!window.galleryApi?.freeUpMemory) return
    try {
      const res = await window.galleryApi.freeUpMemory()
      setClearedBytes(res.freedMb * 1024 * 1024)
      const updatedStatus = await window.galleryApi.getCacheStatus()
      if (updatedStatus) setCacheStatus(updatedStatus)
    } catch (err) {
      console.warn('[Settings] Failed to free memory:', err)
    }
  }

  const handleSetupScreenSaver = async () => {
    if (!window.galleryApi || screenSaverBusy) return
    setScreenSaverBusy(true)
    setScreenSaverMessage(null)
    try {
      await window.galleryApi.setupScreenSaver()
      setScreenSaverMessage('Installed and activated. Test with Screen Saver or a hot corner before locking; macOS will now use Vantage for the Screen Saver.')
    } catch (err) {
      console.error('[ScreenSaver] Setup failed:', err)
      setScreenSaverMessage('Could not install the native Screen Saver. Build the macOS app first.')
    } finally {
      setScreenSaverBusy(false)
    }
  }

  return (
    <div className="p-6 pt-8 max-w-4xl mx-auto space-y-8 animate-fade-in overflow-y-auto h-full">
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

          <div className="flex items-center justify-between gap-4 p-3 bg-void border border-line rounded-lg">
            <div>
              <div className="text-sm font-semibold text-ink">macOS Lock Screen & Screen Saver</div>
              <div className="text-xs text-ink-dim">
                Vantage automatically syncs your wallpaper's thumbnail image as the macOS system background for your Lock Screen. Install the native Screen Saver below to play your live video wallpaper on the Lock Screen.
              </div>
            </div>
            <button
              onClick={handleSetupScreenSaver}
              disabled={screenSaverBusy}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded bg-glow/10 border border-glow/30 text-xs font-mono text-glow hover:bg-glow/20 disabled:opacity-50 transition"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>{screenSaverBusy ? 'Activating…' : 'Install & Activate'}</span>
            </button>
          </div>

          {screenSaverMessage && (
            <div className="text-xs font-mono text-glow bg-glow/10 border border-glow/20 rounded p-2">
              {screenSaverMessage}
            </div>
          )}

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
                  Resolution: {Math.round(disp.bounds.width * (disp.scaleFactor || 1))}×{Math.round(disp.bounds.height * (disp.scaleFactor || 1))}
                  {disp.scaleFactor && disp.scaleFactor > 1 ? ` (${disp.bounds.width}×${disp.bounds.height} @ ${disp.scaleFactor}x Retina)` : ''}
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

        <div className="space-y-2 p-3 bg-void border border-line rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-ink">Max Storage Limit</div>
              <div className="text-xs text-ink-dim">
                Maximum disk space allocated for cached video wallpapers.
              </div>
            </div>
            <span className="text-xs font-mono text-glow bg-glow/10 border border-glow/20 px-2.5 py-1 rounded">
              {settings.maxCacheSizeGb} GB
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="100"
            step="1"
            value={settings.maxCacheSizeGb}
            onChange={(e) => saveSettingsDebounced({ maxCacheSizeGb: Number(e.target.value) })}
            className="w-full accent-glow cursor-pointer"
          />
        </div>

        <div className="flex items-center justify-between p-3 bg-void border border-line rounded-lg">
          <div>
            <div className="text-sm font-semibold text-ink">Free Up System Memory</div>
            <div className="text-xs text-ink-dim">
              Purges V8 RAM cache, flushes wallpaper video buffers, and optimizes system memory.
            </div>
          </div>
          <button
            onClick={handleFreeUpMemory}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-glow/10 border border-glow/30 text-xs font-mono text-glow hover:bg-glow/20 transition"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Free Up RAM</span>
          </button>
        </div>

        <div className="flex items-center justify-between p-3 bg-void border border-line rounded-lg">
          <div>
            <div className="text-sm font-semibold text-ink">Clear Asset Cache</div>
            <div className="text-xs text-ink-dim">
              Evicts downloaded remote wallpaper videos and images.
              {cacheStatus && (
                <span className="block mt-1 font-mono text-[11px] text-glow">
                  Current Usage: {(cacheStatus.usedBytes / (1024 * 1024)).toFixed(1)} MB / {(cacheStatus.limitBytes / (1024 * 1024 * 1024)).toFixed(1)} GB limit · {cacheStatus.count} cached {cacheStatus.count === 1 ? 'wallpaper' : 'wallpapers'}
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
