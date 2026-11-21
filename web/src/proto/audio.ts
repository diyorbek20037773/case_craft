// Ovoz: oldindan yaratilgan edge-tts mp3 (uz-UZ) + Web Audio AnalyserNode.
// Analizator amplituda va 3 ta chastota bo'linmasini beradi — lab harakati shundan (tilga bog'liq emas).
// Audio ishlamasa (dekod xatosi, AudioContext yo'q) — so'z vaqtlari bo'yicha amplituda simulyatsiyasi.
import type { MouthLevels } from './director'
import savolUrl from './assets/savol.mp3?url'
import javobUrl from './assets/javob.mp3?url'
import { TIMINGS } from './assets/timings'

export type ClipId = 'savol' | 'javob'

export interface WordTiming {
  t: number
  d: number
  w: string
}

export const WORDS: Record<ClipId, readonly WordTiming[]> = TIMINGS

const URLS: Record<ClipId, string> = { savol: savolUrl, javob: javobUrl }

export interface Playback {
  /** Klip boshidan o'tgan vaqt (s) */
  time: () => number
  /** Og'iz uchun darajalar (faqat analyse=true bo'lsa ma'noli) */
  levels: () => MouthLevels
  ended: Promise<void>
  /** true — haqiqiy ovoz, false — ovozsiz simulyatsiya */
  real: boolean
  stop: () => void
}

type Ctor = typeof AudioContext

export class AudioEngine {
  private ctx: AudioContext | null = null
  private raw = new Map<ClipId, Promise<ArrayBuffer | null>>()
  private buffers = new Map<ClipId, AudioBuffer | null>()
  private current: Playback | null = null

  constructor() {
    for (const id of Object.keys(URLS) as ClipId[]) {
      this.raw.set(
        id,
        fetch(URLS[id])
          .then((r) => (r.ok ? r.arrayBuffer() : null))
          .catch(() => null),
      )
    }
  }

  /** Foydalanuvchi bosganda chaqiriladi (iOS/Chrome autoplay qoidasi) */
  unlock() {
    if (!this.ctx) {
      const AC: Ctor | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext
      if (AC) this.ctx = new AC()
    }
    void this.ctx?.resume().catch(() => {})
  }

  private async buffer(id: ClipId): Promise<AudioBuffer | null> {
    if (this.buffers.has(id)) return this.buffers.get(id) ?? null
    const ctx = this.ctx
    const data = await this.raw.get(id)
    let buf: AudioBuffer | null = null
    if (ctx && data) {
      try {
        buf = await ctx.decodeAudioData(data.slice(0))
      } catch {
        buf = null
      }
    }
    this.buffers.set(id, buf)
    return buf
  }

  stop() {
    this.current?.stop()
    this.current = null
  }

  async play(id: ClipId): Promise<Playback> {
    this.stop()
    const buf = await this.buffer(id)
    const ctx = this.ctx
    const pb = ctx && buf && ctx.state !== 'closed' ? this.playReal(ctx, buf) : simulate(WORDS[id])
    this.current = pb
    return pb
  }

  private playReal(ctx: AudioContext, buf: AudioBuffer): Playback {
    const src = ctx.createBufferSource()
    src.buffer = buf
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.35
    src.connect(analyser)
    analyser.connect(ctx.destination)
    const freq = new Uint8Array(analyser.frequencyBinCount)
    const wave = new Float32Array(analyser.fftSize)
    const binHz = ctx.sampleRate / analyser.fftSize
    const bin = (hz: number) => Math.min(freq.length - 1, Math.round(hz / binHz))
    const bands = [
      [bin(150), bin(900)],
      [bin(900), bin(2500)],
      [bin(2500), bin(7000)],
    ] as const

    const start = ctx.currentTime + 0.03
    src.start(start)
    let stopped = false
    const ended = new Promise<void>((resolve) => {
      src.onended = () => resolve()
    })
    const out: MouthLevels = { vol: 0, low: 0, mid: 0, high: 0 }
    return {
      real: true,
      time: () => Math.max(0, ctx.currentTime - start),
      levels: () => {
        if (stopped) return { vol: 0, low: 0, mid: 0, high: 0 }
        analyser.getFloatTimeDomainData(wave)
        let sum = 0
        for (let i = 0; i < wave.length; i++) sum += wave[i] * wave[i]
        const rms = Math.sqrt(sum / wave.length)
        analyser.getByteFrequencyData(freq)
        const e = bands.map(([a, b]) => {
          let s = 0
          for (let i = a; i < b; i++) s += freq[i] * freq[i]
          return s / Math.max(1, b - a)
        })
        const tot = e[0] + e[1] + e[2] + 1e-6
        out.vol = Math.min(1, Math.max(0, (rms - 0.006) / 0.11))
        out.low = e[0] / tot
        out.mid = e[1] / tot
        out.high = e[2] / tot
        return out
      },
      ended,
      stop: () => {
        if (stopped) return
        stopped = true
        try {
          src.stop()
        } catch {
          /* allaqachon to'xtagan */
        }
      },
    }
  }
}

/** Ovozsiz zaxira: so'z vaqtlari ichida bo'g'in tezligida (≈6 Hz) tebranuvchi amplituda */
function simulate(words: readonly WordTiming[]): Playback {
  const t0 = performance.now() / 1000
  const last = words[words.length - 1]
  const duration = last ? last.t + last.d + 0.25 : 1
  let stopped = false
  let resolveEnd: () => void = () => {}
  const ended = new Promise<void>((r) => {
    resolveEnd = r
  })
  const timer = window.setTimeout(() => resolveEnd(), duration * 1000)
  const time = () => performance.now() / 1000 - t0
  return {
    real: false,
    time,
    levels: () => {
      const t = time()
      if (stopped) return { vol: 0, low: 0, mid: 0, high: 0 }
      const w = words.find((x) => t >= x.t && t <= x.t + x.d)
      if (!w) return { vol: 0, low: 0.4, mid: 0.4, high: 0.2 }
      const p = (t - w.t) / w.d
      const syl = 0.5 + 0.5 * Math.sin(p * Math.PI * Math.max(2, w.w.length / 2.2))
      const env = Math.sin(Math.min(1, p) * Math.PI) ** 0.5
      const k = Math.sin(t * 17.3) * 0.5 + 0.5
      return { vol: env * (0.35 + 0.6 * syl), low: 0.3 + 0.3 * k, mid: 0.5 - 0.2 * k, high: 0.2 - 0.1 * k }
    },
    ended,
    stop: () => {
      stopped = true
      window.clearTimeout(timer)
      resolveEnd()
    },
  }
}
