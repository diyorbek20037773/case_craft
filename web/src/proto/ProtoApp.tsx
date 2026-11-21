// "Jonli guvoh" vizual sinov sahnasi: bitta savol -> guvoh tinglaydi, o'ylaydi, bosh chayqab javob beradi.
import { useProgress } from '@react-three/drei'
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AudioEngine, WORDS, type ClipId, type Playback } from './audio'
import { director, now, setPhase, type WitnessPhase } from './director'
import { Stage, type GyroOffset, type Quality } from './Stage'

const PHASE_LABEL: Record<WitnessPhase, string> = {
  idle: 'sudyaga qarab turibdi',
  listen: 'sizni tinglayapti',
  think: "o'ylayapti…",
  answer: 'javob beryapti',
  return: 'sudyaga qaytdi',
}

const SPEAKER: Record<ClipId, string> = { savol: 'Himoyachi (siz)', javob: 'Guvoh' }

interface Subtitle {
  clip: ClipId
  word: number
}

function detectQuality(): Quality {
  if (typeof window === 'undefined') return 'low'
  const q = new URLSearchParams(window.location.search).get('q')
  if (q === 'high' || q === 'low') return q
  const coarse = window.matchMedia?.('(pointer: coarse)').matches
  const cores = navigator.hardwareConcurrency ?? 4
  return !coarse && cores >= 8 ? 'high' : 'low'
}

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms))

/** mp3 oxirida ~1 s jimlik bor: oxirgi so'z tugashi + pad bilan yoki klip tugashi bilan (qaysi oldin) davom etamiz */
function spoken(pb: Playback, clip: ClipId, pad: number): Promise<void> {
  const last = WORDS[clip][WORDS[clip].length - 1]
  const end = last ? last.t + last.d + pad : 0
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      window.clearInterval(timer)
      resolve()
    }
    const timer = window.setInterval(() => {
      if (pb.time() >= end) finish()
    }, 50)
    void pb.ended.then(finish)
  })
}

