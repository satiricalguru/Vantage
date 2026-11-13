import './style.css'
import Lenis from 'lenis'
import thumbs from './thumbs.json'
import { initMotion } from './motion.js'
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const range = (p, a, b) => clamp((p - a) / (b - a))

const REPO = 'satiricalguru/Vantage'
const RELEASES = `https://github.com/${REPO}/releases/latest`

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches
const body = document.body

// ---------- WebGL support ----------
function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}
const useGL = !reduced && hasWebGL()
if (!useGL) body.classList.add('static-mode')
else body.classList.add('webgl')

// Word splitting must run before anything grabs elements inside headings (the count-up).
const motion = initMotion()

// ---------- Marquee tiles ----------
const tracks = [...document.querySelectorAll('.marquee-track')]
tracks.forEach((track, ti) => {
  const list = ti === 0 ? thumbs.slice(0, 21) : thumbs.slice(21)
  const html = list
    .map((t) => `<figure class="tile" data-cursor="View"><img src="${t.src}" alt="${t.title.replace(/"/g, '&quot;')}" loading="lazy" decoding="async" width="640" height="360"/><span>${t.category} · ${t.title}</span></figure>`)
    .join('')
  track.innerHTML = useGL ? html + html : html
})

// ---------- Split dive text into characters ----------
document.querySelectorAll('[data-split]').forEach((el) => {
  const text = el.textContent
  const mid = (text.length - 1) / 2
  el.innerHTML = [...text].map((ch, i) => `<span class="ch" style="--d:${((i - mid) / mid).toFixed(3)}">${ch}</span>`).join('')
})

// ---------- Reveal on view ----------
const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))),
  { threshold: 0.15 }
)
document.querySelectorAll('.reveal').forEach((el) => io.observe(el))

// Count-up for the library number
const countEl = document.querySelector('[data-count]')
if (countEl) {
  const target = Number(countEl.dataset.count)
  const cio = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return
    cio.disconnect()
    if (reduced) return
    const t0 = performance.now()
    const tick = (now) => {
      const k = clamp((now - t0) / 1600)
      countEl.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))).toLocaleString('en-US')
      if (k < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  cio.observe(countEl)
}

// ---------- Download buttons: resolve real release assets ----------
const platform = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent).toLowerCase()
const userOS = platform.includes('win') ? 'win' : platform.includes('mac') ? 'mac' : null
const btnMac = document.querySelector('.dl-btn[data-os="mac"]')
const btnWin = document.querySelector('.dl-btn[data-os="win"]')
const meta = document.querySelector('[data-dl-meta]')
if (userOS === 'win') btnWin.parentNode.prepend(btnWin)
;(userOS === 'win' ? btnWin : btnMac).classList.add('primary')

fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
  .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
  .then((rel) => {
    const assets = rel.assets || []
    const find = (re) => assets.find((a) => re.test(a.name))
    const macArm = find(/arm64.*\.dmg$/i)
    const macIntel = find(/^(?!.*arm64).*\.dmg$/i)
    const win = find(/\.exe$/i)
    const mb = (a) => `${Math.round(a.size / 1e6)} MB`
    if (macArm || macIntel) btnMac.href = (macArm || macIntel).browser_download_url
    if (win) {
      btnWin.href = win.browser_download_url
    } else {
      btnWin.classList.add('pending')
      btnWin.classList.remove('primary')
      btnWin.querySelector('small').textContent = 'Coming soon for'
      btnWin.href = RELEASES
    }
    // Build with DOM nodes, never innerHTML, since these values come from the API.
    const link = (a, label) => Object.assign(document.createElement('a'), { href: a.browser_download_url, textContent: `${label} (${mb(a)})` })
    const parts = [document.createTextNode(String(rel.tag_name || ''))]
    if (macArm) parts.push(link(macArm, 'Apple Silicon'))
    if (macIntel) parts.push(link(macIntel, 'Intel'))
    if (win) parts.push(link(win, 'Windows'))
    parts.push(document.createTextNode('MIT licensed'))
    meta.replaceChildren(...parts.flatMap((p, i) => (i ? [document.createTextNode(' · '), p] : [p])))
  })
  .catch(() => {
    /* keep the releases-page links */
  })

// ---------- Smooth scroll ----------
let lenis = null
if (!reduced) {
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 })
  document.querySelectorAll('a[href^="#"]').forEach((a) =>
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href')
      if (id.length < 2) return
      e.preventDefault()
      lenis.scrollTo(id === '#top' ? 0 : id, { duration: id === '#download' ? 4 : 1.6 })
    })
  )
}

// ---------- Cursor ----------
const cursor = document.querySelector('.cursor')
const ring = cursor.querySelector('.cursor-ring')
const dot = cursor.querySelector('.cursor-dot')
const label = cursor.querySelector('.cursor-label')
const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, rx: window.innerWidth / 2, ry: window.innerHeight / 2, moved: false }
if (!isTouch) body.classList.add('has-cursor')

window.addEventListener('pointermove', (e) => {
  pointer.x = e.clientX
  pointer.y = e.clientY
  pointer.moved = true
}, { passive: true })

document.addEventListener('pointerover', (e) => {
  const el = e.target.closest('[data-cursor]')
  if (el) {
    label.textContent = el.dataset.cursor
    cursor.classList.add('is-label')
  }
})
document.addEventListener('pointerout', (e) => {
  const el = e.target.closest('[data-cursor]')
  if (el && !el.contains(e.relatedTarget)) cursor.classList.remove('is-label')
})

