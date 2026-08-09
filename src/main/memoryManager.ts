import { session, Notification } from 'electron'
import { clearCache } from './videoCache'
import { purgeWallpaperMemory } from './wallpaperWindow'

export async function freeUpMemory(): Promise<{ freedMb: number }> {
  let freedBytes = 0
  try {
    // 1. Clear Vantage media cache on disk
    const deletedMediaBytes = await clearCache()
    freedBytes += deletedMediaBytes

    // 2. Clear Electron session HTTP cache & V8 code cache
    if (session.defaultSession) {
      await session.defaultSession.clearCache()
      await session.defaultSession.clearCodeCaches({})
    }

    // 3. Signal all wallpaper windows and gallery renderer to release video/canvas memory
    purgeWallpaperMemory()

    // 4. Trigger main process V8 Garbage Collector if exposed
    if (typeof global.gc === 'function') {
      try {
        global.gc()
      } catch {
        /* best effort */
      }
    }

    const freedMb = Number((freedBytes / (1024 * 1024)).toFixed(1))

    // 5. Fire macOS native notification for user feedback
    if (Notification.isSupported()) {
      new Notification({
        title: 'Vantage — Free Up Memory',
        body:
          freedMb > 0
            ? `RAM & video cache purged successfully! (Freed ${freedMb} MB)`
            : 'RAM & video cache purged successfully. Performance optimized!'
      }).show()
    }

    return { freedMb }
  } catch (err) {
    console.error('[MemoryManager] Failed to free memory:', err)
    return { freedMb: 0 }
  }
}
