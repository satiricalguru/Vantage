/**
 * Procedural GPU wallpapers. Each entry is a GLSL ES 1.0 fragment shader body
 * that writes gl_FragColor from `uv` (0..1), `uTime`, `uRes` and `uMouse` (0..1).
 * Shared by the wallpaper renderer (full screen) and gallery thumbnails.
 */

const HEADER = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 5; i++){ v += a * noise(p); p = m * p; a *= 0.5; } return v; }
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d){ return a + b * cos(6.28318 * (c * t + d)); }
`

export const SHADERS: Record<string, string> = {
  'iris-bloom': `
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  uv += (uMouse - 0.5) * 0.08;
  float r = length(uv), a = atan(uv.y, uv.x);
  float k = 7.0;
  float seg = mod(a + uTime * 0.08, 6.28318 / k) - 3.14159 / k;
  vec2 p = vec2(cos(seg), sin(seg)) * r;
  float petals = smoothstep(0.02, 0.0, abs(p.y - 0.18 * sin(p.x * 9.0 - uTime * 0.6)) - 0.004 * (1.0 / (r + 0.2)));
  float ring = smoothstep(0.015, 0.0, abs(r - 0.36 - 0.02 * sin(uTime * 0.7)));
  float glow = 0.035 / (r + 0.04);
  vec3 col = palette(r * 1.4 - uTime * 0.05, vec3(0.45), vec3(0.4), vec3(1.0), vec3(0.42, 0.55, 0.7));
  vec3 c = col * (petals * 1.4 + ring * 0.9) + vec3(0.43, 0.9, 0.85) * glow;
  c += fbm(uv * 3.0 + uTime * 0.05) * 0.06;
  c *= smoothstep(1.3, 0.2, r);
  gl_FragColor = vec4(c, 1.0);
}`,

  'liquid-chrome': `