// Magnetic download buttons
document.querySelectorAll('.dl-btn, .nav-cta').forEach((btn) => {
  btn.addEventListener('pointermove', (e) => {
    const r = btn.getBoundingClientRect()
    btn.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.35}px)`
  })
  btn.addEventListener('pointerleave', () => (btn.style.transform = ''))
})

// Feature hover preview that follows the cursor
const preview = document.querySelector('.preview')
const previewImg = preview.querySelector('img')
const prev = { x: 0, y: 0, rot: 0 }
document.querySelectorAll('.feature-list li').forEach((li) => {
  li.addEventListener('pointerenter', () => {
    previewImg.src = li.dataset.img
    preview.classList.add('on')
  })
  li.addEventListener('pointerleave', () => preview.classList.remove('on'))
})

// ---------- Scene ----------
const loaderEl = document.querySelector('.loader')
const countLabel = document.querySelector('.loader-count')
let loadPct = 0
let revealed = false
function reveal() {
  if (revealed) return
  revealed = true
  loaderEl.classList.add('done')
  body.classList.add('ready')
}
setTimeout(reveal, 4500)

let scene = null
if (useGL) {
  import('./scene.js')
    .then(({ createScene }) => {
      scene = createScene(document.getElementById('gl'), {
        thumbs,
        isTouch,
        onProgress: (k) => {
          loadPct = Math.max(loadPct, Math.round(k * 100))
          countLabel.textContent = loadPct
          if (k >= 1) setTimeout(reveal, 250)
        }
      })
    })
    .catch((err) => {
      console.warn('WebGL scene failed, using static layout', err)
      body.classList.replace('webgl', 'static-mode')
      scene = null
      reveal()
    })
} else reveal()

const heroCard = document.querySelector('[data-hero-card]')
const diveEl = document.getElementById('dive')
const diveText = document.querySelector('.dive-text')
const diveCaption = document.querySelector('.dive-caption')
const downloadEl = document.getElementById('download')
const marquees = [...document.querySelectorAll('.marquee')].map((m) => ({ el: m.firstElementChild, speed: Number(m.dataset.speed), x: 0 }))

window.addEventListener('resize', () => scene?.resize())

let last = performance.now()
let lastScroll = window.scrollY
let velocity = 0
const start = performance.now()

function frame(now) {
  const dt = Math.min((now - last) / 1000, 1 / 20)
  last = now
  const t = (now - start) / 1000
  lenis?.raf(now)

  const vh = window.innerHeight
  const sy = window.scrollY
  velocity += ((sy - lastScroll) / Math.max(dt, 1e-3) - velocity) * 0.12
  lastScroll = sy

  // cursor
  pointer.rx += (pointer.x - pointer.rx) * (1 - Math.exp(-dt * 14))
  pointer.ry += (pointer.y - pointer.ry) * (1 - Math.exp(-dt * 14))
  dot.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`
  ring.style.transform = `translate3d(${pointer.rx}px, ${pointer.ry}px, 0)`

  // feature preview
  const px = pointer.x + 24, py = pointer.y - 90
  const vx = px - prev.x
  prev.x += vx * (1 - Math.exp(-dt * 10))
  prev.y += (py - prev.y) * (1 - Math.exp(-dt * 10))
  prev.rot += (clamp(vx * 0.04, -12, 12) - prev.rot) * 0.1
  if (preview.classList.contains('on')) preview.style.translate = `${prev.x}px ${prev.y}px`
  preview.style.rotate = `${prev.rot}deg`

  // marquees: scroll velocity speeds them up and skews them
  if (useGL) {
    const boost = clamp(velocity / 1500, -3, 3)
    for (const m of marquees) {
      const w = m.el.scrollWidth / 2
      m.x -= m.speed * (1 + Math.abs(boost) * 2.5) * dt
      if (w > 0) m.x = -((((-m.x) % w) + w) % w)
      m.el.style.transform = `translate3d(${m.x}px,0,0) skewX(${(-boost * 4).toFixed(2)}deg)`
    }
  }

  // dive progress drives the copy
  const dr = diveEl.getBoundingClientRect()
  const diveP = clamp(-dr.top / (dr.height - vh))
  const dlr = downloadEl.getBoundingClientRect()
  const downloadP = clamp((vh - dlr.top) / vh)
  if (useGL) {
  const textIn = range(diveP, 0.24, 0.3)
  const textOut = 1 - range(diveP, 0.5, 0.56)
  diveText.style.setProperty('--o', (textIn * textOut).toFixed(3))
  diveText.style.setProperty('--spread', (Math.pow(range(diveP, 0.4, 0.56), 1.6) * 1.6).toFixed(3))
  diveCaption.style.setProperty('--co', (range(diveP, 0.27, 0.32) * (1 - range(diveP, 0.4, 0.45))).toFixed(3))
  }

  motion.update(vh)

  const dark = useGL ? diveP > 0.11 || dr.bottom < vh : dr.top < vh * 0.5
  body.classList.toggle('dark', dark)

  if (scene) {
    const heroRect = heroCard.getBoundingClientRect()
    if (pointer.moved) scene.setPointer(pointer.x, pointer.y, heroRect)
    scene.render(
      {
        heroRect,
        mx: (pointer.x / window.innerWidth) * 2 - 1,
        my: -(pointer.y / vh) * 2 + 1,
        diveP,
        downloadP,
        diveTop: dr.top,
        diveBottomAfterDownload: dlr.bottom,
        ribbon: dr.top > vh * 0.6
      },
      dt,
      t
    )
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
