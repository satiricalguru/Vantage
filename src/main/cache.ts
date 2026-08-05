import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

export const DEFAULT_MAX_CACHE_SIZE_BYTES = 5 * 1024 * 1024 * 1024 // 5 GB

export function getCacheDir(): string {
  const userData = app.getPath('userData')
  const cacheDir = path.join(userData, 'cache')
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true })
  }
  return cacheDir
}

export function getCacheUsedBytes(): number {
  const cacheDir = getCacheDir()
  let total = 0
  for (const file of fs.readdirSync(cacheDir)) {
    const filePath = path.join(cacheDir, file)
    try {
      total += fs.statSync(filePath).size
    } catch (err) {
      // ignore files that disappear mid-scan
    }
  }
  return total
}

export function clearCache(): number {
  const cacheDir = getCacheDir()
  const files = fs.readdirSync(cacheDir)
  let deletedBytes = 0

  for (const file of files) {
    const filePath = path.join(cacheDir, file)
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

export function evictCache(maxBytes?: number): void {
  const limitBytes = maxBytes ?? DEFAULT_MAX_CACHE_SIZE_BYTES
  const cacheDir = getCacheDir()
  const files = fs.readdirSync(cacheDir)
  let totalSize = 0
  const stats: { path: string; size: number; mtime: number }[] = []

  for (const file of files) {
    const filePath = path.join(cacheDir, file)
    try {
      const s = fs.statSync(filePath)
      totalSize += s.size
      stats.push({ path: filePath, size: s.size, mtime: s.mtimeMs })
    } catch (e) {
      // skip
    }
  }

  if (totalSize > limitBytes) {
    stats.sort((a, b) => a.mtime - b.mtime) // oldest first

    for (const item of stats) {
      if (totalSize <= limitBytes) break
      try {
        fs.unlinkSync(item.path)
        totalSize -= item.size
      } catch (e) {
        console.error(`[Cache] Error evicting ${item.path}:`, e)
      }
    }
  }
}