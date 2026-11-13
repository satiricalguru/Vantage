import React from 'react'
import { ExternalLink, Globe, FolderDown, Package, Github } from 'lucide-react'
import { GenerativeIcon } from '../components/GenerativeIcon'
import { useGalleryStore } from '../store/useGalleryStore'

const isMac = navigator.userAgent.includes('Mac')

export const SourcesAndCredits: React.FC = () => {
  const { counts } = useGalleryStore()
  const open = (url: string) => window.galleryApi?.openExternal(url)

  const sources = [
    {
      icon: Globe,
      name: 'MotionBGS',
      what: 'Most of the streamed video catalog',
      detail: 'Videos stream from motionbgs.com on demand and are cached locally. The artwork belongs to its original creators and rights holders; check MotionBGS’s terms before redistributing any file.',
      url: 'https://motionbgs.com'
    },
    {
      icon: Package,
      name: 'Bundled wallpapers',
      what: 'A few loops that ship inside the app',
      detail: 'Included so Vantage works offline on first launch.'
    },
    {
      icon: GenerativeIcon,
      name: 'Vantage generative engine',
      what: `${counts.generative ? `${counts.generative} procedural scenes` : 'Procedural scenes'} rendered live on your GPU`,
      detail: 'Original shader code, MIT licensed with the rest of Vantage. Nothing is downloaded.'
    },
    {
      icon: FolderDown,
      name: 'Your imports',
      what: 'Files you add',
      detail: 'Imported videos and images stay on your Mac or PC and are never uploaded anywhere.'
    }
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className={`mx-auto max-w-3xl space-y-5 px-8 pb-12 animate-rise ${isMac ? 'pt-12' : 'pt-8'}`}>
        <div className="[-webkit-app-region:drag]">
          <h1 className="text-[24px] font-semibold tracking-tight text-ink">Sources & credits</h1>
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-ink-dim">
            Where your wallpapers come from. Each wallpaper’s detail view shows its own source and license.
          </p>
        </div>

        <div className="grid gap-3">
          {sources.map((s) => {
            const Icon = s.icon
            return (
              <div key={s.name} className="flex gap-4 rounded-2xl border border-line bg-panel/60 p-4 shadow-card">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-glow/10 text-glow">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <h3 className="text-[14px] font-semibold text-ink">{s.name}</h3>
                    <span className="text-[12px] text-ink-dim">{s.what}</span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-ink-dim">{s.detail}</p>
                </div>
                {s.url && (
                  <button onClick={() => open(s.url!)} className="btn-ghost h-8 self-start px-2.5 text-[12px]">
                    Visit <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-line bg-void/60 px-4 py-3.5 text-[12px] text-ink-dim">
          <span>Vantage is free and open source under the MIT License.</span>
          <button onClick={() => open('https://github.com/satiricalguru/Vantage')} className="flex items-center gap-1.5 text-ink hover:text-glow">
            <Github className="h-4 w-4" /> Source code
          </button>
        </div>
      </div>
    </div>
  )
}
