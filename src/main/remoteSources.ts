import type { WallpaperItem } from '../shared/types'

export type RemoteProvider = 'pexels' | 'unsplash'

export interface RemoteSearchResult {
  items: WallpaperItem[]
  missingKey: boolean
  error?: string
}

interface PexelsVideoFile {
  id: number
  quality: string
  width: number
  height: number
  link: string
}

interface PexelsVideo {
  id: number
  image: string
  duration: number
  width: number
  height: number
  video_files: PexelsVideoFile[]
}

interface PexelsSearchResponse {
  videos?: PexelsVideo[]
}

interface UnsplashPhoto {
  id: string
  alt_description: string | null
  urls: { regular: string; full: string }
  width: number
  height: number
  user: { name: string }
}

interface UnsplashSearchResponse {
  results?: UnsplashPhoto[]
}

function pickPexelsFile(video: PexelsVideo): PexelsVideoFile | undefined {
  const candidates = video.video_files.filter((f) => /\.mp4($|\?)/i.test(f.link))
  const landscape = candidates.filter((f) => f.width >= f.height)
  const pool = landscape.length > 0 ? landscape : candidates
  return (
    pool.find((f) => f.quality === 'hd' && f.width >= 1280 && f.height >= 720) ||
    pool.find((f) => f.quality === 'hd') ||
    pool.find((f) => f.width >= 1280) ||
    pool[0]
  )
}

async function searchPexels(query: string, apiKey: string): Promise<WallpaperItem[]> {
  const url = new URL('https://api.pexels.com/videos/search')
  url.searchParams.set('query', query || 'nature')
  url.searchParams.set('per_page', '30')
  url.searchParams.set('orientation', 'landscape')

  const resp = await fetch(url.toString(), {
    headers: { Authorization: apiKey }
  })
  if (!resp.ok) {
    throw new Error(`Pexels API error: ${resp.status}`)
  }
  const data = (await resp.json()) as PexelsSearchResponse

  return (data.videos ?? []).map((video) => {
    const file = pickPexelsFile(video)
    return {
      id: `pexels-${video.id}`,
      title: `${query || 'Curated'} ${video.id}`,
      category: 'pexels',
      type: 'video',
      previewUrl: video.image,
      sourceUrl: file?.link ?? `https://www.pexels.com/video/${video.id}/`,
      resolution: {
        width: file?.width ?? video.width,
        height: file?.height ?? video.height
      },
      duration: Math.round(video.duration),
      source: 'pexels',
      license: 'Pexels License',
      attribution: 'Pexels'
    }
  })
}

async function searchUnsplash(query: string, apiKey: string): Promise<WallpaperItem[]> {
  const url = new URL('https://api.unsplash.com/search/photos')
  url.searchParams.set('query', query || 'nature')
  url.searchParams.set('per_page', '30')
  url.searchParams.set('orientation', 'landscape')

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Client-ID ${apiKey}` }
  })
  if (!resp.ok) {
    throw new Error(`Unsplash API error: ${resp.status}`)
  }
  const data = (await resp.json()) as UnsplashSearchResponse

  return (data.results ?? []).map((photo) => ({
    id: `unsplash-${photo.id}`,
    title: photo.alt_description || `Unsplash ${photo.id}`,
    category: 'unsplash',
    type: 'user-import',
    previewUrl: photo.urls.regular,
    sourceUrl: photo.urls.full,
    resolution: { width: photo.width, height: photo.height },
    source: 'unsplash',
    license: 'Unsplash License',
    attribution: photo.user.name
  }))
}

export async function searchRemoteWallpapers(
  provider: RemoteProvider,
  query: string,
  apiKey: string
): Promise<WallpaperItem[]> {
  if (!apiKey) return []
  if (provider === 'pexels') return searchPexels(query, apiKey)
  return searchUnsplash(query, apiKey)
}
