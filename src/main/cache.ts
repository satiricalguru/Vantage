import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

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