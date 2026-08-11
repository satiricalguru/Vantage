import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { INITIAL_WALLPAPERS } from './contentSources'
import { WallpaperItem, DEFAULT_WALLPAPER_ID } from '../shared/types'
import { toMediaUrl } from './mediaUrl'

/** Shape of a row returned by SELECT * FROM wallpapers */
interface WallpaperRow {
  id: string
  title: string
  category: string
  type: string
  source: string
  license: string
  attribution: string | null
  resolution_w: number
  resolution_h: number
  duration: number | null
  previewUrl: string
  sourceUrl: string
  generatorId: string | null
  colorPalette: string | null
  is_favorite: number
  added_at: number
}

/** Shape of a row returned by SELECT * FROM display_assignments */
interface DisplayAssignmentRow {
  display_id: string
  wallpaper_id: string
  performance_mode: string | null
}

let db: Database.Database | null = null

/** Explicitly close the database — call from `before-quit` to ensure WAL checkpoint completes. */
export function closeDatabase(): void {
  if (db) {
    try { db.close() } catch { /* best-effort */ }
    db = null
  }
}

export function initDatabase(): Database.Database {
  if (db) return db

  const userDataPath = app.getPath('userData')
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true })
  }

  const dbPath = path.join(userDataPath, 'vantage.db')
  db = new Database(dbPath)
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS wallpapers (
      id            TEXT PRIMARY KEY,
      title         TEXT NOT NULL,
      category      TEXT NOT NULL,
      type          TEXT NOT NULL,
      source        TEXT NOT NULL,
      license       TEXT NOT NULL,
      attribution   TEXT,
      resolution_w  INTEGER,
      resolution_h  INTEGER,
      duration      INTEGER,
      previewUrl    TEXT,
      sourceUrl     TEXT,
      generatorId   TEXT,
      colorPalette  TEXT,
      is_favorite   INTEGER DEFAULT 0,
      added_at      INTEGER
    );

    CREATE TABLE IF NOT EXISTS display_assignments (
      display_id        TEXT PRIMARY KEY,
      wallpaper_id       TEXT REFERENCES wallpapers(id),
      performance_mode   TEXT DEFAULT 'balanced'
    );
  `)

  // Upsert catalog wallpapers to ensure updated working URLs & preview paths are synced
  const upsertStmt = db.prepare(`
    INSERT INTO wallpapers (
      id, title, category, type, source, license, attribution,
      resolution_w, resolution_h, duration, previewUrl, sourceUrl, generatorId, colorPalette, added_at
    ) VALUES (
      @id, @title, @category, @type, @source, @license, @attribution,
      @resolution_w, @resolution_h, @duration, @previewUrl, @sourceUrl, @generatorId, @colorPalette, @added_at
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      category = excluded.category,
      type = excluded.type,
      source = excluded.source,
      license = excluded.license,
      attribution = excluded.attribution,
      resolution_w = excluded.resolution_w,
      resolution_h = excluded.resolution_h,
      duration = excluded.duration,
      previewUrl = excluded.previewUrl,
      sourceUrl = excluded.sourceUrl,
      generatorId = excluded.generatorId,
      colorPalette = excluded.colorPalette,
      added_at = excluded.added_at
  `)

  const syncCatalog = db!.transaction((items: WallpaperItem[]) => {
    // Purge outdated catalog entries from database that are no longer in INITIAL_WALLPAPERS and not user imported
    if (items.length > 0) {
      const itemIds = items.map((i) => i.id)
      try {
        // Use a temp table for large ID lists to avoid exceeding SQLite's
        // SQLITE_MAX_VARIABLE_NUMBER limit (~999 on some builds).
        db!.exec('CREATE TEMP TABLE IF NOT EXISTS _kept_catalog_ids (id TEXT PRIMARY KEY)')
        db!.exec('DELETE FROM _kept_catalog_ids')
        const insertKept = db!.prepare('INSERT OR IGNORE INTO _kept_catalog_ids (id) VALUES (?)')
        for (const id of itemIds) insertKept.run(id)

        db!.prepare(`UPDATE display_assignments SET wallpaper_id = ? WHERE wallpaper_id IN (SELECT id FROM wallpapers WHERE source != 'user' AND source != 'static' AND id NOT LIKE 'user-%' AND id NOT LIKE 'static-%' AND id NOT IN (SELECT id FROM _kept_catalog_ids))`).run(DEFAULT_WALLPAPER_ID)
        db!.prepare(`DELETE FROM wallpapers WHERE source != 'user' AND source != 'static' AND id NOT LIKE 'user-%' AND id NOT LIKE 'static-%' AND id NOT IN (SELECT id FROM _kept_catalog_ids)`).run()
      } catch (err) {
        console.warn('[DB Sync] Warning during catalog cleanup:', err)
      }
    }

    const baseTime = Date.now()
    let idx = 0
    for (const item of items) {
      upsertStmt.run({
        id: item.id,
        title: item.title,
        category: item.category,
        type: item.type,
        source: item.source,
        license: item.license,
        attribution: item.attribution || null,
        resolution_w: item.resolution.width,
        resolution_h: item.resolution.height,
        duration: item.duration || null,
        previewUrl: item.previewUrl,
        sourceUrl: item.sourceUrl,
        generatorId: item.generatorId || null,
        colorPalette: item.colorPalette ? JSON.stringify(item.colorPalette) : null,
        added_at: baseTime - idx
      })
      idx++
    }
  })

  syncCatalog(INITIAL_WALLPAPERS)

  return db
}

function resolveMediaUrl(url: string | undefined | null): string {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('media://')) {
    return url
  }
  if (url.startsWith('resources/')) {
    const baseDir = app.isPackaged ? process.resourcesPath : app.getAppPath()
    const fullPath = path.join(baseDir, url)
    return toMediaUrl(fullPath)
  }
  if (url.startsWith('extracted/')) {
    const relPath = url.slice('extracted/'.length)
    const baseDir = app.isPackaged ? process.resourcesPath : app.getAppPath()
    const localExtracted = path.join(baseDir, 'Extracted_Video_Wallpapers', relPath)
    if (fs.existsSync(localExtracted)) {
      return toMediaUrl(localExtracted)
    }

    // Bundled catalog wallpapers ship under resources/wallpapers
    const bundledWallpapers = path.join(baseDir, 'resources', 'wallpapers', relPath)
    if (fs.existsSync(bundledWallpapers)) {
      return toMediaUrl(bundledWallpapers)
    }

    // Fallback to managed pictures folder (~/Pictures/Vantage Wallpapers/)
    try {
      const picturesDir = app.getPath('pictures')
      const managedFolder = path.join(picturesDir, 'Vantage Wallpapers')
      const exactFallback = path.join(managedFolder, relPath)
      if (fs.existsSync(exactFallback)) {
        return toMediaUrl(exactFallback)
      }
      if (fs.existsSync(managedFolder)) {
        const files = fs.readdirSync(managedFolder)
        const match = files.find((f) => f.toLowerCase() === relPath.toLowerCase())
        if (match) {
          return toMediaUrl(path.join(managedFolder, match))
        }
      }
    } catch { /* ignore */ }

    return toMediaUrl(bundledWallpapers)
  }
  return url
}

/** Safe parse of the stored color palette; a corrupt row must never brick the whole gallery list. */
function parseColorPalette(raw: string | null): string[] | undefined {
  if (!raw) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.every((v) => typeof v === 'string') ? (parsed as string[]) : undefined
  } catch {
    return undefined
  }
}

/** Basename of a media:// or file:// URL, or null when it is not a local file URL. */
function mediaUrlBasename(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null
  let localPath: string
  try {
    if (url.startsWith('media://')) {
      localPath = decodeURIComponent(url.replace(/^media:\/+/i, '/'))
    } else if (url.startsWith('file://')) {
      localPath = fileURLToPath(url)
    } else {
      return null
    }
  } catch {
    return null
  }
  return path.basename(localPath)
}

/**
 * Every local file basename currently referenced by a wallpaper row (source
 * and preview URLs). Used by the thumbnail garbage collector: a generated
 * thumbnail is only safe to delete when *no* DB row points at it anymore —
 * never when the row merely points at a file outside the managed folder.
 */
export function getWallpaperFileReferences(): string[] {
  const database = initDatabase()
  const names = new Set<string>()
  const rows = database.prepare('SELECT previewUrl, sourceUrl FROM wallpapers').all() as {
    previewUrl: string | null
    sourceUrl: string | null
  }[]
  for (const row of rows) {
    for (const base of [mediaUrlBasename(row.previewUrl), mediaUrlBasename(row.sourceUrl)]) {
      if (base) names.add(base)
    }
  }
  return Array.from(names)
}

export function getAllWallpapers(category?: string, query?: string): WallpaperItem[] {
  const database = initDatabase()
  let sql = 'SELECT * FROM wallpapers'
  const params: (string | number)[] = []
  const conditions: string[] = []

  if (category === 'static') {
    conditions.push("source = 'static'")
  } else {
    // Static wallpapers are only exposed via the dedicated Static Wallpapers tab
    conditions.push("source != 'static'")

    if (category && category !== 'all' && category !== 'favorites' && category !== 'videos') {
      conditions.push('category = ?')
      params.push(category)
    } else if (category === 'favorites') {
      conditions.push('is_favorite = 1')
    } else if (category === 'videos') {
      conditions.push('type = ?')
      params.push('video')
    }
  }

  if (query && query.trim() !== '') {
    conditions.push('(title LIKE ? OR category LIKE ? OR source LIKE ?)')
    const searchTerm = `%${query.trim()}%`
    params.push(searchTerm, searchTerm, searchTerm)
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ')
  }

  sql += " ORDER BY (CASE WHEN source = 'user' OR category = 'imported' OR id LIKE 'user-%' THEN 0 WHEN source = 'local' OR id LIKE 'wallpaperx-%' THEN 1 ELSE 2 END) ASC, title COLLATE NOCASE ASC"

  const rows = database.prepare(sql).all(...params) as WallpaperRow[]

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    type: r.type,
    source: r.source,
    license: r.license,
    attribution: r.attribution ?? undefined,
    resolution: { width: r.resolution_w, height: r.resolution_h },
    duration: r.duration ?? undefined,
    previewUrl: resolveMediaUrl(r.previewUrl),
    sourceUrl: resolveMediaUrl(r.sourceUrl),
    generatorId: r.generatorId ?? undefined,
    colorPalette: parseColorPalette(r.colorPalette),
    is_favorite: Boolean(r.is_favorite)
  }))
}

export function getWallpaperById(id: string): WallpaperItem | null {
  const database = initDatabase()
  const row = database.prepare('SELECT * FROM wallpapers WHERE id = ?').get(id) as WallpaperRow | undefined
  if (!row) return null

  return {
    id: row.id,
    title: row.title,
    category: row.category,
    type: row.type,
    source: row.source,
    license: row.license,
    attribution: row.attribution ?? undefined,
    resolution: { width: row.resolution_w, height: row.resolution_h },
    duration: row.duration ?? undefined,
    previewUrl: resolveMediaUrl(row.previewUrl),
    sourceUrl: resolveMediaUrl(row.sourceUrl),
    generatorId: row.generatorId ?? undefined,
    colorPalette: parseColorPalette(row.colorPalette),
    is_favorite: Boolean(row.is_favorite)
  }
}


export function setDisplayAssignment(displayId: string, wallpaperId: string): void {
  const database = initDatabase()
  database.prepare(`
    INSERT INTO display_assignments (display_id, wallpaper_id)
    VALUES (?, ?)
    ON CONFLICT(display_id) DO UPDATE SET wallpaper_id = excluded.wallpaper_id
  `).run(displayId, wallpaperId)
}

export function getDisplayAssignment(displayId: string): { wallpaperId: string | null; performanceMode: string } {
  const database = initDatabase()
  const row = database.prepare('SELECT * FROM display_assignments WHERE display_id = ?').get(displayId) as DisplayAssignmentRow | undefined
  if (!row) {
    return { wallpaperId: DEFAULT_WALLPAPER_ID, performanceMode: 'balanced' }
  }

  // A folder watcher can remove a wallpaper after it has been assigned. Never
  // return a dangling ID to the renderer; it would otherwise render a blank
  // wallpaper window until the user manually reassigns it.
  let wallpaperId = row.wallpaper_id || DEFAULT_WALLPAPER_ID
  const exists = database.prepare('SELECT 1 FROM wallpapers WHERE id = ?').get(wallpaperId)
  if (!exists) wallpaperId = DEFAULT_WALLPAPER_ID

  return {
    wallpaperId,
    performanceMode: row.performance_mode || 'balanced'
  }
}

export function setPerformanceMode(displayId: string, mode: string): void {
  const database = initDatabase()
  // Ensure a default wallpaper_id is set if this is a new row (avoids null FK)
  database.prepare(`
    INSERT INTO display_assignments (display_id, wallpaper_id, performance_mode)
    VALUES (?, ?, ?)
    ON CONFLICT(display_id) DO UPDATE SET performance_mode = excluded.performance_mode
  `).run(displayId, DEFAULT_WALLPAPER_ID, mode)
}

export function toggleFavoriteInDb(wallpaperId: string, isFavorite: boolean): void {
  const database = initDatabase()
  database.prepare('UPDATE wallpapers SET is_favorite = ? WHERE id = ?').run(isFavorite ? 1 : 0, wallpaperId)
}

export function deleteWallpaperFromDb(wallpaperId: string): boolean {
  const database = initDatabase()
  try {
    database.transaction(() => {
      database.prepare('UPDATE display_assignments SET wallpaper_id = ? WHERE wallpaper_id = ?').run(DEFAULT_WALLPAPER_ID, wallpaperId)
      database.prepare('DELETE FROM wallpapers WHERE id = ?').run(wallpaperId)
    })()
    return true
  } catch (err) {
    console.error('[DB] Error deleting wallpaper from database:', err)
    return false
  }
}

export function addWallpaperToDb(item: WallpaperItem): void {
  const database = initDatabase()
  database.prepare(`
    INSERT INTO wallpapers (
      id, title, category, type, source, license, attribution,
      resolution_w, resolution_h, duration, previewUrl, sourceUrl, generatorId, colorPalette, added_at
    ) VALUES (
      @id, @title, @category, @type, @source, @license, @attribution,
      @resolution_w, @resolution_h, @duration, @previewUrl, @sourceUrl, @generatorId, @colorPalette, @added_at
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      category = excluded.category,
      type = excluded.type,
      source = excluded.source,
      previewUrl = excluded.previewUrl,
      sourceUrl = excluded.sourceUrl,
      resolution_w = excluded.resolution_w,
      resolution_h = excluded.resolution_h
  `).run({
    id: item.id,
    title: item.title,
    category: item.category,
    type: item.type,
    source: item.source,
    license: item.license,
    attribution: item.attribution || null,
    resolution_w: item.resolution.width,
    resolution_h: item.resolution.height,
    duration: item.duration || null,
    previewUrl: item.previewUrl,
    sourceUrl: item.sourceUrl,
    generatorId: item.generatorId || null,
    colorPalette: item.colorPalette ? JSON.stringify(item.colorPalette) : null,
    added_at: Date.now()
  })
}

/** Remove locally-scanned folder entries whose source file no longer exists */
export function pruneUserFolderEntries(keptIds: string[]): void {
  const database = initDatabase()
  try {
    const prune = database.transaction(() => {
      if (keptIds.length > 0) {
        database.exec('CREATE TEMP TABLE IF NOT EXISTS _kept_user_ids (id TEXT PRIMARY KEY)')
        database.exec('DELETE FROM _kept_user_ids')
        const insertKept = database.prepare('INSERT OR IGNORE INTO _kept_user_ids (id) VALUES (?)')
        for (const id of keptIds) insertKept.run(id)

        database.prepare(
          `UPDATE display_assignments SET wallpaper_id = ? WHERE wallpaper_id IN (
            SELECT id FROM wallpapers WHERE id LIKE 'user-folder-%' AND id NOT IN (SELECT id FROM _kept_user_ids)
          )`
        ).run(DEFAULT_WALLPAPER_ID)
        database.prepare(
          `DELETE FROM wallpapers WHERE id LIKE 'user-folder-%' AND id NOT IN (SELECT id FROM _kept_user_ids)`
        ).run()
      } else {
        database.prepare(
          `UPDATE display_assignments SET wallpaper_id = ? WHERE wallpaper_id IN (
            SELECT id FROM wallpapers WHERE id LIKE 'user-folder-%'
          )`
        ).run(DEFAULT_WALLPAPER_ID)
        database.prepare(`DELETE FROM wallpapers WHERE id LIKE 'user-folder-%'`).run()
      }
    })
    prune()
  } catch (err) {
    console.warn('[DB] Error pruning removed folder entries:', err)
  }
}

/** Remove static-catalog entries whose source file no longer exists */
export function pruneStaticWallpapers(keptIds: string[]): void {
  const database = initDatabase()
  try {
    const prune = database.transaction(() => {
      if (keptIds.length > 0) {
        database.exec('CREATE TEMP TABLE IF NOT EXISTS _kept_static_ids (id TEXT PRIMARY KEY)')
        database.exec('DELETE FROM _kept_static_ids')
        const insertKept = database.prepare('INSERT OR IGNORE INTO _kept_static_ids (id) VALUES (?)')
        for (const id of keptIds) insertKept.run(id)

        database.prepare(
          `UPDATE display_assignments SET wallpaper_id = ? WHERE wallpaper_id IN (
            SELECT id FROM wallpapers WHERE source = 'static' AND id LIKE 'static-%' AND id NOT IN (SELECT id FROM _kept_static_ids)
          )`
        ).run(DEFAULT_WALLPAPER_ID)
        database.prepare(
          `DELETE FROM wallpapers WHERE source = 'static' AND id LIKE 'static-%' AND id NOT IN (SELECT id FROM _kept_static_ids)`
        ).run()
      } else {
        database.prepare(
          `UPDATE display_assignments SET wallpaper_id = ? WHERE wallpaper_id IN (
            SELECT id FROM wallpapers WHERE source = 'static' AND id LIKE 'static-%'
          )`
        ).run(DEFAULT_WALLPAPER_ID)
        database.prepare(`DELETE FROM wallpapers WHERE source = 'static' AND id LIKE 'static-%'`).run()
      }
    })
    prune()
  } catch (err) {
    console.warn('[DB] Error pruning removed static entries:', err)
  }
}
