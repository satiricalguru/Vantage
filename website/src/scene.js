import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

// ---------- helpers ----------
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const range = (p, a, b) => clamp((p - a) / (b - a))
const lerp = (a, b, t) => a + (b - a) * t
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t) => 1 - Math.pow(1 - t, 3)
const easeIn = (t) => t * t * t
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt))

// Rounded image card with fake depth fog — used for the monitor screen, tunnel panes and orbit cards.
function cardMaterial(map, aspect, { radius = 0.06, bright = 1 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: {
      map: { value: map },
      uAspect: { value: aspect },
      uRadius: { value: radius },
      uOpacity: { value: 1 },
      uFade: { value: 0 },
      uBright: { value: bright },
      uFog: { value: 0 },
      uTint: { value: new THREE.Color(1, 1, 1) }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying float vDepth;
      void main(){
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map; uniform float uAspect, uRadius, uOpacity, uFade, uBright, uFog; uniform vec3 uTint;
      varying vec2 vUv; varying float vDepth;
      float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
      void main(){
        vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
        float d = sdRound(p, vec2(uAspect, 1.0) * 0.5, uRadius);
        float a = 1.0 - smoothstep(-0.006, 0.006, d);
        float rim = smoothstep(-0.035, 0.0, d) * a;
        vec3 col = texture2D(map, vUv).rgb * uBright * uTint;
        col += rim * 0.35;
        col = mix(col, vec3(0.0), uFade);
        float fog = exp(-uFog * vDepth * vDepth * 0.01);
        gl_FragColor = vec4(col * fog, a * uOpacity);
        #include <colorspace_fragment>
      }`
  })
}

// Vantage aperture iris — replaces the astronaut as the hero object of the dive.
function makeIris() {
  const group = new THREE.Group()
  const chrome = new THREE.MeshPhysicalMaterial({ color: 0xe6e9ee, metalness: 1, roughness: 0.16, envMapIntensity: 1.3 })
  const graphite = new THREE.MeshPhysicalMaterial({ color: 0x15171c, metalness: 0.85, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.15 })

  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.56, 0.13, 32, 160), chrome)
  group.add(ring)
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.22, 96, 1, true), graphite)
  housing.rotation.x = Math.PI / 2
  group.add(housing)

  const shape = new THREE.Shape()
  shape.moveTo(1.38, 0)
  shape.quadraticCurveTo(1.05, 1.08, -0.18, 0.98)
  shape.quadraticCurveTo(0.58, 0.38, 1.38, 0)
  const bladeGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 24 })
  bladeGeo.translate(-1.38, 0, 0)
  const blades = []
  const COUNT = 7
  for (let i = 0; i < COUNT; i++) {
    const a = (i / COUNT) * Math.PI * 2
    const pivot = new THREE.Group()
    pivot.position.set(Math.cos(a) * 1.38, Math.sin(a) * 1.38, -0.06 + i * 0.012)
    pivot.userData.base = a
    const blade = new THREE.Mesh(bladeGeo, i % 2 ? chrome : graphite)
    blade.rotation.x = 0.04
    pivot.add(blade)
    group.add(pivot)
    blades.push(pivot)
  }

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 64, 64),
    new THREE.MeshPhysicalMaterial({ color: 0xbffcf4, metalness: 0, roughness: 0.04, transmission: 1, thickness: 1.1, ior: 1.5, iridescence: 1, iridescenceIOR: 1.3, envMapIntensity: 1.5 })
  )
  core.position.z = -0.25
  group.add(core)
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.16, 32, 32), new THREE.MeshBasicMaterial({ color: 0x8ff7ea, toneMapped: false }))
  ember.position.z = -0.3
  group.add(ember)
  const light = new THREE.PointLight(0x6ee7da, 6, 8, 1.6)
  light.position.z = 0.4
  group.add(light)

  const setOpen = (o) => {
    // o: 0 closed → 1 fully open
    for (const p of blades) p.rotation.z = p.userData.base - 0.08 - o * 0.62
    ember.scale.setScalar(0.6 + o * 1.4)
    light.intensity = 3 + o * 10
  }
  setOpen(0.2)
  return { group, setOpen, ember }
}

export function createScene(canvas, { thumbs, isTouch, onProgress }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.autoClear = false
  const maxDpr = isTouch ? 1.5 : 1.75
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr))

  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

  // ---------- loading ----------
  const manager = new THREE.LoadingManager()
  manager.onProgress = (_u, loaded, total) => onProgress?.(loaded / total)
  const loader = new THREE.TextureLoader(manager)
  const textures = thumbs.map((t) => {
    const tex = loader.load(t.src)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  })

  const video = document.createElement('video')
  Object.assign(video, { src: '/media/screen.mp4', muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous', preload: 'auto' })
  video.setAttribute('muted', '')
  const screenTex = new THREE.VideoTexture(video)
  screenTex.colorSpace = THREE.SRGBColorSpace
  const posterTex = loader.load('/media/screen-poster.jpg')
  posterTex.colorSpace = THREE.SRGBColorSpace

  // =========================================================
  // HERO — glossy shapes that scatter from the cursor
  // =========================================================
  const hero = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(30, 1, 0.1, 100), bodies: [], mouse: new THREE.Vector3(999, 999, 0), mouseVel: new THREE.Vector3(), active: false, intro: 0 }
  hero.scene.environment = env
  hero.scene.background = new THREE.Color(0x0b0c10)
  hero.camera.position.set(0, 0, 16)
  const key = new THREE.DirectionalLight(0xffffff, 2.2)
  key.position.set(4, 6, 8)
  hero.scene.add(key, new THREE.AmbientLight(0xffffff, 0.25))
  const rim = new THREE.PointLight(0x6ee7da, 40, 30)
  rim.position.set(-6, -3, 4)
  hero.scene.add(rim)

  const mats = {
    black: new THREE.MeshPhysicalMaterial({ color: 0x0c0d11, roughness: 0.22, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 }),
    white: new THREE.MeshPhysicalMaterial({ color: 0xf2f3f6, roughness: 0.32, metalness: 0, clearcoat: 0.7 }),
    teal: new THREE.MeshPhysicalMaterial({ color: 0x14c8b3, roughness: 0.25, metalness: 0.1, clearcoat: 1 }),
    chrome: new THREE.MeshPhysicalMaterial({ color: 0xdfe3e8, roughness: 0.12, metalness: 1 })
  }
  const bladeShape = new THREE.Shape()
  bladeShape.moveTo(0.7, 0)
  bladeShape.quadraticCurveTo(0.55, 0.62, -0.5, 0.55)
  bladeShape.quadraticCurveTo(0.2, 0.18, 0.7, 0)
  const geos = [
    { g: new THREE.CapsuleGeometry(0.34, 0.9, 10, 24), r: 0.8 },
    { g: new THREE.TorusGeometry(0.5, 0.21, 24, 64), r: 0.72 },
    { g: new RoundedBoxGeometry(0.95, 0.95, 0.95, 5, 0.22), r: 0.72 },
    { g: new THREE.SphereGeometry(0.5, 40, 40), r: 0.5 },
    { g: (() => { const g = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 4 }); g.center(); g.scale(1.3, 1.3, 1.3); return g })(), r: 0.75 }
  ]
  const matList = [mats.black, mats.black, mats.white, mats.white, mats.teal, mats.chrome]
  const BODY_COUNT = isTouch ? 34 : 54
  const homes = []
  let guard = 0
  while (homes.length < BODY_COUNT && guard++ < 6000) {
    const v = new THREE.Vector3((Math.random() - 0.5) * 17, (Math.random() - 0.5) * 8.5, (Math.random() - 0.5) * 5 - 0.5)
    if (homes.every((h) => h.distanceTo(v) > 1.25)) homes.push(v)
  }
  homes.forEach((home, i) => {
    const gi = geos[i % geos.length]
    const mesh = new THREE.Mesh(gi.g, matList[(i * 7) % matList.length])
    const s = 0.85 + Math.random() * 0.55
    mesh.scale.setScalar(s)
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6)
    const start = home.clone().multiplyScalar(2.2).add(new THREE.Vector3(0, 0, -30))
    mesh.position.copy(start)
    hero.scene.add(mesh)
    hero.bodies.push({ mesh, home, vel: new THREE.Vector3(), spin: new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6), r: gi.r * s, phase: Math.random() * 10 })
  })

  const tmpV = new THREE.Vector3()
  const tmpF = new THREE.Vector3()
  function updateHero(dt, t) {
    hero.intro = damp(hero.intro, 1, 1.6, dt)
    const R = 3.2
    for (const b of hero.bodies) {
      const p = b.mesh.position
      tmpV.copy(b.home)
      tmpV.y += Math.sin(t * 0.7 + b.phase) * 0.18
      tmpV.x += Math.cos(t * 0.5 + b.phase) * 0.12
      tmpF.subVectors(tmpV, p).multiplyScalar(5.5 * hero.intro)
      const dx = p.x - hero.mouse.x, dy = p.y - hero.mouse.y, dz = (p.z - hero.mouse.z) * 0.5
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist < R && dist > 0.001) {
        const f = Math.pow(1 - dist / R, 2) * 75
        tmpF.x += (dx / dist) * f + hero.mouseVel.x * 1.8 * (1 - dist / R)
        tmpF.y += (dy / dist) * f + hero.mouseVel.y * 1.8 * (1 - dist / R)
        tmpF.z += (dz / dist) * f * 0.6
        b.spin.x += (hero.mouseVel.y * 0.04) * (1 - dist / R)
        b.spin.y += (hero.mouseVel.x * 0.04) * (1 - dist / R)
      }
      b.vel.addScaledVector(tmpF, dt)
    }
    // soft collisions
    const B = hero.bodies
    for (let i = 0; i < B.length; i++) {
      for (let j = i + 1; j < B.length; j++) {
        const a = B[i].mesh.position, c = B[j].mesh.position
        const min = B[i].r + B[j].r
        const dx = c.x - a.x, dy = c.y - a.y, dz = c.z - a.z
        const d2 = dx * dx + dy * dy + dz * dz
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (min - d) * 0.5 / d
          a.x -= dx * push; a.y -= dy * push; a.z -= dz * push
          c.x += dx * push; c.y += dy * push; c.z += dz * push
          B[i].vel.x -= dx * push * 4; B[j].vel.x += dx * push * 4
          B[i].vel.y -= dy * push * 4; B[j].vel.y += dy * push * 4
        }
      }
    }
    const k = Math.exp(-3.2 * dt)
    for (const b of B) {
      b.vel.multiplyScalar(k)
      b.mesh.position.addScaledVector(b.vel, dt)
      b.spin.multiplyScalar(Math.exp(-0.6 * dt))
      b.mesh.rotation.x += (0.12 + b.spin.x) * dt
      b.mesh.rotation.y += (0.1 + b.spin.y) * dt
      b.mesh.rotation.z += b.spin.z * dt
    }
    hero.mouseVel.multiplyScalar(Math.exp(-8 * dt))
  }

  // =========================================================
  // RIBBON — a glossy 3D tube that trails the cursor
  // =========================================================
  const ribbon = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(35, 1, 0.1, 100), N: 70, R: 12, pts: [], target: new THREE.Vector3(), seen: false, opacity: 0 }
  ribbon.scene.environment = env
  ribbon.camera.position.z = 14
  ribbon.scene.add(new THREE.AmbientLight(0xffffff, 0.6))
  const rl = new THREE.DirectionalLight(0xffffff, 2)
  rl.position.set(3, 5, 6)
  ribbon.scene.add(rl)
  for (let i = 0; i < ribbon.N; i++) ribbon.pts.push(new THREE.Vector3())
  const rGeo = new THREE.BufferGeometry()
  const rPos = new Float32Array(ribbon.N * ribbon.R * 3)
  rGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3).setUsage(THREE.DynamicDrawUsage))
  const rIdx = []
  for (let i = 0; i < ribbon.N - 1; i++) {
    for (let j = 0; j < ribbon.R; j++) {
      const a = i * ribbon.R + j, b = i * ribbon.R + ((j + 1) % ribbon.R), c = a + ribbon.R, d = b + ribbon.R
      rIdx.push(a, c, b, b, c, d)
    }
  }
  rGeo.setIndex(rIdx)
  const rMat = new THREE.MeshPhysicalMaterial({ color: 0x19cdb8, roughness: 0.18, metalness: 0.1, clearcoat: 1, transparent: true })
  const rMesh = new THREE.Mesh(rGeo, rMat)
  rMesh.frustumCulled = false
  ribbon.scene.add(rMesh)
  const tangent = new THREE.Vector3(), normal = new THREE.Vector3(), binormal = new THREE.Vector3(0, 0, 1)

  function updateRibbon(dt, t) {
    const pts = ribbon.pts
    pts[0].x = damp(pts[0].x, ribbon.target.x, 22, dt)
    pts[0].y = damp(pts[0].y, ribbon.target.y, 22, dt)
    pts[0].z = Math.sin(t * 1.3) * 0.6
    for (let i = 1; i < pts.length; i++) {
      pts[i].x = damp(pts[i].x, pts[i - 1].x, 26, dt)
      pts[i].y = damp(pts[i].y, pts[i - 1].y, 26, dt)
      pts[i].z = damp(pts[i].z, pts[i - 1].z + Math.sin(i * 0.25 + t * 2) * 0.05, 26, dt)
    }
    let length = 0
    for (let i = 1; i < pts.length; i++) length += pts[i].distanceTo(pts[i - 1])
    const visible = clamp(length / 4)
    let v = 0
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      const n = pts[Math.min(i + 1, pts.length - 1)], pr = pts[Math.max(i - 1, 0)]
      tangent.subVectors(pr, n)
      if (tangent.lengthSq() < 1e-8) tangent.set(1, 0, 0)
      tangent.normalize()
      normal.crossVectors(tangent, binormal).normalize()
      const bn = tmpV.crossVectors(tangent, normal).normalize()
      const taper = Math.sin(Math.PI * Math.pow(i / (pts.length - 1), 0.7))
      const r = 0.14 * taper * visible
      for (let j = 0; j < ribbon.R; j++) {
        const th = (j / ribbon.R) * Math.PI * 2
        const cx = Math.cos(th) * r, cy = Math.sin(th) * r
        rPos[v++] = p.x + normal.x * cx + bn.x * cy
        rPos[v++] = p.y + normal.y * cx + bn.y * cy
        rPos[v++] = p.z + normal.z * cx + bn.z * cy
      }
    }
    rGeo.attributes.position.needsUpdate = true
    rGeo.computeVertexNormals()
  }

  // =========================================================
  // DIVE — monitor → void → iris → wallpaper tunnel → orbit
  // =========================================================
  const dive = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(35, 1, 0.1, 200), mouse: new THREE.Vector2(), mouseS: new THREE.Vector2() }
  dive.scene.environment = env
  dive.scene.fog = new THREE.FogExp2(0x050609, 0)
  dive.scene.add(new THREE.AmbientLight(0xffffff, 0.35))
  const dl = new THREE.DirectionalLight(0xffffff, 2.4)
  dl.position.set(3, 4, 6)
  dive.scene.add(dl)

  // Monitor
  const monitor = new THREE.Group()
  const metal = new THREE.MeshPhysicalMaterial({ color: 0x2a2d33, metalness: 0.9, roughness: 0.35, clearcoat: 0.6 })
  const silver = new THREE.MeshPhysicalMaterial({ color: 0xc9cdd3, metalness: 1, roughness: 0.25 })
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(6.8, 4.0, 0.2, 6, 0.1), metal)
  monitor.add(bezel)
  const screenMat = cardMaterial(posterTex, 6.5 / 3.66, { radius: 0.04 })
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 3.66), screenMat)
  screen.position.z = 0.105
  monitor.add(screen)
  const neck = new THREE.Mesh(new RoundedBoxGeometry(0.7, 1.7, 0.14, 4, 0.06), silver)
  neck.position.set(0, -2.6, -0.35)
  neck.rotation.x = -0.12
  const base = new THREE.Mesh(new RoundedBoxGeometry(2.6, 0.08, 1.6, 4, 0.04), silver)
  base.position.set(0, -3.45, -0.2)
  monitor.add(neck, base)
  dive.scene.add(monitor)

  // Void group (iris, dust)
  const voidGroup = new THREE.Group()
  dive.scene.add(voidGroup)
  const iris = makeIris()
  voidGroup.add(iris.group)

  const dustGeo = new THREE.BufferGeometry()
  const DUST = isTouch ? 1200 : 2600
  const dustPos = new Float32Array(DUST * 3)
  for (let i = 0; i < DUST; i++) {
    const r = 3 + Math.random() * 22, a = Math.random() * Math.PI * 2
    dustPos[i * 3] = Math.cos(a) * r
    dustPos[i * 3 + 1] = Math.sin(a) * r
    dustPos[i * 3 + 2] = 10 - Math.random() * 120
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xcfe9ff, size: 0.05, sizeAttenuation: true, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }))
  voidGroup.add(dust)

  // Portal ring below the iris
  const portal = new THREE.Mesh(
    new THREE.TorusGeometry(2.4, 0.03, 16, 200),
    new THREE.MeshBasicMaterial({ color: 0x8ff7ea, transparent: true, opacity: 0, toneMapped: false })
  )
  portal.position.set(0, -2.4, -10)
  voidGroup.add(portal)

  // Tunnel of wallpaper panes + light streaks
  const tunnel = new THREE.Group()
  dive.scene.add(tunnel)
  const RINGS = isTouch ? 12 : 17, PER = 7, RADIUS = 3.3, GAP = 4.6, Z0 = -14
  const panes = []
  const paneGeo = new THREE.PlaneGeometry(2.3, 1.3)
  for (let r = 0; r < RINGS; r++) {
    for (let k = 0; k < PER; k++) {
      const a = (k / PER) * Math.PI * 2 + r * 0.45
      const tex = textures[(r * PER + k) % textures.length]
      const m = new THREE.Mesh(paneGeo, cardMaterial(tex, 2.3 / 1.3, { radius: 0.08, bright: 1.15 }))
      const z = Z0 - r * GAP
      m.position.set(Math.cos(a) * RADIUS, Math.sin(a) * RADIUS, z)
      m.lookAt(0, 0, z)
      m.rotateZ(Math.PI / 2)
      tunnel.add(m)
      panes.push(m)
    }
  }
  const STREAKS = isTouch ? 220 : 420
  const streakGeo = new THREE.BoxGeometry(0.025, 0.025, 1.6)
  const streaks = new THREE.InstancedMesh(streakGeo, new THREE.MeshBasicMaterial({ toneMapped: false, fog: true }), STREAKS)
  const palette = [new THREE.Color(0x8ff7ea), new THREE.Color(0xb59cff), new THREE.Color(0xffffff), new THREE.Color(0xff7ab6)]
  const dummy = new THREE.Object3D()
  for (let i = 0; i < STREAKS; i++) {
    const a = Math.random() * Math.PI * 2, r = 1.6 + Math.random() * 5.5
    dummy.position.set(Math.cos(a) * r, Math.sin(a) * r, Z0 + 6 - Math.random() * (RINGS * GAP + 10))
    dummy.rotation.set((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, 0)
    dummy.scale.set(1, 1, 0.5 + Math.random() * 2.5)
    dummy.updateMatrix()
    streaks.setMatrixAt(i, dummy.matrix)
    streaks.setColorAt(i, palette[i % palette.length])
  }
  tunnel.add(streaks)
  const TUNNEL_END = Z0 - (RINGS - 1) * GAP - 8

  // Orbit cards for the final download scene
  const orbit = new THREE.Group()
  dive.scene.add(orbit)
  const ORBIT = isTouch ? 8 : 12
  const orbitCards = []
  for (let i = 0; i < ORBIT; i++) {
    const tex = textures[(i * 3 + 5) % textures.length]
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), cardMaterial(tex, 1.6, { radius: 0.08, bright: 1.1 }))
    m.userData = { a: (i / ORBIT) * Math.PI * 2, r: 4.2 + (i % 3) * 0.7, y: ((i % 4) - 1.5) * 1.1, z: ((i % 5) - 2) * 0.8, spin: Math.random() * 6, push: new THREE.Vector2() }
    orbit.add(m)
    orbitCards.push(m)
  }

  const lookTarget = new THREE.Vector3()
  const flashEl = document.querySelector('.flash')
  let diveVisible = false

  function updateDive(p, dl, dt, t, enter = 0) {
    dive.mouseS.x = damp(dive.mouseS.x, dive.mouse.x, 4, dt)
    dive.mouseS.y = damp(dive.mouseS.y, dive.mouse.y, 4, dt)
    const mx = dive.mouseS.x, my = dive.mouseS.y
    const cam = dive.camera
    const fitS = Math.min(1, cam.aspect * 1.05)
    monitor.scale.setScalar(fitS)

    // Phase A: monitor approach (0 → 0.2)
    const showMonitor = p < 0.205
    monitor.visible = showMonitor
    if (showMonitor) {
      if (video.paused) video.play().then(() => { screenMat.uniforms.map.value = screenTex }).catch(() => {})
      const a = easeInOut(range(p, 0, 0.14))
      const b = easeIn(range(p, 0.13, 0.2))
      monitor.rotation.y = lerp(-0.42, 0, a) + mx * 0.05 * (1 - b)
      monitor.rotation.x = lerp(0.12, 0, a) - my * 0.04 * (1 - b)
      // while the section is still scrolling into view, the monitor rides along with the page
      monitor.position.y = lerp(-0.4, 0, a) - enter * 2 * 15 * Math.tan(THREE.MathUtils.degToRad(17.5))
      const z = lerp(lerp(15, 5.2, a), 0.35, b)
      cam.position.set(mx * 0.4 * (1 - a), my * 0.25 * (1 - a), z)
      cam.fov = 35
      lookTarget.set(0, 0, 0)
      screenMat.uniforms.uFade.value = range(p, 0.15, 0.198)
      cam.lookAt(lookTarget)
    } else if (!video.paused) video.pause()

    // Phase B/C: void + iris + fall (0.2 → 0.56)
    const inTunnel = p >= 0.5
    const showVoid = !showMonitor
    voidGroup.visible = showVoid
    tunnel.visible = p > 0.44 && p < 0.92
    orbit.visible = p > 0.86
    dive.scene.fog.density = 0

    const open = easeInOut(range(p, 0.38, 0.55))
    iris.setOpen(lerp(0.15 + Math.sin(t * 0.8) * 0.04, 1, open))

    if (showVoid && p < 0.56) {
      const appear = easeOut(range(p, 0.2, 0.3))
      const fall = easeIn(range(p, 0.4, 0.56))
      cam.fov = 35
      cam.position.set(mx * 0.6, my * 0.4 + lerp(0, -1.2, fall), lerp(10, 8.5, appear) - fall * 4)
      iris.group.position.set(0, lerp(-0.2, -2.4, fall) + Math.sin(t * 1.1) * 0.08 * (1 - fall), lerp(-3, 0, appear) - fall * 9)
      iris.group.rotation.set(lerp(-my * 0.4, -1.25, fall) + Math.sin(t * 0.6) * 0.06, mx * 0.55 + Math.sin(t * 0.3) * 0.2 * (1 - fall), t * 0.12 + fall * 2)
      iris.group.scale.setScalar(lerp(0.4, 1.15, appear) * fitS)
      portal.material.opacity = range(p, 0.42, 0.52) * 0.9
      portal.scale.setScalar(1 + range(p, 0.45, 0.56) * 1.5)
      lookTarget.set(0, lerp(0, -2.2, fall), lerp(0, -8, fall))
      cam.lookAt(lookTarget)
      dust.rotation.z = t * 0.02
    }

    // Phase D: tunnel (0.56 → 0.88)
    if (p >= 0.56 && p < 0.9) {
      const tp = range(p, 0.56, 0.88)
      const travel = easeInOut(tp)
      const z = lerp(4.5, TUNNEL_END, travel)
      const speed = Math.sin(Math.PI * tp)
      cam.fov = 35 + speed * 38
      cam.position.set(mx * 0.5 + Math.sin(t * 0.7) * 0.2, my * 0.4 + Math.cos(t * 0.5) * 0.2, z)
      lookTarget.set(mx * 0.8, my * 0.6, z - 10)
      cam.lookAt(lookTarget)
      cam.rotation.z = Math.sin(tp * Math.PI * 2) * 0.25
      iris.group.position.set(Math.sin(t * 1.4) * 0.25, Math.cos(t) * 0.2 - 0.2, z - 5.5)
      iris.group.rotation.set(-0.2 + my * 0.3, mx * 0.4, t * (1 + speed * 4))
      iris.group.scale.setScalar(0.6)
      iris.setOpen(1)
      portal.material.opacity = 0
      tunnel.rotation.z = tp * 2.2 + t * 0.05
      dive.scene.fog.density = 0.035
      for (const pane of panes) {
        const d = Math.abs(pane.position.z - z)
        pane.material.uniforms.uFog.value = 0.9
        pane.material.uniforms.uBright.value = 0.95 + clamp(1 - d / 6) * 0.6
      }
    }

    // Phase E: arrival + orbit (0.88 → 1, continues through the download section)
    if (p >= 0.88) {
      const ap = easeOut(range(p, 0.9, 1))
      const enter = easeOut(clamp(ap * 0.6 + dl * 0.6))
      cam.fov = 35
      cam.position.set(mx * 0.9, my * 0.6 + lerp(-1.2, 0, enter), lerp(16, 11, enter))
      lookTarget.set(0, 0, 0)
      cam.lookAt(lookTarget)
      cam.rotation.z = 0
      iris.group.position.set(mx * 0.3, Math.sin(t * 1.1) * 0.12 + 0.2, 0)
      iris.group.rotation.set(-my * 0.5 + Math.sin(t * 0.5) * 0.08, mx * 0.7, t * 0.25)
      iris.group.scale.setScalar(lerp(0.6, 1.05, enter) * fitS)
      orbit.scale.setScalar(Math.max(0.55, fitS))
      iris.setOpen(0.75 + Math.sin(t * 0.9) * 0.15)
      voidGroup.visible = true
      portal.material.opacity = 0
      const mouseWorld = tmpV.set(mx * 6.5, my * 3.6, 0)
      for (const c of orbitCards) {
        const u = c.userData
        const a = u.a + t * 0.12
        const bx = Math.cos(a) * u.r * 1.3, bz = Math.sin(a) * u.r * 0.7 + u.z - 2.2
        const by = u.y + Math.sin(t * 0.8 + u.spin) * 0.2
        const dx = bx - mouseWorld.x, dy = by - mouseWorld.y
        const d = Math.hypot(dx, dy)
        const f = d < 2.6 ? (1 - d / 2.6) * 1.6 : 0
        u.push.x = damp(u.push.x, (dx / (d || 1)) * f, 6, dt)
        u.push.y = damp(u.push.y, (dy / (d || 1)) * f, 6, dt)
        c.position.set(bx + u.push.x, by + u.push.y, bz)
        c.rotation.set(Math.sin(t * 0.6 + u.spin) * 0.25 + u.push.y * 0.3, -a * 0.25 + u.push.x * 0.3, Math.sin(t * 0.4 + u.spin) * 0.15)
        c.scale.setScalar(enter)
        c.material.uniforms.uOpacity.value = enter
        c.material.uniforms.uFog.value = 0
      }
    }

    // flash between tunnel and arrival
    const flash = range(p, 0.84, 0.895) * (1 - range(p, 0.895, 0.96))
    flashEl.style.opacity = flash.toFixed(3)

    cam.updateProjectionMatrix()
  }

  // ---------- render loop ----------
  const size = { w: window.innerWidth, h: window.innerHeight }
  function resize() {
    size.w = window.innerWidth
    size.h = window.innerHeight
    renderer.setSize(size.w, size.h, false)
    dive.camera.aspect = size.w / size.h
    dive.camera.updateProjectionMatrix()
    ribbon.camera.aspect = size.w / size.h
    ribbon.camera.updateProjectionMatrix()
  }
  resize()

  const ndc = new THREE.Vector2()
  const ray = new THREE.Raycaster()
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  const hit = new THREE.Vector3()
  const lastHit = new THREE.Vector3()

  function pointerToPlane(camera, x, y, out) {
    ndc.set(x, y)
    ray.setFromCamera(ndc, camera)
    return ray.ray.intersectPlane(plane, out)
  }

  return {
    renderer,
    resize,
    setPointer(clientX, clientY, heroRect) {
      // hero: pointer relative to the hero card
      if (heroRect && clientX >= heroRect.left - 60 && clientX <= heroRect.right + 60 && clientY >= heroRect.top - 60 && clientY <= heroRect.bottom + 60) {
        const x = ((clientX - heroRect.left) / heroRect.width) * 2 - 1
        const y = -((clientY - heroRect.top) / heroRect.height) * 2 + 1
        if (pointerToPlane(hero.camera, x, y, hit)) {
          if (hero.mouse.x < 900) hero.mouseVel.lerp(tmpF.subVectors(hit, lastHit).multiplyScalar(60), 0.5)
          lastHit.copy(hit)
          hero.mouse.copy(hit)
        }
      } else hero.mouse.set(999, 999, 0)
      // ribbon + dive: full viewport
      const nx = (clientX / size.w) * 2 - 1, ny = -(clientY / size.h) * 2 + 1
      if (pointerToPlane(ribbon.camera, nx, ny, ribbon.target) && !ribbon.seen) {
        ribbon.seen = true
        ribbon.pts.forEach((pt) => pt.copy(ribbon.target))
      }
      dive.mouse.set(nx, ny)
    },
    render(state, dt, t) {
      renderer.setScissorTest(false)
      renderer.setViewport(0, 0, size.w, size.h)
      // The hero scene's opaque background leaves its colour as the GL clear value;
      // reset to transparent each frame so the page shows through (WebKit/Safari).
      renderer.setClearColor(0x000000, 0)
      renderer.clear()

      // hero card (scissored to the DOM card)
      const r = state.heroRect
      if (r && r.bottom > 0 && r.top < size.h) {
        updateHero(dt, t)
        const y = size.h - r.bottom
        renderer.setScissorTest(true)
        renderer.setScissor(r.left, y, r.width, r.height)
        renderer.setViewport(r.left, y, r.width, r.height)
        hero.camera.aspect = r.width / r.height
        hero.camera.position.x = damp(hero.camera.position.x, state.mx * 0.6, 3, dt)
        hero.camera.position.y = damp(hero.camera.position.y, state.my * 0.35, 3, dt)
        hero.camera.lookAt(0, 0, 0)
        // Fit the cluster to the card width
        const fitDist = Math.max(14, 9 / (hero.camera.aspect * Math.tan(THREE.MathUtils.degToRad(15))))
        hero.camera.position.z = Math.min(fitDist, 30)
        hero.camera.updateProjectionMatrix()
        renderer.render(hero.scene, hero.camera)
        renderer.setScissorTest(false)
        renderer.setViewport(0, 0, size.w, size.h)
      }

      // dive world
      const active = state.diveTop < size.h * 1.05 && state.diveBottomAfterDownload > 0
      if (active) {
        diveVisible = true
        updateDive(state.diveP, state.downloadP, dt, t, Math.max(0, state.diveTop / size.h))
        renderer.clearDepth()
        renderer.render(dive.scene, dive.camera)
      } else if (diveVisible) {
        diveVisible = false
        flashEl.style.opacity = '0'
        video.pause()
      }

      // ribbon trail on light sections
      const ribbonOn = !isTouch && state.ribbon && ribbon.seen
      ribbon.opacity = damp(ribbon.opacity, ribbonOn ? 1 : 0, 6, dt)
      if (ribbon.opacity > 0.01) {
        updateRibbon(dt, t)
        rMat.opacity = ribbon.opacity
        renderer.clearDepth()
        renderer.render(ribbon.scene, ribbon.camera)
      }
    }
  }
}
