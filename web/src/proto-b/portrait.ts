// Portretni jonlantirish. Ustuvorlik: video sikl (idle/talk/think) > og'iz rasmlari (mouth-0/1/2 + blink) > prosedural shader.
import {
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
} from 'three'
import { roleAssets, type Role, type RoleAssets } from './assets'
import { easeInOut, frameRect } from './framing'

export type Mode = 'listen' | 'think' | 'talk'

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uBase;
uniform sampler2D uM0;
uniform sampler2D uM1;
uniform sampler2D uM2;
uniform sampler2D uBlinkTex;
uniform float uHasMouth;
uniform float uHasBlink;
uniform vec3 uMouthW;
uniform vec2 uVarOff;
uniform vec4 uRect;
uniform float uJaw;
uniform float uBlink;
uniform float uBreath;
uniform vec4 uEyeL;
uniform vec4 uEyeR;
uniform vec4 uMouth;   // x, seam, half width, chin
uniform vec2 uJawP;    // jaw half width, seam curve
uniform float uPx;     // bitta ekran pikseli (rasm balandligi birligida)
uniform float uDebug;

// Prosedural miltillash: yuqori qovoq terisini pastga "cho'zadi", chetida kiprik soyasi
vec2 blinkEye(vec2 p, vec4 e, float b) {
  float u = (p.x - e.x) / e.z;
  if (abs(u) >= 1.0 || b <= 0.001) return vec2(p.y, 1.0);
  float h = e.w * sqrt(1.0 - u * u);
  float top = e.y - h;
  float L = b * 2.0 * h;
  float s = e.w * 1.7;
  float A = top - s;
  if (p.y > A && p.y < top + L) {
    float src = A + (p.y - A) * s / (s + L);
    float edge = (top + L) - p.y;
    float shade = 1.0 - 0.28 * b * exp(-pow(edge / (0.22 * e.w), 2.0));
    return vec2(src, shade);
  }
  return vec2(p.y, 1.0);
}

