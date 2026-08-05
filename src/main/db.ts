import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { INITIAL_WALLPAPERS, WallpaperItem } from './contentSources'

let db: Database.Database | null = null

export function initDatabase(): Database.Database {
  if (db) return db

  const userDataPath = app.getPath('userData')
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true })
  }

  const dbPath = path.join(userDataPath, 'vantage.db')
  db = new Database(dbPath)

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
      previewUrl = excluded.previewUrl,
      sourceUrl = excluded.sourceUrl,
      generatorId = excluded.generatorId
  `)

  const syncCatalog = db!.transaction((items: WallpaperItem[]) => {
    // Purge outdated catalog entries from database that are no longer in INITIAL_WALLPAPERS and not user imported
    const placeHolders = items.map(() => '?').join(',')
    const itemIds = items.map((i) => i.id)
    try {
      db!.prepare(`UPDATE display_assignments SET wallpaper_id = 'local-v8' WHERE wallpaper_id IN (SELECT id FROM wallpapers WHERE source != 'user' AND id NOT LIKE 'user-%' AND id NOT IN (${placeHolders}))`).run(...itemIds)
      db!.prepare(`DELETE FROM wallpapers WHERE source != 'user' AND id NOT LIKE 'user-%' AND id NOT IN (${placeHolders})`).run(...itemIds)
    } catch (err) {
      console.warn('[DB Sync] Warning during catalog cleanup:', err)
    }

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
        added_at: Date.now()
      })
    }
  })

  syncCatalog(INITIAL_WALLPAPERS)

  return db
}

export function getAllWallpapers(category?: string, query?: string): WallpaperItem[] {
  const database = initDatabase()
  let sql = 'SELECT * FROM wallpapers'
  const params: any[] = []
  const conditions: string[] = []

  if (category && category !== 'all' && category !== 'favorites' && category !== 'videos' && category !== 'stills') {
    conditions.push('category = ?')
    params.push(category)
  } else if (category === 'favorites') {
    conditions.push('is_favorite = 1')
  } else if (category === 'videos') {
    conditions.push('type = ?')
    params.push('video')
  } else if (category === 'stills') {
    conditions.push('type != ?')
    params.push('video')
  }

  if (query && query.trim() !== '') {
    conditions.push('(title LIKE ? OR category LIKE ? OR source LIKE ?)')
    const searchTerm = `%${query.trim()}%`
    params.push(searchTerm, searchTerm, searchTerm)
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ')
  }

  sql += ' ORDER BY added_at DESC'

  const rows = database.prepare(sql).all(...params) as any[]

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    type: r.type,
    source: r.source,
    license: r.license,
    attribution: r.attribution,
    resolution: { width: r.resolution_w, height: r.resolution_h },
    duration: r.duration,
    previewUrl: r.previewUrl,
    sourceUrl: r.sourceUrl,
    generatorId: r.generatorId,
    colorPalette: r.colorPalette ? JSON.parse(r.colorPalette) : undefined,
    is_favorite: Boolean(r.is_favorite)
  }))
}

export function getWallpaperById(id: string): WallpaperItem | null {
  const database = initDatabase()
  const row = database.prepare('SELECT * FROM wallpapers WHERE id = ?').get(id) as any
  if (!row) return null

  return {
    id: row.id,
    title: row.title,
    category: row.category,
    type: row.type,
    source: row.source,
    license: row.license,
    attribution: row.attribution,
    resolution: { width: row.resolution_w, height: row.resolution_h },
    duration: row.duration,
    previewUrl: row.previewUrl,
    sourceUrl: row.sourceUrl,
    generatorId: row.generatorId,
    colorPalette: row.colorPalette ? JSON.parse(row.colorPalette) : undefined,
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
  const row = database.prepare('SELECT * FROM display_assignments WHERE display_id = ?').get(displayId) as any
  if (!row) {
    return { wallpaperId: 'local-v8', performanceMode: 'balanced' }
  }
  return {
    wallpaperId: row.wallpaper_id,
    performanceMode: row.performance_mode || 'balanced'
  }
}

export function setPerformanceMode(displayId: string, mode: string): void {
  const database = initDatabase()
  database.prepare(`
    INSERT INTO display_assignments (display_id, performance_mode)
    VALUES (?, ?)
    ON CONFLICT(display_id) DO UPDATE SET performance_mode = excluded.performance_mode
  `).run(displayId, mode)
}

export function toggleFavoriteInDb(wallpaperId: string, isFavorite: boolean): void {
  const database = initDatabase()
  database.prepare('UPDATE wallpapers SET is_favorite = ? WHERE id = ?').run(isFavorite ? 1 : 0, wallpaperId)
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
      previewUrl = excluded.previewUrl,
      sourceUrl = excluded.sourceUrl
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
