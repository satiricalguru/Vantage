import React from 'react'
import { ShieldCheck, CheckCircle2, Globe, Heart } from 'lucide-react'

export const SourcesAndCredits: React.FC = () => {
  const sources = [
    {
      name: 'NASA Image & Video Library',
      type: 'Space & Cosmic Media',
      license: 'Public Domain / US Government Work',
      attribution: 'Courtesy NASA / JPL / STScI / GSFC.',
      url: 'https://www.nasa.gov/multimedia/guidelines/'
    },
    {
      name: 'Generative Canvas Engine',
      type: 'Procedural WebGL / HTML5 Canvas',
      license: '100% Original Code (In-house Engine)',
      attribution: 'Built natively in TypeScript & WebGL.',
      url: '#'
    },
    {
      name: 'AI Art Pipeline',
      type: 'Generative Stills & Motion Overlay',
      license: 'Original AI Generated Content',
      attribution: 'Synthesized per request, explicitly labeled as AI-generated.',
      url: '#'
    }
  ]

  const openLink = (url: string) => {
    if (window.galleryApi && url !== '#') {
      window.galleryApi.openExternal(url)
    }
  }

  return (
    <div className="p-6 pt-8 max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="[-webkit-app-region:drag]">
        <div className="flex items-center gap-2 text-glow font-mono text-xs uppercase tracking-wider mb-1">
          <ShieldCheck className="w-4 h-4" />
          <span>Legal Compliance & Licensing Framework</span>
        </div>
        <h1 className="text-2xl font-bold text-ink">Content Sources & Credits</h1>
        <p className="text-sm text-ink-dim mt-1">
          Vantage is committed to 100% legally sound content sourcing. All media is strictly
          traced to verified open APIs, public domain databases, procedural code, or user imports.
        </p>
      </div>

      <div className="space-y-4">
        {sources.map((src) => (
          <div
            key={src.name}
            className="bg-panel border border-line rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-glow" />
                <h3 className="text-base font-semibold text-ink">{src.name}</h3>
                <span className="font-mono text-[10px] text-ink-dim uppercase bg-void px-2 py-0.5 rounded border border-line">
                  {src.type}
                </span>
              </div>
              <p className="text-xs font-mono text-glow mt-1">{src.license}</p>
              <p className="text-xs text-ink-dim mt-0.5">{src.attribution}</p>
            </div>

            {src.url !== '#' && (
              <button
                onClick={() => openLink(src.url)}
                className="flex items-center gap-1 text-xs font-mono text-ink-dim hover:text-glow transition self-start sm:self-center"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>License Terms</span>
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="bg-void border border-line rounded-xl p-4 text-xs font-mono text-ink-dim flex items-center justify-between">
        <span>Vantage — Free & Open Source macOS Utility</span>
        <div className="flex items-center gap-1 text-glow">
          <Heart className="w-3.5 h-3.5 fill-glow" />
          <span>Built for macOS</span>
        </div>
      </div>
    </div>
  )
}