void main() {
  vec2 p = uRect.xy + vec2(vUv.x, 1.0 - vUv.y) * uRect.zw; // rasm koordinatasi, y pastga
  vec2 q = p;

  // nafas: gavda va bosh juda yengil ko'tariladi/tushadi (pastdagi stol joyida qoladi)
  float g = exp(-pow((p.x - uMouth.x) / 0.32, 2.0)) * (1.0 - smoothstep(0.5, 0.95, p.y));
  float bo = uBreath * 0.0022 * g;

  float shade = 1.0;
  float interior = 0.0;
  float gapT = 0.0;
  float gapH = 0.0;

  // --- prosedural og'iz (variant rasmlari bo'lmasa) ---
  if (uHasMouth < 0.5 && uJaw > 0.001) {
    float jawD = uJaw * 0.0075;
    float mx = uMouth.x;
    float mw = uMouth.z;
    float chin = uMouth.w;
    float u = (p.x - mx) / mw;
    float seam = uMouth.y + uJawP.y * u * u;
    float gx = exp(-pow((p.x - mx) / uJawP.x, 2.0) * 1.6);
    float D = jawD * gx;
    float uo = u / 0.88;
    float open = abs(uo) < 1.0 ? pow(1.0 - uo * uo, 1.1) : 0.0;
    float G = min(jawD * open, D);
    float R1 = 0.018;
    float y = p.y;
    if (y >= seam - R1 && D > 1e-5) {
      if (y < seam + D - G) {
        q.y = seam - R1 + (y - (seam - R1)) * R1 / (R1 + D - G);
      } else if (y < seam + D) {
        q.y = seam;
        gapT = (y - (seam + D - G)) / max(G, 1e-5);
        gapH = G;
        float a1 = smoothstep(0.0, uPx * 1.6, y - (seam + D - G));
        float a2 = smoothstep(0.0, uPx * 1.6, (seam + D) - y);
        interior = a1 * a2;
      } else {
        float fade = 1.0 - smoothstep(chin, chin + 0.05, y);
        q.y = y - D * fade;
        // pastki lab ustida yupqa soya
        float lipSh = exp(-pow((y - (seam + D)) / 0.004, 2.0)) * open;
        shade *= 1.0 - 0.25 * lipSh * uJaw;
      }
    }
  }

  // --- prosedural miltillash (blink rasmi bo'lmasa) ---
  if (uHasBlink < 0.5 && uBlink > 0.001) {
    vec2 bl = blinkEye(p, uEyeL, uBlink);
    vec2 br = blinkEye(p, uEyeR, uBlink);
    if (bl.x != p.y) { q.y = bl.x; shade *= bl.y; }
    else if (br.x != p.y) { q.y = br.x; shade *= br.y; }
  }
  q.y += bo;

  vec3 col = texture2D(uBase, q).rgb;

  // --- og'iz variantlari (mouth-0/1/2): faqat og'iz-iyak sohasida yumshoq niqob bilan ---
  // Variant rasmlari portret bilan piksel-mos va faqat lokal yamoq (tekshirildi), shuning uchun niqobsiz
  // "farq" qo'shamiz: col = base + sum(w_i * (m_i - base)) + blink * (blink - base). Choklar chiqmaydi.
  if (uHasMouth > 0.5) {
    vec2 qv = q + uVarOff;
    vec3 v = texture2D(uM0, qv).rgb * uMouthW.x + texture2D(uM1, qv).rgb * uMouthW.y + texture2D(uM2, qv).rgb * uMouthW.z;
    col += v - texture2D(uBase, qv).rgb;
  }
  if (uHasBlink > 0.5 && uBlink > 0.001) {
    vec2 qb = q + uVarOff;
    col += (texture2D(uBlinkTex, qb).rgb - texture2D(uBase, qb).rgb) * uBlink;
  }

  if (interior > 0.0) {
    // lab chetidagi rangni gorizontal xiralab olamiz (chiziqli "tish" izlari chiqmasin)
    vec3 up = vec3(0.0);
    vec3 lo = vec3(0.0);
    for (int i = -3; i <= 3; i++) {
      float ox = float(i) * 0.004;
      up += texture2D(uBase, vec2(p.x + ox, uMouth.y - 0.0022 + bo)).rgb;
      lo += texture2D(uBase, vec2(p.x + ox, uMouth.y + 0.0022 + bo)).rgb;
    }
    up /= 7.0;
    lo /= 7.0;
    vec3 edgeCol = mix(up, lo, step(0.5, gapT)) * 0.5;
    float lum = dot(up + lo, vec3(0.1495, 0.2935, 0.057));
    vec3 deep = vec3(0.30, 0.13, 0.11) * clamp(lum, 0.2, 0.8);
    float e = min(gapT, 1.0 - gapT) * gapH;
    float k = smoothstep(0.0, max(uPx * 3.0, gapH * 0.4), e);
    vec3 inside = mix(edgeCol, deep, k);
    // yuqori tishlar — og'iz yetarli ochilganda, yumshoq va xira
    float uu = (p.x - uMouth.x) / uMouth.z;
    float teethA = (1.0 - smoothstep(0.12, 0.38, gapT)) * smoothstep(uPx * 4.0, uPx * 9.0, gapH);
    teethA *= 1.0 - smoothstep(0.3, 0.65, abs(uu));
    vec3 teeth = vec3(0.80, 0.76, 0.70) * clamp(lum * 1.35, 0.3, 0.8);
    inside = mix(inside, teeth, teethA * 0.4);
    col = mix(col, inside, interior);
  }

  col *= shade;

  if (uDebug > 0.5) {
    float w = uPx * 1.5;
    float el = abs(length((p - uEyeL.xy) / uEyeL.zw) - 1.0) * min(uEyeL.z, uEyeL.w);
    float er = abs(length((p - uEyeR.xy) / uEyeR.zw) - 1.0) * min(uEyeR.z, uEyeR.w);
    if (min(el, er) < w) col = vec3(0.0, 1.0, 0.2);
    bool inMouthX = abs(p.x - uMouth.x) < uMouth.z;
    if (inMouthX && abs(p.y - uMouth.y) < w) col = vec3(1.0, 0.1, 0.1);
    if (abs(p.x - uMouth.x) < uJawP.x && abs(p.y - uMouth.w) < w) col = vec3(0.1, 0.4, 1.0);
  }
  gl_FragColor = vec4(col, 1.0);
}
`

type LoadedRole = {
  assets: RoleAssets
  base: Texture
  mouth: [Texture, Texture, Texture] | null
  blink: Texture | null
  aspect: number
}

type VideoKind = 'idle' | 'talk' | 'think'

export type DebugOpts = { debug: boolean; jaw: number | null; blink: number | null }

export class PortraitStage {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private mat: ShaderMaterial
  private loader = new TextureLoader()
  private roles = new Map<Role, Promise<LoadedRole>>()
  private current: LoadedRole | null = null
  private role: Role | null = null
  private mode: Mode = 'listen'
  private shotStart = 0
  private thinkStart = 0
  private raf = 0
  private running = false
  private blinkAt = 0
  private blinkStart = -1
  private doubleBlink = false
  private mouthW = new Vector3(1, 0, 0)
  private mouthIdx = 0
  private videos: Record<VideoKind, HTMLVideoElement>
  private activeVideo: VideoKind | null = null
  private thinkEnded = true
  private ro: ResizeObserver
  private container: HTMLElement
  private canvas: HTMLCanvasElement
  amplitude: () => number = () => 0
  debug: DebugOpts

  constructor(container: HTMLElement, debug: DebugOpts) {
    this.container = container
    const canvas = document.createElement('canvas')
    canvas.className = 'pb-portrait-canvas'
    container.appendChild(canvas)
    this.canvas = canvas
    this.debug = debug
    this.renderer = new WebGLRenderer({ canvas, antialias: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    const blank = new Texture()
    this.mat = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uBase: { value: blank },
        uM0: { value: blank },
        uM1: { value: blank },
        uM2: { value: blank },
        uBlinkTex: { value: blank },
        uHasMouth: { value: 0 },
        uHasBlink: { value: 0 },
        uMouthW: { value: this.mouthW },
        uVarOff: { value: new Vector2() },
        uRect: { value: new Vector4(0, 0, 1, 1) },
        uJaw: { value: 0 },
        uBlink: { value: 0 },
        uBreath: { value: 0 },
        uEyeL: { value: new Vector4() },
        uEyeR: { value: new Vector4() },
        uMouth: { value: new Vector4() },
        uJawP: { value: new Vector2() },
        uPx: { value: 0.001 },
        uDebug: { value: debug.debug ? 1 : 0 },
      },
    })
    this.scene.add(new Mesh(new PlaneGeometry(2, 2), this.mat))
    this.videos = {
      idle: this.makeVideo(true),
      talk: this.makeVideo(true),
      think: this.makeVideo(false),
    }
    // o'ylash videosi tugaganda: hali gapirayotgan bo'lsa — gapirish sikli, aks holda tinglash
    this.videos.think.addEventListener('ended', () => {
      this.thinkEnded = true
      if (this.activeVideo === 'think') this.applyMode()
    })
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    this.resize()
    this.scheduleBlink(performance.now())
  }

  private makeVideo(loop: boolean) {
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.loop = loop
    v.preload = 'auto'
    v.setAttribute('playsinline', '')
    v.setAttribute('muted', '')
    v.className = 'pb-portrait-video'
    v.style.opacity = '0'
    this.container.appendChild(v)
    return v
  }

  private loadTex(url: string) {
    return this.loader.loadAsync(url).then((t) => {
      t.flipY = false // shaderda y pastga qarab o'lchanadi
      t.minFilter = LinearMipmapLinearFilter
      t.magFilter = LinearFilter
      t.generateMipmaps = true
      t.anisotropy = 4
      return t
    })
  }

  preload(role: Role): Promise<LoadedRole> {
    let p = this.roles.get(role)
    if (!p) {
      const a = roleAssets(role)
      p = Promise.all([
        this.loadTex(a.portrait),
        a.mouth ? Promise.all(a.mouth.map((u) => this.loadTex(u))) : Promise.resolve(null),
        a.blink ? this.loadTex(a.blink).catch(() => null) : Promise.resolve(null),
      ]).then(([base, mouth, blink]) => {
        const img = base.image as { width: number; height: number }
        return {
          assets: a,
          base,
          mouth: mouth as [Texture, Texture, Texture] | null,
          blink,
          aspect: img.width / img.height,
        }
      })
      this.roles.set(role, p)
    }
    return p
  }

  /** Yangi kadr: shu rolga tez kesim (Ken Burns qaytadan boshlanadi) */
  async show(role: Role, mode: Mode = 'listen') {
    const r = await this.preload(role)
    this.current = r
    this.role = role
    this.shotStart = performance.now()
    const u = this.mat.uniforms
    u.uBase.value = r.base
    u.uHasMouth.value = r.mouth ? 1 : 0
    if (r.mouth) {
      u.uM0.value = r.mouth[0]
      u.uM1.value = r.mouth[1]
      u.uM2.value = r.mouth[2]
    }
    u.uHasBlink.value = r.blink ? 1 : 0
    if (r.blink) u.uBlinkTex.value = r.blink
    const rig = r.assets.rig
    u.uEyeL.value.set(...rig.eyes[0])
    u.uEyeR.value.set(...rig.eyes[1])
    u.uMouth.value.set(rig.mouth.x, rig.mouth.seam, rig.mouth.w, rig.mouth.chin)
    u.uJawP.value.set(rig.mouth.jawW, rig.mouth.curve ?? 0)
    u.uVarOff.value.set(rig.variantOffset?.[0] ?? 0, rig.variantOffset?.[1] ?? 0)
    // videolar (bo'lsa)
    this.setVideoSrc('idle', r.assets.idleVideo)
    this.setVideoSrc('talk', r.assets.talkVideo)
    this.setVideoSrc('think', r.assets.thinkVideo)
    for (const v of Object.values(this.videos)) {
      v.style.opacity = '0'
      v.pause()
    }
    if (this.videos.idle.readyState >= 1) this.videos.idle.currentTime = 0
    this.activeVideo = null
    this.thinkEnded = true
    this.setMode(mode)
    this.start()
  }

  private setVideoSrc(kind: VideoKind, url: string | null) {
    const v = this.videos[kind]
    const cur = v.getAttribute('data-src')
    if ((url ?? '') === (cur ?? '')) return
    if (url) {
      v.src = url
      v.setAttribute('data-src', url)
      v.load()
    } else {
      v.removeAttribute('src')
      v.removeAttribute('data-src')
      v.load()
    }
  }

  get hasThinkVideo() {
    return !!this.current?.assets.thinkVideo
  }

  /** Rejim: tinglash / o'ylash / gapirish. Qaytaradi: think video davomiyligi (s) yoki 0 */
  setMode(mode: Mode): number {
    this.mode = mode
    const a = this.current?.assets
    if (!a) return 0
    if (mode === 'think') {
      this.thinkStart = performance.now()
      if (a.thinkVideo) this.thinkEnded = false
    }
    this.applyMode()
    if (mode === 'think' && this.activeVideo === 'think') {
      const d = this.videos.think.duration
      return isFinite(d) && d > 0 ? d : 5
    }
    return 0
  }

  private applyMode() {
    const a = this.current?.assets
    if (!a) return
    const mode = this.mode
    let want: VideoKind | null = null
    // think video o'z ichida gapira boshlaydi: "talk" kelganda u oxirigacha o'ynab bo'ladi
    if (this.activeVideo === 'think' && !this.thinkEnded && mode === 'talk') want = 'think'
    else if (mode === 'think' && a.thinkVideo) want = 'think'
    else if (mode === 'talk' && a.talkVideo) want = 'talk'
    else if (mode !== 'talk' && a.idleVideo) want = 'idle'
    this.switchVideo(want)
  }

  private switchVideo(want: VideoKind | null) {
    if (want === this.activeVideo) return
    const prev = this.activeVideo
    this.activeVideo = want
    // canvas doim ostida turadi: video hali yuklanmagan bo'lsa, portret (shader) ko'rinadi
    if (want) {
      const v = this.videos[want]
      if (want !== 'idle') v.currentTime = 0
      const reveal = () => {
        if (this.activeVideo === want) v.style.opacity = '1'
      }
      if (v.readyState >= 2) reveal()
      else v.addEventListener('loadeddata', reveal, { once: true })
      void v.play().catch(() => {
        if (this.activeVideo === want) {
          v.style.opacity = '0'
          this.activeVideo = null
        }
      })
    }
    if (prev) {
      const pv = this.videos[prev]
      const hide = () => {
        if (this.activeVideo === prev) return
        pv.style.opacity = '0'
        window.setTimeout(() => {
          if (this.activeVideo !== prev) pv.pause()
        }, 260)
      }
      // yangi video ustidan yopilishi uchun eskisini biroz kechiktirib o'chiramiz
      if (want) window.setTimeout(hide, 180)
      else hide()
    }
  }

  private scheduleBlink(now: number) {
    this.blinkAt = now + 2200 + Math.random() * 3800
  }

  private resize() {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h, false)
  }

  start() {
    if (this.running) return
    this.running = true
    const loop = () => {
      if (!this.running) return
      this.frame()
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
    for (const v of Object.values(this.videos)) v.pause()
    this.activeVideo = null
  }

  private frame() {
    const r = this.current
    if (!r) return
    const now = performance.now()
    const cw = this.container.clientWidth || 1
    const ch = this.container.clientHeight || 1
    // Ken Burns: 10 s davomida 1.0 → 1.06; o'ylaganda yana biroz yaqinlashadi
    let zoom = 1 + 0.06 * easeInOut((now - this.shotStart) / 10000)
    if (this.mode === 'think') zoom += 0.035 * easeInOut((now - this.thinkStart) / 900)
    const rect = frameRect(cw, ch, r.aspect, r.assets.rig.focus, zoom)
    const u = this.mat.uniforms
    u.uRect.value.set(rect.x, rect.y, rect.w, rect.h)
    u.uPx.value = rect.h / ch

    // nafas ~4.2 s sikl
    const t = now / 1000
    u.uBreath.value = Math.sin((t * Math.PI * 2) / 4.2) * 0.8 + Math.sin(t * 0.37) * 0.2

    // miltillash
    let b = 0
    if (this.blinkStart < 0 && now >= this.blinkAt) {
      this.blinkStart = now
    }
    if (this.blinkStart >= 0) {
      const e = now - this.blinkStart
      const D = 170
      if (e < D) b = e < 65 ? e / 65 : e < 90 ? 1 : 1 - (e - 90) / 80
      else {
        this.blinkStart = -1
        if (!this.doubleBlink && Math.random() < 0.18) {
          this.doubleBlink = true
          this.blinkAt = now + 120
        } else {
          this.doubleBlink = false
          this.scheduleBlink(now)
        }
      }
    }
    if (this.debug.blink != null) b = this.debug.blink
    u.uBlink.value = Math.max(0, Math.min(1, b))

    // og'iz
    let amp = this.mode === 'talk' ? this.amplitude() : 0
    if (this.debug.jaw != null) amp = this.debug.jaw
    const jaw = Math.pow(amp, 0.85)
    u.uJaw.value = jaw
    if (r.mouth) {
      // histerezis bilan 0/1/2 holat, ~60 ms yumshoq almashinuv
      const idx = this.mouthIdx
      let next = idx
      if (jaw > (idx >= 2 ? 0.45 : 0.55)) next = 2
      else if (jaw > (idx >= 1 ? 0.14 : 0.2)) next = 1
      else next = 0
      this.mouthIdx = next
      const tgt = [next === 0 ? 1 : 0, next === 1 ? 1 : 0, next === 2 ? 1 : 0]
      const k = 0.45
      this.mouthW.set(
        this.mouthW.x + (tgt[0] - this.mouthW.x) * k,
        this.mouthW.y + (tgt[1] - this.mouthW.y) * k,
        this.mouthW.z + (tgt[2] - this.mouthW.z) * k,
      )
    }

    // video kadrlash (bo'lsa)
    if (this.activeVideo) {
      const v = this.videos[this.activeVideo]
      if (v.videoWidth > 0) {
        const vr = frameRect(cw, ch, v.videoWidth / v.videoHeight, r.assets.rig.focus, zoom)
        const W = cw / vr.w
        const H = ch / vr.h
        v.style.width = `${W}px`
        v.style.height = `${H}px`
        v.style.transform = `translate(${-vr.x * W}px, ${-vr.y * H}px)`
      }
    }

    this.renderer.render(this.scene, this.camera)
  }

  get currentRole() {
    return this.role
  }

  dispose() {
    this.stop()
    this.ro.disconnect()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.canvas.remove()
    for (const v of Object.values(this.videos)) v.remove()
  }
}
