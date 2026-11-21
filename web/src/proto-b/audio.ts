// TTS audio + amplituda (Web Audio AnalyserNode). Audio bo'lmasa yoki brauzer to'sib qo'ysa —
// matn uzunligidan sintetik "bo'g'in" konverti (og'iz baribir harakatlanadi, subtitr ishlaydi).

export type SpeakHandle = { done: Promise<void>; duration: number }

export class Speech {
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private buf: Float32Array<ArrayBuffer> | null = null
  private el: HTMLAudioElement | null = null
  private synthUntil = 0
  private synthStart = 0
  private level = 0
  private cancelFn: (() => void) | null = null
  /** 0..1 — hozir gapirilayotgan qism (subtitr uchun) */
  progress = 0
  speaking = false
  usedSynth = false

  /** Foydalanuvchi bosganda chaqiriladi (autoplay qoidasi) */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new AC()
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 1024
      this.analyser.smoothingTimeConstant = 0.2
      this.analyser.connect(this.ctx.destination)
      this.buf = new Float32Array(this.analyser.fftSize)
      this.el = new Audio()
      this.el.preload = 'auto'
      this.el.crossOrigin = 'anonymous'
      this.ctx.createMediaElementSource(this.el).connect(this.analyser)
    } catch {
      this.ctx = null
      this.analyser = null
    }
  }

  stop() {
    this.cancelFn?.()
  }

  speak(url: string | null, text: string): SpeakHandle {
    this.stop()
    const est = Math.max(1.2, text.length * 0.072)
    const el = this.el
    let resolveDone!: () => void
    const done = new Promise<void>((r) => (resolveDone = r))
    let finished = false
    let raf = 0
    const finish = () => {
      if (finished) return
      finished = true
      cancelAnimationFrame(raf)
      this.speaking = false
      this.progress = 1
      this.synthUntil = 0
      this.cancelFn = null
      if (el) {
        el.onended = null
        el.onerror = null
        el.pause()
      }
      resolveDone()
    }
    this.cancelFn = finish
    this.speaking = true
    this.progress = 0

    const startSynth = () => {
      this.usedSynth = true
      this.synthStart = performance.now()
      this.synthUntil = this.synthStart + est * 1000
      const tick = () => {
        if (finished) return
        const now = performance.now()
        this.progress = Math.min(1, (now - this.synthStart) / (est * 1000))
        if (now >= this.synthUntil) finish()
        else raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }

    if (url && el && this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      el.src = url
      el.currentTime = 0
      el.onended = finish
      el.onerror = () => {
        if (!finished) startSynth()
      }
      const tick = () => {
        if (finished) return
        if (el.duration > 0 && isFinite(el.duration)) this.progress = Math.min(1, el.currentTime / el.duration)
        raf = requestAnimationFrame(tick)
      }
      el.play().then(
        () => (raf = requestAnimationFrame(tick)),
        () => {
          if (!finished) startSynth()
        },
      )
      // xavfsizlik: audio osilib qolsa ham sahna to'xtamasin
      window.setTimeout(() => finish(), (est + 6) * 1000)
    } else {
      startSynth()
    }
    return { done, duration: est }
  }

  /** 0..1 — og'iz ochilishi uchun silliqlangan amplituda; har kadrda chaqiriladi */
  amplitude(): number {
    let target = 0
    const now = performance.now()
    if (this.synthUntil > now) {
      // ~5 Hz bo'g'in ritmi + tasodifiy urg'u
      const t = (now - this.synthStart) / 1000
      const syl = Math.max(0, Math.sin(t * Math.PI * 2 * 4.6) * 0.5 + Math.sin(t * 7.3 + 1.7) * 0.35 + 0.25)
      const pause = Math.sin(t * 1.1) > 0.85 ? 0.2 : 1
      target = Math.min(1, syl * pause)
    } else if (this.speaking && this.analyser && this.buf && this.el && !this.el.paused) {
      this.analyser.getFloatTimeDomainData(this.buf)
      let sum = 0
      for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i]
      const rms = Math.sqrt(sum / this.buf.length)
      target = Math.min(1, Math.max(0, (rms - 0.012) * 7.5))
    }
    // tez ochiladi, sekinroq yopiladi
    const k = target > this.level ? 0.55 : 0.22
    this.level += (target - this.level) * k
    return this.level
  }
}
