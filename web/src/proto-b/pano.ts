// Bo'sh zal 360°: ichki sfera, sekin avtomatik aylanish, barmoq/sichqoncha bilan qarash, giroskop (ruxsat bilan).
import {
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three'

const DEG = Math.PI / 180

export class Panorama {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(75, 1, 1, 1100)
  private mat = new MeshBasicMaterial({ color: 0xffffff })
  private raf = 0
  private running = false
  private lon = 180 // gerb va raislik stoli panorama markazida (u = 0.5)
  private lat = -4
  private dragging = false
  private lastX = 0
  private lastY = 0
  private lastInteract = 0
  private gyro: { a0: number; b0: number; lon0: number; lat0: number } | null = null
  private gyroOn = false
  private target = new Vector3()
  private last = performance.now()
  private ro: ResizeObserver
  onFirstFrame: (() => void) | null = null
  private canvas: HTMLCanvasElement

  constructor(container: HTMLElement) {
    // har safar yangi canvas (StrictMode qayta o'rnatganda WebGL konteksti aralashmasin)
    const canvas = document.createElement('canvas')
    canvas.className = 'pb-fill'
    container.appendChild(canvas)
    this.canvas = canvas
    this.renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = SRGBColorSpace
    const geo = new SphereGeometry(500, 64, 40)
    geo.scale(-1, 1, 1)
    this.scene.add(new Mesh(geo, this.mat))
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    this.resize()
    canvas.addEventListener('pointerdown', this.onDown)
    window.addEventListener('pointermove', this.onMove)
    window.addEventListener('pointerup', this.onUp)
    window.addEventListener('pointercancel', this.onUp)
  }

  get maxTexture() {
    return this.renderer.capabilities.maxTextureSize
  }

  /** Avval kichik (tez), keyin katta tekstura. Xato bo'lsa reject. */
  load(small: string, large: string): Promise<void> {
    const loader = new TextureLoader()
    const apply = (t: Texture) => {
      t.colorSpace = SRGBColorSpace
      t.minFilter = LinearFilter
      t.generateMipmaps = false
      const old = this.mat.map
      this.mat.map = t
      this.mat.needsUpdate = true
      old?.dispose()
    }
    return loader.loadAsync(small).then((t) => {
      apply(t)
      if (this.maxTexture >= 4096) {
        loader.loadAsync(large).then(apply, () => {
          /* kichigi qoladi */
        })
      }
    })
  }

  private resize() {
    const w = this.canvas.clientWidth || 1
    const h = this.canvas.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    // telefonda (tik ekran) gorizontal ko'rinish juda tor bo'lmasin
    this.camera.fov = w < h ? 100 : 78
    this.camera.updateProjectionMatrix()
  }

  private onDown = (e: PointerEvent) => {
    this.dragging = true
    this.lastX = e.clientX
    this.lastY = e.clientY
    this.lastInteract = performance.now()
  }
  private onMove = (e: PointerEvent) => {
    if (!this.dragging) return
    const k = 0.18
    this.lon -= (e.clientX - this.lastX) * k
    this.lat += (e.clientY - this.lastY) * k
    this.lastX = e.clientX
    this.lastY = e.clientY
    this.lastInteract = performance.now()
    if (this.gyro) this.gyro = null // keyingi hodisada qayta bazalanadi
  }
  private onUp = () => {
    this.dragging = false
  }

  get interacting() {
    return this.dragging || performance.now() - this.lastInteract < 1200
  }

  /** iOS 13+ ruxsat so'raydi — faqat tugma bosilganda chaqiring */
  async enableGyro(): Promise<boolean> {
    const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined
    if (!DOE) return false
    try {
      if (typeof DOE.requestPermission === 'function') {
        const r = await DOE.requestPermission()
        if (r !== 'granted') return false
      }
    } catch {
      return false
    }
    this.gyroOn = true
    window.addEventListener('deviceorientation', this.onOrient)
    return true
  }

  private onOrient = (e: DeviceOrientationEvent) => {
    if (!this.gyroOn || e.alpha == null || e.beta == null) return
    if (!this.gyro) {
      this.gyro = { a0: e.alpha, b0: e.beta, lon0: this.lon, lat0: this.lat }
      return
    }
    let da = e.alpha - this.gyro.a0
    if (da > 180) da -= 360
    if (da < -180) da += 360
    this.lon = this.gyro.lon0 - da
    this.lat = this.gyro.lat0 + (e.beta - this.gyro.b0)
    this.lastInteract = performance.now()
  }

  start() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    let first = true
    const loop = () => {
      if (!this.running) return
      const now = performance.now()
      const dt = Math.min(0.05, (now - this.last) / 1000)
      this.last = now
      if (!this.interacting && !this.gyroOn) this.lon += dt * 3.2 // sekin aylanish, ~3°/s
      this.lat = Math.max(-38, Math.min(38, this.lat))
      const phi = this.lon * DEG
      const theta = this.lat * DEG
      this.target.set(Math.cos(phi) * Math.cos(theta), Math.sin(theta), Math.sin(phi) * Math.cos(theta))
      this.camera.lookAt(this.target)
      this.renderer.render(this.scene, this.camera)
      if (first && this.mat.map) {
        first = false
        this.onFirstFrame?.()
      }
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  dispose() {
    this.stop()
    this.ro.disconnect()
    this.canvas.removeEventListener('pointerdown', this.onDown)
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerup', this.onUp)
    window.removeEventListener('pointercancel', this.onUp)
    window.removeEventListener('deviceorientation', this.onOrient)
    this.mat.map?.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.canvas.remove()
  }
}