void main(){
  vec2 uv = gl_FragCoord.xy / uRes.y;
  vec2 m = (uMouse - 0.5) * 0.6;
  vec2 q = vec2(fbm(uv * 1.6 + uTime * 0.04), fbm(uv * 1.6 + vec2(5.2, 1.3) - uTime * 0.03));
  vec2 r = vec2(fbm(uv * 1.6 + 3.0 * q + vec2(1.7, 9.2) + m + uTime * 0.05), fbm(uv * 1.6 + 3.0 * q + vec2(8.3, 2.8) - uTime * 0.04));
  float f = fbm(uv * 1.6 + 3.5 * r);
  float bands = sin(f * 18.0 + uTime * 0.4) * 0.5 + 0.5;
  vec3 base = mix(vec3(0.05, 0.06, 0.08), vec3(0.82, 0.86, 0.92), pow(bands, 3.0));
  base += pow(bands, 22.0) * 0.9;
  base = mix(base, base * vec3(0.55, 0.95, 0.92), smoothstep(0.4, 0.9, length(q)));
  gl_FragColor = vec4(base, 1.0);
}`,

  'silk-waves': `
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 col = mix(vec3(0.96, 0.84, 0.86), vec3(0.62, 0.7, 0.95), uv.y);
  for (int i = 0; i < 6; i++){
    float fi = float(i);
    float y = 0.25 + fi * 0.11 + 0.06 * sin(uv.x * (2.0 + fi * 0.6) + uTime * (0.25 + fi * 0.05) + fi) + (uMouse.y - 0.5) * 0.05 * fi;
    float d = uv.y - y;
    float band = smoothstep(0.0, 0.18, d) * smoothstep(0.32, 0.0, d);
    vec3 tint = palette(fi * 0.13 + 0.1, vec3(0.7), vec3(0.25), vec3(1.0), vec3(0.0, 0.1, 0.25));
    float sheen = pow(1.0 - abs(d * 6.0 - 0.6), 6.0);
    col = mix(col, tint + sheen * 0.25, band * 0.55);
  }
  gl_FragColor = vec4(col, 1.0);
}`,

  'neon-horizon': `
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  uv.x += (uMouse.x - 0.5) * 0.1;
  vec3 sky = mix(vec3(0.05, 0.02, 0.12), vec3(0.55, 0.1, 0.45), smoothstep(-0.1, 0.5, -uv.y + 0.35));
  vec3 col = sky;
  vec2 sp = uv - vec2(0.0, 0.12);
  float sun = smoothstep(0.26, 0.255, length(sp));
  float stripes = step(0.5, fract((sp.y + uTime * 0.02) * 22.0)) + step(0.06, sp.y);
  col = mix(col, mix(vec3(1.0, 0.85, 0.3), vec3(1.0, 0.25, 0.55), smoothstep(0.25, -0.2, sp.y)), sun * clamp(stripes, 0.0, 1.0));
  col += vec3(1.0, 0.3, 0.6) * 0.04 / (abs(length(sp) - 0.26) + 0.02);
  if (uv.y < -0.05){
    float depth = 0.12 / (-uv.y - 0.03);
    vec2 g = vec2(uv.x * depth, depth + uTime * 0.6);
    vec2 grid = abs(fract(g) - 0.5);
    float line = smoothstep(0.06 * depth * 0.2 + 0.02, 0.0, min(grid.x, grid.y));
    col = mix(vec3(0.03, 0.0, 0.08), vec3(0.2, 0.9, 1.0), line * smoothstep(12.0, 1.0, depth));
  }
  col += hash(gl_FragCoord.xy + uTime) * 0.03;
  gl_FragColor = vec4(col, 1.0);
}`,

  'ink-nebula': `
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  uv += (uMouse - 0.5) * 0.15;
  vec2 p = uv * 2.2;
  float n = fbm(p + fbm(p * 1.5 + uTime * 0.03) * 2.0);
  float n2 = fbm(p * 2.0 - uTime * 0.02 + 10.0);
  vec3 col = palette(n + uTime * 0.01, vec3(0.2, 0.1, 0.3), vec3(0.5, 0.35, 0.6), vec3(1.0), vec3(0.6, 0.35, 0.15)) * pow(n, 2.2) * 2.2;
  col += vec3(0.2, 0.75, 0.8) * pow(n2, 4.0) * 1.2;
  vec2 sg = floor(gl_FragCoord.xy / 2.0);
  float s = hash(sg);
  col += step(0.9975, s) * (0.6 + 0.4 * sin(uTime * 3.0 + s * 100.0));
  gl_FragColor = vec4(col, 1.0);
}`,

  'warp-drive': `
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  uv -= (uMouse - 0.5) * 0.2;
  float a = atan(uv.y, uv.x), r = length(uv);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    float lanes = 90.0 + fi * 40.0;
    float id = floor(a / 6.28318 * lanes);
    float h = hash(vec2(id, fi));
    float z = fract(h * 7.0 + uTime * (0.25 + h * 0.6) + fi * 0.3);
    float streak = smoothstep(0.08, 0.0, abs(r - z * 1.4)) * smoothstep(0.0, 0.4, z);
    float laneMask = smoothstep(0.5, 0.0, abs(fract(a / 6.28318 * lanes) - 0.5) - 0.3);
    col += mix(vec3(0.55, 0.95, 1.0), vec3(0.8, 0.6, 1.0), h) * streak * laneMask * (0.5 + h);
  }
  col += vec3(0.4, 0.8, 1.0) * 0.02 / (r + 0.02);
  gl_FragColor = vec4(col, 1.0);
}`,

  'aurora-veil': `
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 col = mix(vec3(0.01, 0.02, 0.06), vec3(0.03, 0.08, 0.16), uv.y);
  float s = hash(floor(gl_FragCoord.xy / 1.5));
  col += step(0.998, s) * 0.8 * uv.y;
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    float x = uv.x * (1.5 + fi * 0.4) + uTime * 0.03 * (1.0 + fi) + (uMouse.x - 0.5) * 0.2;
    float curtain = 0.55 + fi * 0.08 + 0.12 * fbm(vec2(x * 2.0, fi + uTime * 0.05));
    float d = uv.y - curtain;
    float rays = fbm(vec2(x * 12.0, uTime * 0.2 + fi)) ;
    float glow = exp(-abs(d) * 9.0) * smoothstep(-0.25, 0.05, d) * rays * 1.6;
    col += mix(vec3(0.1, 0.95, 0.6), vec3(0.6, 0.3, 1.0), fi * 0.4 + d * 2.0) * glow * 0.7;
  }
  float ridge = 0.18 + 0.08 * fbm(vec2(uv.x * 3.0, 1.0)) + 0.04 * sin(uv.x * 9.0);
  col = mix(col, vec3(0.005, 0.01, 0.02), smoothstep(ridge + 0.004, ridge, uv.y));
  gl_FragColor = vec4(col, 1.0);
}`,

  'lava-lamp': `
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float f = 0.0;
  for (int i = 0; i < 9; i++){
    float fi = float(i);
    vec2 c = vec2(sin(uTime * 0.21 * (1.0 + fi * 0.13) + fi * 1.7) * 0.7, cos(uTime * 0.17 * (1.0 + fi * 0.11) + fi * 2.3) * 0.42);
    f += (0.018 + 0.006 * sin(fi)) / dot(uv - c, uv - c);
  }
  vec2 m = (uMouse - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  f += 0.025 / dot(uv - m, uv - m);
  float blob = smoothstep(0.95, 1.05, f);
  float edge = smoothstep(0.7, 1.0, f) - blob;
  vec3 bg = mix(vec3(0.08, 0.02, 0.12), vec3(0.18, 0.04, 0.2), gl_FragCoord.y / uRes.y);
  vec3 lava = palette(f * 0.08 + uTime * 0.02, vec3(0.8, 0.4, 0.3), vec3(0.2, 0.3, 0.3), vec3(1.0), vec3(0.0, 0.15, 0.2));
  vec3 col = mix(bg, lava, blob) + edge * vec3(1.0, 0.5, 0.4) * 0.6;
  gl_FragColor = vec4(col, 1.0);
}`
}

export const isShaderGenerator = (id?: string): boolean => !!id && id in SHADERS

const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }'

export interface ShaderRenderer {
  canvas: HTMLCanvasElement
  setGenerator: (id: string) => boolean
  render: (time: number, mouseX: number, mouseY: number) => void
  resize: (width: number, height: number) => void
  dispose: () => void
}

/** Minimal WebGL1 full-screen-triangle renderer. Returns null if WebGL is unavailable. */
export function createShaderRenderer(target?: HTMLCanvasElement): ShaderRenderer | null {
  const ownsCanvas = !target
  const canvas = target ?? document.createElement('canvas')
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'low-power' })
  if (!gl) return null
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)

  const programs = new Map<string, { prog: WebGLProgram; uRes: WebGLUniformLocation | null; uTime: WebGLUniformLocation | null; uMouse: WebGLUniformLocation | null }>()
  let current: ReturnType<typeof programs.get> | undefined

  const compile = (type: number, src: string): WebGLShader | null => {
    const sh = gl.createShader(type)
    if (!sh) return null
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('[Shader] compile failed:', gl.getShaderInfoLog(sh))
      gl.deleteShader(sh)
      return null
    }
    return sh
  }

  const build = (id: string) => {
    if (programs.has(id)) return programs.get(id)
    const body = SHADERS[id]
    if (!body) return undefined
    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, HEADER + body)
    if (!vs || !fs) return undefined
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.bindAttribLocation(prog, 0, 'p')
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[Shader] link failed:', gl.getProgramInfoLog(prog))
      return undefined
    }
    const entry = { prog, uRes: gl.getUniformLocation(prog, 'uRes'), uTime: gl.getUniformLocation(prog, 'uTime'), uMouse: gl.getUniformLocation(prog, 'uMouse') }
    programs.set(id, entry)
    return entry
  }

  return {
    canvas,
    setGenerator(id) {
      current = build(id)
      return !!current
    },
    render(time, mouseX, mouseY) {
      if (!current) return
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.useProgram(current.prog)
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
      gl.uniform2f(current.uRes, canvas.width, canvas.height)
      gl.uniform1f(current.uTime, time)
      gl.uniform2f(current.uMouse, mouseX, mouseY)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    resize(width, height) {
      canvas.width = Math.max(1, Math.round(width))
      canvas.height = Math.max(1, Math.round(height))
    },
    dispose() {
      programs.forEach(({ prog }) => gl.deleteProgram(prog))
      programs.clear()
      gl.deleteBuffer(buf)
      // Only drop contexts we created: a caller's canvas may be reused (e.g. a React
      // effect re-running), and getContext() would hand back the lost context.
      if (ownsCanvas) gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }
}

// ---------- Gallery thumbnails: one shared context, cached stills ----------
let thumbRenderer: ShaderRenderer | null | undefined
const stillCache = new Map<string, string>()

export function getThumbRenderer(): ShaderRenderer | null {
  if (thumbRenderer === undefined) {
    thumbRenderer = createShaderRenderer()
    thumbRenderer?.resize(480, 270)
  }
  return thumbRenderer
}

/** Returns a cached data URL still frame for a generator (rendered once). */
export function getShaderStill(id: string): string | null {
  if (stillCache.has(id)) return stillCache.get(id)!
  const r = getThumbRenderer()
  if (!r || !r.setGenerator(id)) return null
  r.resize(480, 270)
  r.render(14.0, 0.5, 0.5)
  const url = r.canvas.toDataURL('image/jpeg', 0.85)
  stillCache.set(id, url)
  return url
}
