// DOM-level motion: word-mask heading reveals, staggered rows, text scramble,
// tile tilt, magnetic elements, scroll progress, and hide-on-scroll nav.
// Everything degrades to static content under prefers-reduced-motion.

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches

/** Wrap each word of a heading in a mask so lines can rise in one by one. */
function splitWords(el) {
  let i = 0
  const wrap = (node) => {
    const out = document.createDocumentFragment()
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return
          if (/^\s+$/.test(part)) return out.append(document.createTextNode(' '))
          const w = document.createElement('span')
          w.className = 'w'
          w.innerHTML = `<span style="--i:${i++}"></span>`
          w.firstChild.textContent = part
          out.append(w)
        })
      } else if (child.nodeName === 'BR') {
        out.append(child.cloneNode())
      } else {
        // Keep inline elements (e.g. the animated count) intact inside one mask.
        const w = document.createElement('span')
        w.className = 'w'
        const inner = document.createElement('span')
        inner.style.setProperty('--i', i++)
        inner.append(child.cloneNode(true))
        w.append(inner)
        out.append(w)
      }
    })
    return out
  }
  const frag = wrap(el)
  el.textContent = ''
  el.append(frag)
  el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim())
}

/** Briefly scramble a label's letters before settling on the real text. */
function scramble(el) {
  const final = el.textContent
  const glyphs = '!<>-_\\/[]{}—=+*^?#ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const t0 = performance.now()
  const dur = 700
  const tick = (now) => {
    const k = Math.min(1, (now - t0) / dur)
    const settled = Math.floor(final.length * k)
    let s = final.slice(0, settled)
    for (let j = settled; j < final.length; j++) s += final[j] === ' ' ? ' ' : glyphs[(Math.random() * glyphs.length) | 0]
    el.textContent = s
    if (k < 1) requestAnimationFrame(tick)
    else el.textContent = final
  }
  requestAnimationFrame(tick)
}

export function initMotion({ getScrollY } = {}) {
  // ---- Word-mask headings ----
  const headings = [...document.querySelectorAll('[data-words]')]
  if (!reduced) headings.forEach(splitWords)

  // ---- Stagger groups (feature rows, download buttons, footer columns) ----
  document.querySelectorAll('[data-stagger]').forEach((group) => {
    ;[...group.children].forEach((child, i) => child.style.setProperty('--si', i))
  })

  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return
        e.target.classList.add('in')
        if (e.target.matches('[data-scramble]') && !reduced) scramble(e.target)
        io.unobserve(e.target)
      }),
    { threshold: 0.2, rootMargin: '0px 0px -8% 0px' }
  )
  document.querySelectorAll('[data-words], [data-stagger], [data-scramble], .eyebrow').forEach((el) => {
    if (el.classList.contains('eyebrow') && !el.hasAttribute('data-scramble')) el.setAttribute('data-scramble', '')
    io.observe(el)
  })

  if (reduced) {
    document.querySelectorAll('[data-words], [data-stagger]').forEach((el) => el.classList.add('in'))
    return { update() {} }
  }

  // ---- Tile tilt toward the cursor ----
  if (!isTouch) {
    document.addEventListener('pointermove', (e) => {
      const tile = e.target.closest?.('.tile')
      if (!tile) return
      const r = tile.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width - 0.5
      const y = (e.clientY - r.top) / r.height - 0.5
      tile.style.transform = `perspective(900px) rotateY(${x * 14}deg) rotateX(${-y * 12}deg) translateZ(10px)`
      tile.style.setProperty('--gx', `${(x + 0.5) * 100}%`)
      tile.style.setProperty('--gy', `${(y + 0.5) * 100}%`)
    })
    document.addEventListener('pointerout', (e) => {
      const tile = e.target.closest?.('.tile')
      if (tile && !tile.contains(e.relatedTarget)) tile.style.transform = ''
    })

    // ---- Magnetic pills and nav links ----
    document.querySelectorAll('.pill, .nav-links a, .footer-col a').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect()
        el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.2}px, ${(e.clientY - r.top - r.height / 2) * 0.3}px)`
      })
      el.addEventListener('pointerleave', () => (el.style.transform = ''))
    })
  }

  // ---- Scroll progress + hide-on-scroll nav + hero card depth ----
  const bar = document.querySelector('.progress')
  const nav = document.querySelector('.nav')
  const heroCard = document.querySelector('[data-hero-card]')
  const wordmark = document.querySelector('.footer-wordmark')
  let lastY = 0
  let navHidden = false

  return {
    update(vh) {
      const y = getScrollY ? getScrollY() : window.scrollY
      const max = document.documentElement.scrollHeight - vh
      if (bar) bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`

      const goingDown = y > lastY + 2
      const goingUp = y < lastY - 2
      if (goingDown && y > vh * 0.6 && !navHidden) (nav.classList.add('nav-hidden'), (navHidden = true))
      else if (goingUp && navHidden) (nav.classList.remove('nav-hidden'), (navHidden = false))
      lastY = y

      // The hero card sinks back as the page scrolls away (the canvas follows its rect).
      if (heroCard) {
        const k = Math.min(1, Math.max(0, y / vh))
        heroCard.style.setProperty('--hs', (1 - k * 0.08).toFixed(4))
        heroCard.style.setProperty('--hy', `${(k * 6).toFixed(2)}vh`)
      }

      // Footer wordmark letters rise as the footer scrolls in.
      if (wordmark) {
        const r = wordmark.getBoundingClientRect()
        // Fully risen by the time the wordmark's bottom edge is ~80px above the viewport bottom.
        const p = Math.min(1, Math.max(0, (vh - r.top) / (r.height + 80)))
        wordmark.style.setProperty('--wp', p.toFixed(3))
      }
    }
  }
}
