#!/usr/bin/env node
/**
 * Catalog audit + repair.
 *
 *   node scripts/audit-catalog.mjs            # report only
 *   node scripts/audit-catalog.mjs --write    # apply fixes to resources/catalog.json
 *   node scripts/audit-catalog.mjs --links    # also HEAD-check every remote sourceUrl
 *
 * Fixes applied with --write:
 *   - keyword-based category correction (anime / games / heroes / cars / space / nature)
 *   - the "generative" category is reserved for procedural generators; videos move out
 *   - stray categories ("superhero", "fantasy") folded into the sidebar's categories
 *   - remote MotionBGS items get source "motionbgs" (was a mix of "ai" / "custom")
 *   - duplicate titles get a distinguishing suffix
 *   - bundled-but-uncatalogued videos in resources/wallpapers are added
 *   - built-in procedural generators (src/shared/generators.ts ids) are added
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalogPath = path.join(root, 'resources', 'catalog.json')
const WRITE = process.argv.includes('--write')
const LINKS = process.argv.includes('--links')

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))

const RULES = [
  ['heroes', ['spider', 'spidey', 'spiderman', 'batman', 'superman', 'marvel', 'iron man', 'ironman', 'thor', 'hulk', 'deadpool', 'venom', 'joker', 'wolverine', 'captain america', 'silver surfer', 'ghost rider', 'avengers', 'miles morales', 'harley quinn', 'wonder woman', 'black panther', 'doctor strange', 'loki', 'thanos', 'groot', 'aquaman', 'punisher', 'daredevil', 'moon knight', 'gwen', 'carnage', 'scarlet witch', 'black widow', 'dark knight', 'gotham', 'kryptonian', 'luna snow']],
  ['games', ['league of legends', 'runeterra', 'arcane', 'valorant', 'overwatch', 'zenyatta', 'illari', 'genji', 'tracer', 'kiriko', 'akali', 'jinx', 'ahri', 'yasuo', 'yone', 'ashe', 'ekko', 'caitlyn', 'viper', 'jett', 'reyna', 'raze', 'sage', 'genshin', 'raiden', 'hu tao', 'furina', 'honkai', 'star rail', 'march 7th', 'kafka', 'firefly', 'acheron', 'wuthering', 'shorekeeper', 'camellya', 'zenless', 'zzz', 'elden ring', 'malenia', 'witcher', 'geralt', 'halo', 'master chief', 'minecraft', 'fortnite', 'call of duty', 'apex', 'cyberpunk', 'god of war', 'kratos', 'ghost of tsushima', 'tsushima', 'hunt showdown', 'deltarune', 'undertale', 'nier', '2b', 'among us', 'rollercoaster tycoon', 'zelda', 'mario', 'sonic', 'pokemon', 'pikachu', 'punishing gray raven', 'lucia', 'scarlet nexus', 'ftl', 't1', 'worlds 2025', 'skins', 'splash art', 'dota', 'counter strike', 'cs2', 'gta', 'red dead', "assassin's creed", 'resident evil', 'dark souls', 'sekiro', 'bloodborne', 'hollow knight', 'destiny', 'diablo', 'warcraft', 'starcraft', 'final fantasy', 'cloud strife', 'sephiroth', 'persona', 'blue archive', 'arknights', 'azur lane', 'nikke', 'shan hai', 'black myth', 'wukong', 'stellar blade', 'lies of p', 'hades', 'dead cells', 'terraria', 'portal', 'half life', 'gaming', 'gamer', 'esports', 'iuno', 'remielle', 'hsr', 'silver wolf', 'shiroko', 'automata', 'marvel rivals']],
  ['anime', ['anime', 'naruto', 'sasuke', 'itachi', 'kakashi', 'akatsuki', 'madara', 'one piece', 'luffy', 'zoro', 'brook', 'sanji', 'nami', 'shanks', 'demon slayer', 'kimetsu', 'tanjiro', 'nezuko', 'rengoku', 'jujutsu', 'jjk', 'gojo', 'sukuna', 'yuta', 'okkotsu', 'megumi', 'attack on titan', 'eren', 'levi', 'mikasa', 'chainsaw', 'pochita', 'denji', 'makima', 'solo leveling', 'sung jin woo', 'jin woo', 'tokyo ghoul', 'kaneki', 'ayato', 'rize', 'touka', 'dragon ball', 'dbz', 'goku', 'vegeta', 'trunks', 'gohan', 'bleach', 'ichigo', 'berserk', 'guts', 'griffith', 'evangelion', 'my hero', 'deku', 'bakugo', 'todoroki', 'spy x family', 'anya', 'frieren', 'quintuplets', 'hanayome', 'miku', 'nakano', 'overlord', 'albedo', 're zero', 'death note', 'hunter x hunter', 'killua', 'one punch', 'saitama', 'haikyu', 'mob psycho', 'asa mitaka', 'bocchi', 'gintama', 'fullmetal', 'cowboy bebop', 'samurai champloo', 'violet evergarden', 'your name', 'ghibli', 'totoro', 'kiki', 'mononoke', 'spirited away', 'monarch of shadows', 'aot', 'chika', 'zero two', 'darling in the franxx', 'kurapika', 'hisoka', 'madoka', 'sailor moon', 'inuyasha', 'jojo', 'jinwoo', 'jin-woo', 'byakuya']],
  ['cars', ['nissan', 'bmw', 'porsche', 'gt-r', 'gtr', 'supra', 'mustang', 'ferrari', 'lamborghini', 'ae86', 'toyota', 'honda', 'mazda', 'rx-7', 'rx7', 'r34', 'r35', 'r32', 'civic', 'drift', 'mercedes', 'audi', 'jdm', 'rocket bunny', 'car', 'cars', 'corvette', 'mclaren', 'bugatti', 'koenigsegg', 'subaru', 'mitsubishi', 'lancer', 'silvia', 'initial d', 'motorcycle']],
  ['space', ['astronaut', 'spaceman', 'planet', 'saturn', 'nebula', 'galaxy', 'black hole', 'cosmos', 'cosmic', 'outer space', 'space', 'earth', 'mars', 'jupiter', 'interstellar', 'supernova', 'milky way', 'universe', 'orbit', 'starship', 'spaceship']],
  ['nature', ['forest', 'lake', 'mountain', 'mountains', 'meadow', 'flower', 'flowers', 'river', 'ocean', 'sea', 'beach', 'waterfall', 'snow', 'snowy', 'tree', 'cherry blossom', 'sakura', 'field', 'garden', 'landscape', 'autumn', 'winter', 'spring', 'island', 'valley', 'cabin', 'falls', 'jungle', 'rainforest', 'desert', 'canyon', 'aurora', 'koi', 'pond', 'bamboo', 'leaves', 'wildlife', 'whale']]
]

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const compiled = RULES.map(([cat, words]) => [cat, new RegExp(`(^|[^a-z0-9])(${words.map(escape).join('|')})([^a-z0-9]|$)`, 'i')])

function classify(item) {
  const hay = `${item.title} ${item.id.replace(/^motionbgs-/, '').replace(/-/g, ' ')}`.toLowerCase()
  for (const [cat, re] of compiled) if (re.test(hay)) return cat
  return null
}

const report = { recategorized: {}, sourceFixed: 0, renamed: [], added: [], strays: 0 }
const moves = []

for (const item of catalog) {
  if (item.type === 'generative') continue
  const before = item.category
  let next = classify(item)
  if (!next) {
    if (before === 'generative') next = 'ai-art'
    else if (before === 'superhero') next = 'heroes'
    else if (before === 'fantasy') next = 'ai-art'
  }
  if (before === 'superhero' || before === 'fantasy') report.strays++
  if (next && next !== before) {
    // Local bundled items keep their curated category, and confident franchise
    // buckets (anime / games / heroes) only move between each other.
    const franchise = ['anime', 'games', 'heroes']
    if (item.source === 'local' || (franchise.includes(before) && !franchise.includes(next))) next = null
  }
  if (next && next !== before) {
    moves.push(`${before.padEnd(10)} → ${next.padEnd(7)} ${item.title}`)
    const key = `${before}→${next}`
    report.recategorized[key] = (report.recategorized[key] || 0) + 1
    item.category = next
  }
  if (/^https?:\/\/(www\.)?motionbgs\.com\//i.test(item.sourceUrl) && item.source !== 'motionbgs') {
    item.source = 'motionbgs'
    report.sourceFixed++
  }
}

// Duplicate titles
const seenTitles = new Map()
for (const item of catalog) {
  const k = item.title.trim().toLowerCase()
  if (seenTitles.has(k)) {
    const n = seenTitles.get(k) + 1
    seenTitles.set(k, n)
    const old = item.title
    item.title = `${item.title} ${['II', 'III', 'IV', 'V'][n - 2] || n}`
    report.renamed.push(`${old} → ${item.title}`)
  } else seenTitles.set(k, 1)
}

// Bundled videos that are not referenced by the catalog
const wallpaperDir = path.join(root, 'resources', 'wallpapers')
const referenced = new Set(catalog.map((i) => i.sourceUrl.toLowerCase().replace(/^extracted\//, '')))
for (const file of fs.existsSync(wallpaperDir) ? fs.readdirSync(wallpaperDir) : []) {
  if (!/\.(mp4|mov|webm)$/i.test(file) || referenced.has(file.toLowerCase())) continue
  const base = file.replace(/\.[^.]+$/, '')
  const id = `bundled-${base.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  if (catalog.some((i) => i.id === id)) continue
  const thumb = `resources/thumbnails/${id}.jpg`
  catalog.push({
    id,
    title: base.replace(/\b\w/g, (c) => c.toUpperCase()),
    category: classify({ title: base, id }) || 'anime',
    type: 'video',
    previewUrl: thumb,
    sourceUrl: `extracted/${file}`,
    resolution: { width: 2560, height: 1440 },
    source: 'local',
    license: 'Bundled with Vantage',
    attribution: 'Bundled wallpaper'
  })
  report.added.push(`${id} (${file})${fs.existsSync(path.join(root, thumb)) ? '' : ' — thumbnail missing, run scripts/create-thumbnail.mjs'}`)
}

// Procedural generators shipped in src/renderer/wallpaper/shaders
const GENERATORS = [
  ['gen-iris-bloom', 'Iris Bloom', 'iris-bloom'],
  ['gen-liquid-chrome', 'Liquid Chrome', 'liquid-chrome'],
  ['gen-silk-waves', 'Silk Waves', 'silk-waves'],
  ['gen-neon-horizon', 'Neon Horizon', 'neon-horizon'],
  ['gen-ink-nebula', 'Ink Nebula', 'ink-nebula'],
  ['gen-warp-drive', 'Warp Drive', 'warp-drive'],
  ['gen-aurora-veil', 'Aurora Veil', 'aurora-veil'],
  ['gen-lava-lamp', 'Lava Lamp', 'lava-lamp'],
  ['gen-quantum-field', 'Quantum Field', 'quantum'],
  ['gen-aurora-flow', 'Aurora Flow', 'aurora'],
  ['gen-nebula-drift', 'Nebula Drift', 'nebula']
]
for (const [id, title, generatorId] of GENERATORS) {
  if (catalog.some((i) => i.id === id)) continue
  catalog.push({
    id,
    title,
    category: 'generative',
    type: 'generative',
    previewUrl: '',
    sourceUrl: '',
    resolution: { width: 3840, height: 2160 },
    source: 'vantage',
    license: 'Vantage Original (MIT)',
    attribution: 'Procedural shader by Vantage',
    generatorId
  })
  report.added.push(`${id} (procedural)`)
}

// Integrity checks
const issues = []
const ids = new Set()
for (const item of catalog) {
  if (ids.has(item.id)) issues.push(`duplicate id ${item.id}`)
  ids.add(item.id)
  if (item.previewUrl && !fs.existsSync(path.join(root, item.previewUrl))) issues.push(`missing thumbnail ${item.previewUrl}`)
  if (item.sourceUrl.startsWith('extracted/') && !fs.existsSync(path.join(wallpaperDir, item.sourceUrl.slice(10))) && !fs.readdirSync(wallpaperDir).some((f) => f.toLowerCase() === item.sourceUrl.slice(10).toLowerCase())) issues.push(`missing bundled video ${item.sourceUrl}`)
}

if (LINKS) {
  const remote = catalog.filter((i) => /^https?:/.test(i.sourceUrl))
  let cursor = 0
  const bad = []
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (cursor < remote.length) {
      const item = remote[cursor++]
      try {
        const res = await fetch(item.sourceUrl, { method: 'HEAD', signal: AbortSignal.timeout(20000) })
        if (!res.ok) bad.push(`${res.status} ${item.id}`)
      } catch (e) {
        bad.push(`ERR ${item.id} ${e.message}`)
      }
    }
  }))
  console.log(`Link check: ${remote.length - bad.length}/${remote.length} reachable`)
  bad.forEach((b) => console.log('  ' + b))
}

const counts = catalog.reduce((acc, i) => ((acc[i.category] = (acc[i.category] || 0) + 1), acc), {})
console.log('Recategorized:', report.recategorized)
console.log('Sources normalized:', report.sourceFixed, '· stray categories:', report.strays)
console.log('Renamed duplicates:', report.renamed)
console.log('Added:', report.added)
console.log('Category totals:', counts, '· total', catalog.length)
console.log('Integrity issues:', issues.length ? issues : 'none')
if (process.argv.includes('--verbose')) moves.forEach((m) => console.log('  ' + m))

if (WRITE) {
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 1) + '\n')
  console.log(`\nWrote ${catalogPath}`)
}
