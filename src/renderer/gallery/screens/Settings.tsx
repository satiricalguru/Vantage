import React, { useEffect, useRef, useState } from 'react'
import { useGalleryStore } from '../store/useGalleryStore'
import type { AppSettings, CacheStatus } from '../../../shared/types'
import { Zap, HardDrive, RefreshCw, AppWindow, Monitor } from 'lucide-react'
import { SectionCard, Row, Toggle } from '../components/ui'

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

  const isMac = navigator.userAgent.includes('Mac')
  const usedMb = cacheStatus ? cacheStatus.usedBytes / (1024 * 1024) : 0
  const limitGb = cacheStatus ? cacheStatus.limitBytes / (1024 * 1024 * 1024) : settings.maxCacheSizeGb
  const usedPct = cacheStatus ? Math.min(100, (cacheStatus.usedBytes / cacheStatus.limitBytes) * 100) : 0
  const MODES: { id: string; label: string; hint: string }[] = [
    { id: 'quality', label: 'Quality', hint: '60 fps, full detail' },
    { id: 'balanced', label: 'Balanced', hint: '30 fps procedural' },
    { id: 'battery-saver', label: 'Battery', hint: '15 fps, lower res' }
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className={`mx-auto max-w-3xl space-y-5 px-8 pb-12 animate-rise ${isMac ? 'pt-12' : 'pt-8'}`}>
        <div className="[-webkit-app-region:drag]">
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">Preferences</h1>
          <p className="mt-1 text-[13px] text-ink-dim">Startup, energy and storage. Changes save automatically.</p>
        </div>

        <SectionCard icon={AppWindow} title="General" subtitle="How Vantage starts and where it lives">
          <Row title="Launch at login" description="Start Vantage quietly in the background when you sign in.">
            <Toggle label="Launch at login" checked={settings.openAtLogin} onChange={(v) => handleSaveSettings({ openAtLogin: v })} />
          </Row>
          {isMac && (
            <Row title="Show in Dock" description="Vantage always lives in the menu bar. Turn this on to also show it in the Dock.">
              <Toggle label="Show in Dock" checked={settings.showInDock} onChange={(v) => handleSaveSettings({ showInDock: v })} />
            </Row>
          )}
          <Row title="Close keeps playing" description="Closing this window hides it — wallpapers keep running until you quit from the menu bar.">
            <span className="rounded-full bg-glow/10 px-2.5 py-1 text-[11px] font-medium text-glow">Always on</span>
          </Row>
          {isMac && (
            <Row
              title="Lock Screen & Screen Saver"
              description="Installs the native Vantage screen saver so your live wallpaper plays before you unlock. Test it from System Settings before relying on it."
            >
              <button onClick={handleSetupScreenSaver} disabled={screenSaverBusy} className="btn-ghost">
                <Monitor className="h-4 w-4" />
                {screenSaverBusy ? 'Installing…' : 'Install & activate'}
              </button>
            </Row>
          )}
          {screenSaverMessage && <div className="bg-glow/[0.06] px-4 py-3 text-[12px] text-glow">{screenSaverMessage}</div>}
        </SectionCard>

        <SectionCard icon={Zap} title="Energy" subtitle="Frame rate and render resolution per display">
          {displays.length === 0 && <Row title="No displays detected" />}
          {displays.map((disp) => (
            <div key={disp.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5">
              <div>
                <div className="text-[13px] font-medium text-ink">{disp.label}</div>
                <div className="mt-0.5 font-mono text-[11px] text-ink-faint">
                  {Math.round(disp.bounds.width * (disp.scaleFactor || 1))} × {Math.round(disp.bounds.height * (disp.scaleFactor || 1))}
                  {disp.scaleFactor && disp.scaleFactor > 1 ? ` · ${disp.scaleFactor}× Retina` : ''}
                </div>
              </div>
              <div className="flex rounded-xl bg-white/[0.04] p-1 ring-1 ring-line" role="radiogroup" aria-label={`Performance for ${disp.label}`}>
                {MODES.map((mode) => {
                  const on = disp.performanceMode === mode.id
                  return (
                    <button
                      key={mode.id}
                      role="radio"
                      aria-checked={on}
                      title={mode.hint}
                      onClick={() => handlePerformanceChange(disp.id, mode.id)}
                      className={`rounded-lg px-3 py-1.5 text-[12px] font-medium transition ${on ? 'bg-glow text-void shadow' : 'text-ink-dim hover:text-ink'}`}
                    >
                      {mode.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <Row title="On battery" description="Vantage automatically drops to battery-saver cadence when your laptop is unplugged." />
        </SectionCard>

        <SectionCard icon={HardDrive} title="Storage" subtitle="Downloaded wallpapers are cached on disk for instant replays">
          <div className="space-y-3 px-4 py-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-medium text-ink">Cache limit</span>
              <span className="font-mono text-[12px] text-glow">{settings.maxCacheSizeGb} GB</span>
            </div>
            <input
              type="range"
              min="1"
              max="100"
              step="1"
              aria-label="Maximum cache size in gigabytes"
              value={settings.maxCacheSizeGb}
              onChange={(e) => saveSettingsDebounced({ maxCacheSizeGb: Number(e.target.value) })}
              className="w-full cursor-pointer accent-glow"
            />
            {cacheStatus && (
              <div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full bg-gradient-to-r from-white/60 to-white transition-[width] duration-500" style={{ width: `${usedPct}%` }} />
                </div>
                <p className="mt-1.5 font-mono text-[11px] text-ink-faint">
                  {usedMb.toFixed(1)} MB of {limitGb.toFixed(1)} GB · {cacheStatus.count} cached {cacheStatus.count === 1 ? 'wallpaper' : 'wallpapers'}
                </p>
              </div>
            )}
          </div>
          <Row title="Free up memory" description="Flushes video buffers and renderer caches. Playback restarts instantly.">
            <button onClick={handleFreeUpMemory} className="btn-ghost">
              <Zap className="h-4 w-4" /> Free up
            </button>
          </Row>
          <Row title="Clear download cache" description="Removes downloaded wallpapers. They re-download the next time you use them.">
            <button onClick={handleClearCache} className="btn-ghost">
              <RefreshCw className="h-4 w-4" /> Clear
            </button>
          </Row>
          {clearedBytes !== null && <div className="bg-glow/[0.06] px-4 py-3 text-[12px] text-glow">Freed {(clearedBytes / (1024 * 1024)).toFixed(1)} MB.</div>}
        </SectionCard>
      </div>
    </div>
  )
}
