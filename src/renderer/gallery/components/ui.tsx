import React, { useEffect, useRef, useState } from 'react'
import { CheckCircle2, AlertTriangle, X } from 'lucide-react'
import type { WallpaperItem } from '../store/useGalleryStore'
import { useGalleryStore } from '../store/useGalleryStore'
import { getShaderStill, getThumbRenderer, isShaderGenerator } from '../../shared/shaders'
import { ApertureIrisIcon } from './ApertureIrisIcon'

const LEGACY_GRADIENTS: Record<string, string> = {
  aurora: 'radial-gradient(120% 90% at 30% 80%, rgba(110,231,218,0.45), transparent 60%), linear-gradient(180deg,#0b1016,#07080b)',
  quantum: 'radial-gradient(60% 60% at 50% 50%, rgba(110,231,218,0.25), transparent 70%), #07080b',
  nebula: 'radial-gradient(80% 70% at 60% 40%, rgba(181,156,255,0.35), transparent 60%), radial-gradient(70% 60% at 30% 70%, rgba(110,231,218,0.25), transparent 60%), #07080b'
}

/** Live shader preview drawn from the shared thumbnail WebGL context into a 2D canvas. */
const ShaderPreview: React.FC<{ id: string; animate: boolean }> = ({ id, animate }) => {
  const [still, setStill] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    // Defer still rendering so a full grid of generators never blocks first paint.
    const handle = window.requestIdleCallback ? window.requestIdleCallback(() => setStill(getShaderStill(id))) : window.setTimeout(() => setStill(getShaderStill(id)), 30)
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(handle as number) : clearTimeout(handle as number))
  }, [id])

  useEffect(() => {
    if (!animate) return
    const r = getThumbRenderer()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!r || !canvas || !ctx || !r.setGenerator(id)) return
    let raf = 0
    let t = 14
    let last = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (now - last < 1000 / 30) return
      t += last ? (now - last) / 1000 : 0
      last = now
      r.setGenerator(id)
      r.render(t, 0.5, 0.5)
      ctx.drawImage(r.canvas, 0, 0, canvas.width, canvas.height)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [animate, id])

  return (
    <>
      {still ? <img src={still} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 skeleton" />}
      {animate && <canvas ref={canvasRef} width={480} height={270} className="absolute inset-0 h-full w-full object-cover" />}
    </>
  )
}

interface MediaThumbProps {
  item: WallpaperItem
  active?: boolean
  className?: string
}

/** Tile/hero artwork: lazy still image, hover-to-play video, or procedural preview. */
export const MediaThumb: React.FC<MediaThumbProps> = ({ item, active = false, className = 'relative' }) => {
  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const canPlayVideo = item.type === 'video' && !videoError && !/^https?:\/\//i.test(item.sourceUrl)

  if (item.type === 'generative') {
    return (
      <div className={`overflow-hidden ${className}`}>
        {isShaderGenerator(item.generatorId) ? (
          <ShaderPreview id={item.generatorId!} animate={active} />
        ) : (
          <div className="absolute inset-0" style={{ background: LEGACY_GRADIENTS[item.generatorId ?? 'aurora'] ?? LEGACY_GRADIENTS.aurora }} />
        )}
      </div>
    )
  }

  const src = item.previewUrl || item.sourceUrl
  return (
    <div className={`overflow-hidden bg-panel ${className}`}>
      {!imgLoaded && !imgError && <div className="absolute inset-0 skeleton" />}
      {imgError || !src ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-panel to-void">
          <ApertureIrisIcon className="h-7 w-7 text-glow/50" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">Preview unavailable</span>
        </div>
      ) : (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
          className={`absolute inset-0 h-full w-full object-cover transition duration-700 ${imgLoaded ? 'opacity-100' : 'opacity-0'} ${active ? 'scale-[1.06]' : 'scale-100'}`}
        />
      )}
      {active && canPlayVideo && (
        <video
          src={item.sourceUrl}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          onError={() => setVideoError(true)}
          className="absolute inset-0 h-full w-full object-cover animate-fade-in"
        />
      )}
    </div>
  )
}

export const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? 'bg-glow' : 'bg-white/10'}`}
  >
    <span className={`absolute left-0 top-0.5 h-5 w-5 rounded-full shadow transition-transform ${checked ? 'bg-void' : 'bg-white'} ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
  </button>
)

export const Toasts: React.FC = () => {
  const { toasts, dismissToast } = useGalleryStore()
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="glass pointer-events-auto flex max-w-[460px] items-center gap-2.5 rounded-full border border-line-strong py-2 pl-3 pr-2 text-[13px] text-ink shadow-lift animate-pop">
          {t.tone === 'ok' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-glow" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-ember" />}
          <span className="truncate">{t.message}</span>
          <button onClick={() => dismissToast(t.id)} aria-label="Dismiss" className="rounded-full p-1 text-ink-faint hover:bg-white/10 hover:text-ink">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

export const SectionCard: React.FC<{ icon: React.ElementType; title: string; subtitle?: string; children: React.ReactNode }> = ({ icon: Icon, title, subtitle, children }) => (
  <section className="rounded-2xl border border-line bg-panel/60 p-1.5 shadow-card">
    <div className="flex items-center gap-3 px-4 pb-3 pt-3.5">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-glow/10 text-glow">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="text-[12px] text-ink-dim">{subtitle}</p>}
      </div>
    </div>
    <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-void/60">{children}</div>
  </section>
)

export const Row: React.FC<{ title: string; description?: React.ReactNode; children?: React.ReactNode }> = ({ title, description, children }) => (
  <div className="flex items-center justify-between gap-6 px-4 py-3.5">
    <div className="min-w-0">
      <div className="text-[13px] font-medium text-ink">{title}</div>
      {description && <div className="mt-0.5 text-[12px] leading-relaxed text-ink-dim">{description}</div>}
    </div>
    {children && <div className="shrink-0">{children}</div>}
  </div>
)
