import { app, net } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'

export const DEFAULT_CACHE_MAX_BYTES = 5 * 1024 * 1024 * 1024
export const CACHE_FLOOR_BYTES = 1 * 1024 * 1024 * 1024
export const CACHE_CEILING_BYTES = 100 * 1024 * 1024 * 1024
export const MAX_CACHE_DOWNLOAD_BYTES = 1 * 1024 * 1024 * 1024
const CACHE_DOWNLOAD_TIMEOUT_MS = 2 * 60 * 1000
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.mkv'])
const ALLOWED_MEDIA_HOSTS = new Set([
  'motionbgs.com',
  'www.motionbgs.com'
])

let cacheLimitBytes = DEFAULT_CACHE_MAX_BYTES

export function setCacheLimitBytes(bytes: number): void {
  if (Number.isFinite(bytes)) {
    cacheLimitBytes = Math.min(
      CACHE_CEILING_BYTES,
      Math.max(CACHE_FLOOR_BYTES, Math.round(bytes))
    )
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

/** Only known media providers may be downloaded into the local cache. */
export function isAllowedRemoteMediaUrl(url: string | undefined | null): boolean {
  if (!isRemoteHttpUrl(url)) return false
  try {
    const parsed = new URL(url as string)
    return (
      parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      ALLOWED_MEDIA_HOSTS.has(parsed.hostname.toLowerCase())
    )
  } catch {
    return false
  }
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
const MAX_CONCURRENT_DOWNLOADS = 1
let activeDownloads = 0

interface DownloadWaiter {
  controller: AbortController
  resolve: (release: () => void) => void
  reject: (error: Error) => void
}

const downloadWaiters: DownloadWaiter[] = []

function acquireDownloadSlot(controller: AbortController): Promise<() => void> {
  const release = () => {
    activeDownloads--
    while (downloadWaiters.length > 0) {
      const waiter = downloadWaiters.shift()!
      if (waiter.controller.signal.aborted) {
        waiter.reject(new Error('Download cancelled'))
        continue
      }
      activeDownloads++
      waiter.resolve(release)
      break
    }
  }

  if (controller.signal.aborted) return Promise.reject(new Error('Download cancelled'))
  if (activeDownloads < MAX_CONCURRENT_DOWNLOADS) {
    activeDownloads++
    return Promise.resolve(release)
  }

  return new Promise((resolve, reject) => {
    const waiter: DownloadWaiter = { controller, resolve, reject }
    const onAbort = () => {
      const index = downloadWaiters.indexOf(waiter)
      if (index >= 0) downloadWaiters.splice(index, 1)
      reject(new Error('Download cancelled'))
    }
    controller.signal.addEventListener('abort', onAbort, { once: true })
    downloadWaiters.push(waiter)
  })
}

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
        const stat = fs.statSync(full)
        if (stat.isFile() && stat.size > 0) {
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

export async function cancelAllDownloads(): Promise<void> {
  const active = [...pending.values()]
  for (const controller of controllers.values()) {
    controller.abort()
  }
  await Promise.allSettled(active)
  controllers.clear()
  pending.clear()
}

export function ensureCached(url: string): Promise<string> {
  if (!isAllowedRemoteMediaUrl(url)) {
    return Promise.reject(new Error('Refusing to cache an untrusted media URL'))
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
    const timeout = setTimeout(() => controller.abort(), CACHE_DOWNLOAD_TIMEOUT_MS)
    let release: (() => void) | null = null
    let resp: Response
    let writeStream: fs.WriteStream | null = null
    try {
      release = await acquireDownloadSlot(controller)
      resp = await net.fetch(url, {
        signal: controller.signal,
        redirect: 'error'
      })

      if (!resp.ok || resp.body == null) {
        console.error('[Cache] Download failed with status:', resp.status, url)
        throw new Error(`Download failed with status ${resp.status}`)
      }

      const contentType = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      if (!contentType || (!contentType.startsWith('video/') && contentType !== 'application/octet-stream')) {
        throw new Error(`Refusing cached response with content type ${contentType}`)
      }

      const total = Number(resp.headers.get('content-length')) || 0
      // Reserve the maximum permitted payload, not the declared length: an
      // untrusted server can omit or underreport Content-Length.
      const reservationBytes = MAX_CACHE_DOWNLOAD_BYTES
      if (reservationBytes > cacheLimitBytes) {
        throw new Error(`Cached response exceeds configured cache limit of ${cacheLimitBytes} bytes`)
      }
      // With one active transfer, evict before creating a .part file so active
      // downloads plus completed entries can never grow beyond the configured cap.
      evictToLimit(Math.max(0, cacheLimitBytes - reservationBytes))

      let received = 0
      try {
        fs.unlinkSync(partPath)
      } catch {
        // No stale partial download to remove.
      }
      writeStream = fs.createWriteStream(partPath)
      const reader = resp.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        received += value.byteLength
        if (received > MAX_CACHE_DOWNLOAD_BYTES) {
          await reader.cancel()
          throw new Error(`Cached response exceeds ${MAX_CACHE_DOWNLOAD_BYTES} bytes`)
        }
        emitProgress(url, received, total, total > 0 ? Math.round((received / total) * 100) : 0)
        if (!writeStream!.write(value)) {
          await new Promise<void>((resolve, reject) => {
            const onDrain = () => {
              writeStream!.removeListener('error', onError)
              resolve()
            }
            const onError = (err: Error) => {
              writeStream!.removeListener('drain', onDrain)
              reject(err)
            }
            writeStream!.once('drain', onDrain)
            writeStream!.once('error', onError)
          })
        }
      }
      await new Promise<void>((resolve, reject) => {
        writeStream!.once('error', reject)
        writeStream!.end(() => resolve())
      })
    } catch (err) {
      writeStream?.destroy()
      try {
        fs.unlinkSync(partPath)
      } catch {
        // nothing to clean up
      }
      throw err
    } finally {
      clearTimeout(timeout)
      release?.()
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
        if (!stat.isFile()) return null
        return { filePath, size: stat.size, mtime: stat.mtimeMs }
      })
      .filter((entry): entry is { filePath: string; size: number; mtime: number } => Boolean(entry))
  } catch {
    return
  }

  let total = entries.reduce((sum, e) => sum + e.size, 0)
  if (total <= maxBytes) return

  entries.sort((a, b) => a.mtime - b.mtime)
  for (const entry of entries) {
    if (total <= maxBytes) break
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
      try {
        const stat = fs.statSync(path.join(dir, file))
        if (!stat.isFile()) continue
        // Include in-progress bytes in the reported footprint even though they
        // do not count as completed cached media.
        usedBytes += stat.size
        if (!file.endsWith('.part')) count++
      } catch {
        // ignore files that disappear mid-scan
      }
    }
  } catch {
    // cache dir missing
  }
  return { usedBytes, count, limitBytes: cacheLimitBytes }
}

export async function clearCache(): Promise<number> {
  const dir = getCacheDir()
  await cancelAllDownloads()
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