export function ProtoApp() {
  const debug = useMemo(() => new URLSearchParams(window.location.search).has('debug'), [])
  const [quality, setQuality] = useState<Quality>(detectQuality)
  const [phase, setPhaseUi] = useState<WitnessPhase>('idle')
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [sub, setSub] = useState<Subtitle | null>(null)
  const [silentMode, setSilentMode] = useState(false)
  const [gyroState, setGyroState] = useState<'off' | 'on' | 'denied' | 'none'>('off')
  const gyro = useRef<GyroOffset>({ yaw: 0, pitch: 0 })
  const engine = useMemo(() => new AudioEngine(), [])
  const runId = useRef(0)

  const go = useCallback((p: WitnessPhase) => {
    setPhase(p)
    setPhaseUi(p)
  }, [])

  useEffect(() => () => engine.stop(), [engine])

  /** Klipni chalib, subtitrdagi joriy so'zni kuzatib boradi */
  const speak = useCallback(
    async (clip: ClipId, id: number): Promise<Playback | null> => {
      const pb = await engine.play(clip)
      if (id !== runId.current) {
        pb.stop()
        return null
      }
      if (!pb.real) setSilentMode(true)
      const words = WORDS[clip]
      setSub({ clip, word: -1 })
      let raf = 0
      let last = -2
      const tick = () => {
        const t = pb.time()
        let w = -1
        for (let i = 0; i < words.length; i++) if (t >= words[i].t) w = i
        if (w !== last) {
          last = w
          setSub({ clip, word: w })
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      void pb.ended.then(() => {
        cancelAnimationFrame(raf)
        if (id === runId.current) setSub({ clip, word: words.length })
      })
      return pb
    },
    [engine],
  )

  const ask = useCallback(async () => {
    engine.unlock()
    const id = ++runId.current
    setRunning(true)
    setDone(false)
    director.shakeAt = null
    try {
      // 1) Talaba savoli — guvoh boshini kameraga buradi
      go('listen')
      const q = await speak('savol', id)
      if (!q) return
      await spoken(q, 'savol', 0.25)
      if (id !== runId.current) return
      // 2) O'ylash pauzasi
      go('think')
      await sleep(800)
      if (id !== runId.current) return
      // 3) Javob: "Yo'q" bilan bosh chayqash + lab harakati
      const a = await speak('javob', id)
      if (!a) return
      director.mouth = () => a.levels()
      go('answer')
      const no = WORDS.javob[0]
      director.shakeAt = now() + Math.max(0, no.t - 0.05)
      await spoken(a, 'javob', 0.45)
      if (id !== runId.current) return
      director.mouth = () => null
      // 4) Nigoh sudyaga qaytadi
      go('return')
      await sleep(2600)
      if (id !== runId.current) return
      go('idle')
      setDone(true)
    } finally {
      if (id === runId.current) setRunning(false)
    }
  }, [engine, go, speak])

  const stop = useCallback(() => {
    runId.current++
    engine.stop()
    director.mouth = () => null
    director.shakeAt = null
    go('return')
    setRunning(false)
    setSub(null)
    window.setTimeout(() => {
      if (director.phase === 'return') go('idle')
    }, 2000)
  }, [engine, go])

  const gyroAvailable = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window && matchMedia('(pointer: coarse)').matches
  const toggleGyro = useCallback(async () => {
    if (gyroState === 'on') {
      setGyroState('off')
      gyro.current = { yaw: 0, pitch: 0 }
      return
    }
    const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> }
    if (typeof DOE.requestPermission === 'function') {
      try {
        const r = await DOE.requestPermission()
        if (r !== 'granted') {
          setGyroState('denied')
          return
        }
      } catch {
        setGyroState('denied')
        return
      }
    }
    setGyroState('on')
  }, [gyroState])

  useEffect(() => {
    if (gyroState !== 'on') return
    let base: { a: number; b: number } | null = null
    let got = false
    const onOrient = (ev: DeviceOrientationEvent) => {
      if (ev.alpha == null || ev.beta == null) return
      got = true
      if (!base) base = { a: ev.alpha, b: ev.beta }
      let da = ev.alpha - base.a
      da = ((da + 540) % 360) - 180
      const db = ev.beta - base.b
      const lim = (x: number, m: number) => Math.max(-m, Math.min(m, x))
      gyro.current = { yaw: lim((-da * Math.PI) / 180, 0.22), pitch: lim((db * Math.PI) / 180, 0.14) }
    }
    window.addEventListener('deviceorientation', onOrient)
    const t = window.setTimeout(() => {
      if (!got) setGyroState('none')
    }, 2500)
    return () => {
      window.removeEventListener('deviceorientation', onOrient)
      window.clearTimeout(t)
    }
  }, [gyroState])

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#1a1714] text-white">
      {/* Iliq rang korreksiyasi + vinyetka — CSS da (telefonda ham arzon) */}
      <div className="proto-grade absolute inset-0">
        <SceneBoundary>
          <Stage quality={quality} onQuality={setQuality} gyro={gyro} debug={debug} />
        </SceneBoundary>
      </div>
      <div className="pointer-events-none absolute inset-0 proto-vignette" aria-hidden />

      <Loader />

      {/* Yuqori panel */}
      <header className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex flex-col gap-1.5">
          <span className="w-fit rounded-full border border-amber-200/30 bg-black/45 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-amber-100 backdrop-blur-md">
            AI o'quv simulyatsiyasi
          </span>
          <span className="w-fit rounded-full bg-black/40 px-2.5 py-1 text-[11px] text-white/85 backdrop-blur-md" aria-live="polite">
            <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${phase === 'idle' ? 'bg-white/50' : 'bg-emerald-400'}`} />
            Guvoh: {PHASE_LABEL[phase]}
          </span>
        </div>
        {gyroAvailable && (
          <button
            type="button"
            onClick={toggleGyro}
            className="pointer-events-auto min-h-11 rounded-full border border-white/20 bg-black/45 px-3 text-xs font-medium text-white backdrop-blur-md active:scale-95"
          >
            {gyroState === 'on' ? 'Giroskop: yoniq' : gyroState === 'denied' ? 'Giroskop: ruxsat yo‘q' : gyroState === 'none' ? 'Giroskop topilmadi' : 'Giroskop'}
          </button>
        )}
      </header>

      {/* Pastki panel: subtitr + tugma */}
      <footer className="absolute inset-x-0 bottom-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-2xl flex-col gap-2.5">
          <SubtitlePanel sub={sub} running={running} />
          {silentMode && (
            <p className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-center text-[11px] text-amber-100">
              Ovoz ochilmadi — lab harakati so'z vaqtlari bo'yicha simulyatsiya qilinmoqda.
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={ask}
              disabled={running}
              className="min-h-12 flex-1 rounded-xl bg-amber-400 px-4 text-[15px] font-semibold text-stone-950 shadow-lg shadow-black/30 transition active:scale-[0.98] disabled:bg-amber-400/40 disabled:text-stone-900/70"
            >
              {running ? 'Guvoh javob bermoqda…' : done ? 'Yana so‘rash' : 'Savol berish'}
            </button>
            {running && (
              <button
                type="button"
                onClick={stop}
                className="min-h-12 rounded-xl border border-white/25 bg-black/50 px-4 text-sm font-medium text-white backdrop-blur-md active:scale-[0.98]"
              >
                To'xtatish
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  )
}

function SubtitlePanel({ sub, running }: { sub: Subtitle | null; running: boolean }) {
  if (!sub) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/55 px-4 py-3 text-sm text-white/80 backdrop-blur-md">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-200/80">Vazifa</p>
        <p className="mt-0.5">
          Siz himoyachisiz. Guvohdan ayblanuvchining yuzini ko'rgan-ko'rmaganini so'rang.
          {!running && <span className="text-white/55"> Ovoz yoqilgan bo'lsin.</span>}
        </p>
      </div>
    )
  }
  const words = WORDS[sub.clip]
  return (
    <div className="rounded-2xl border border-white/10 bg-black/60 px-4 py-3 backdrop-blur-md" aria-live="polite">
      <p className={`text-[11px] font-semibold uppercase tracking-wider ${sub.clip === 'javob' ? 'text-sky-200' : 'text-amber-200'}`}>
        {SPEAKER[sub.clip]}
      </p>
      <p className="mt-0.5 text-[17px] leading-snug font-medium">
        {words.map((w, i) => (
          <span key={i} className={i <= sub.word ? 'text-white' : 'text-white/35'}>
            {w.w}
            {punct(sub.clip, i)}{' '}
          </span>
        ))}
      </p>
    </div>
  )
}

/** edge-tts so'z chegaralarida tinish belgilari yo'q — asl matndan tiklanadi */
const FULL: Record<ClipId, string> = {
  savol: "Siz uning yuzini ko'rdingizmi?",
  javob: "Yo'q. Men uning yuzini ko'rmadim. Faqat kulrang kiyimini ko'rdim.",
}
function punct(clip: ClipId, i: number) {
  const tokens = FULL[clip].split(/\s+/)
  const m = tokens[i]?.match(/[.?!,]+$/)
  return m ? m[0] : ''
}

function Loader() {
  const { active, progress } = useProgress()
  if (!active && progress >= 100) return null
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#1a1714]" role="status">
      <p className="text-sm text-white/80">Sud zali yuklanmoqda…</p>
      <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-amber-400 transition-[width]" style={{ width: `${Math.round(progress)}%` }} />
      </div>
    </div>
  )
}

class SceneBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#1a1714] p-6 text-center">
          <p className="text-base font-semibold">Sahna ochilmadi</p>
          <p className="max-w-sm text-sm text-white/65">{this.state.error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-11 rounded-xl bg-amber-400 px-4 text-sm font-semibold text-stone-950"
          >
            Qayta yuklash
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
