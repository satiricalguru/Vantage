import { app, net } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'

export const DEFAULT_CACHE_MAX_BYTES = 5 * 1024 * 1024 * 1024
export const CACHE_FLOOR_BYTES = 1 * 1024 * 1024 * 1024
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.mkv'])

let cacheLimitBytes = DEFAULT_CACHE_MAX_BYTES

export function setCacheLimitBytes(bytes: number): void {
  if (Number.isFinite(bytes) && bytes >= CACHE_FLOOR_BYTES) {
    cacheLimitBytes = bytes
  }
}

export function getCacheLimitBytes(): number {
  return cacheLimitBytes
}

export function getCacheDir(): string {
  const cacheDir = path.join(app.getPath('cache' as 'userData'), 'vantage', 'media')
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true })
  }
  return cacheDir
}

export function isRemoteHttpUrl(url: string | undefined | null): boolean {
  return typeof url === 'string' && /^https?:\/\//i.test(url)
}

export function cacheKeyForUrl(url: string): string {
  return crypto.createHash('sha1').update(url).digest('hex')
}

function extFromUrl(url: string): string {
  const clean = url.split('?')[0].split('#')[0]
  const ext = path.extname(clean).toLowerCase()
  return VIDEO_EXTS.has(ext) ? ext : '.mp4'
}

function touch(filePath: string): void {
  try {
    const now = new Date()
    fs.utimesSync(filePath, now, now)
  } catch {
    // best-effort LRU recency update
  }
}

export interface CacheProgress {
  url: string
  received: number
  total: number
  pct: number
}

type ProgressListener = (progress: CacheProgress) => void

const progressListeners = new Set<ProgressListener>()

export function onCacheProgress(listener: ProgressListener): () => void {
  progressListeners.add(listener)
  return () => progressListeners.delete(listener)
}

function emitProgress(url: string, received: number, total: number, pct: number): void {
  for (const listener of progressListeners) {
    try {
      listener({ url, received, total, pct })
    } catch (err) {
      console.error('[Cache] Progress listener error:', err)
    }
  }
}

const pending = new Map<string, Promise<string>>()
const controllers = new Map<string, AbortController>()

export function getCachedFilePath(url: string): string | null {
  if (!isRemoteHttpUrl(url)) return null
  const dir = getCacheDir()
  const key = cacheKeyForUrl(url)
  let files: string[]
  try {
    files = fs.readdirSync(dir)
  } catch {
    return null
  }
  for (const file of files) {
    if (file.startsWith(key) && !file.endsWith('.part')) {
      const full = path.join(dir, file)
      try {
        if (fs.statSync(full).size > 0) {
          touch(full)
          return full
        }
      } catch {
        // fall through to next candidate
      }
    }
  }
  return null
}

export function cancelDownload(url: string): void {
  controllers.get(url)?.abort()
  controllers.delete(url)
}

export function cancelAllDownloads(): void {
  for (const controller of controllers.values()) {
    controller.abort()
  }
  controllers.clear()
  pending.clear()
}

export function ensureCached(url: string): Promise<string> {
  if (!isRemoteHttpUrl(url)) {
    return Promise.reject(new Error('Refusing to cache non-http(s) URL'))
  }

  const existing = getCachedFilePath(url)
  if (existing) return Promise.resolve(existing)

  const inFlight = pending.get(url)
  if (inFlight) return inFlight

  const dir = getCacheDir()
  const finalPath = path.join(dir, `${cacheKeyForUrl(url)}${extFromUrl(url)}`)
  const partPath = `${finalPath}.part`
  const controller = new AbortController()
  controllers.set(url, controller)

  const promise = (async () => {
    let resp
    try {
      resp = await net.fetch(url, { signal: controller.signal })
    } catch (err) {
      console.error('[Cache] Fetch failed:', url, err)
      throw err
    }
    if (!resp.ok || resp.body == null) {
      console.error('[Cache] Download failed with status:', resp.status, url)
      throw new Error(`Download failed with status ${resp.status}`)
    }

    const total = Number(resp.headers.get('content-length')) || 0
    let received = 0
    const writeStream = fs.createWriteStream(partPath)
    const reader = resp.body.getReader()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        received += value.byteLength
        emitProgress(url, received, total, total > 0 ? Math.round((received / total) * 100) : 0)
        if (!writeStream.write(value)) {
          await new Promise<void>((resolve) => writeStream.once('drain', () => resolve()))
        }
      }
      await new Promise<void>((resolve, reject) => {
        writeStream.once('error', reject)
        writeStream.end(() => resolve())
      })
    } catch (err) {
      writeStream.destroy()
      try {
        fs.unlinkSync(partPath)
      } catch {
        // nothing to clean up
      }
      throw err
    }

    fs.renameSync(partPath, finalPath)
    return finalPath
  })()

  pending.set(url, promise)
  promise
    .then(() => {
      evictToLimit(cacheLimitBytes)
    })
    .finally(() => {
      pending.delete(url)
      controllers.delete(url)
    })
    .catch(() => {
      // error already surfaced to caller
    })

  return promise
}

export function evictToLimit(maxBytes: number, dir = getCacheDir()): void {
  let entries: { filePath: string; size: number; mtime: number }[]
  try {
    entries = fs
      .readdirSync(dir)
      .filter((f) => !f.endsWith('.part'))
      .map((f) => {
        const filePath = path.join(dir, f)
        const stat = fs.statSync(filePath)
        return { filePath, size: stat.size, mtime: stat.mtimeMs }
      })
  } catch {
    return
  }

  let total = entries.reduce((sum, e) => sum + e.size, 0)
  if (total <= maxBytes) return

  entries.sort((a, b) => a.mtime - b.mtime)
  const floor = Math.max(CACHE_FLOOR_BYTES, maxBytes * 0.1)
  for (const entry of entries) {
    if (total <= Math.max(floor, maxBytes)) break
    try {
      fs.unlinkSync(entry.filePath)
      total -= entry.size
      console.log('[Cache] Evicted:', path.basename(entry.filePath))
    } catch {
      // file disappeared mid-scan
    }
  }
}

export function getCacheStatus(): {
  usedBytes: number
  count: number
  limitBytes: number
} {
  const dir = getCacheDir()
  let usedBytes = 0
  let count = 0
  try {
    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith('.part')) continue
      try {
        const stat = fs.statSync(path.join(dir, file))
        usedBytes += stat.size
        count++
      } catch {
        // ignore files that disappear mid-scan
      }
    }
  } catch {
    // cache dir missing
  }
  return { usedBytes, count, limitBytes: cacheLimitBytes }
}

export function clearCache(): number {
  const dir = getCacheDir()
  cancelAllDownloads()
  let deletedBytes = 0
  let files: string[]
  try {
    files = fs.readdirSync(dir)
  } catch {
    return 0
  }
  for (const file of files) {
    const filePath = path.join(dir, file)
    try {
      const stat = fs.statSync(filePath)
      deletedBytes += stat.size
      fs.unlinkSync(filePath)
    } catch (err) {
      console.error(`[Cache] Error deleting ${filePath}:`, err)
    }
  }
  return deletedBytes
}
