// Majlis holat mashinasi (frontend): start -> turn ... -> finish. Har AI gapi audio_url bilan ijro qilinadi,
// keyin followups[] ketma-ket. Ijro paytida kim gapirayotgani (speaker) callback va SpeakerContext orqali beriladi.
// Rejimlar (prompts/api-rejimlar.md): mode (majlis|talim) /session/start ga doim yuboriladi; floor (so'z navbati) ->
// FloorContext (3D halqa) va asosiy tugma; window (tuzoq savol) -> yashirin taymer, o'tsa action "continue";
// tutor (talim) -> ustoz kartasi / "Vaqt to'xtadi"; record_delta -> jonli bayonnoma.
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  api,
  ApiError,
  isSessionFinished,
  type AnySpeaker,
  type FinishRes,
  type Floor,
  type Mode,
  type RecordItem,
  type Speaker,
  type StageInfo,
  type StageKind,
  type StartRes,
  type Tutor,
  type TutorChoice,
  type TurnInput,
  type TurnRes,
  type TurnWindow,
  type Violation,
} from './api'
import type { MouthLevels } from './director'

export type { Speaker } from './api'

/** Hozir gapirayotgan AI ishtirokchi (null — hech kim). Sahnadagi personajlar useContext(SpeakerContext) bilan oladi. */
export const SpeakerContext = createContext<Speaker | null>(null)

/** So'z egasi (floor.holder) — 3D da uning ostida oltin halqa. null — so'z navbati yo'q (eski server / start oldidan) */
export const FloorContext = createContext<Floor['holder'] | null>(null)

export const SPEAKER_LABEL: Record<AnySpeaker, string> = {
  judge: 'Raislik qiluvchi',
  witness: 'Guvoh',
  prosecutor: 'Prokuror',
  clerk: 'Kotib',
  defendant: 'Sudlanuvchi',
  defense: 'Himoyachi (siz)',
  tutor: 'Ustoz',
}

// ----------------------------------------------------------------------------- ovoz
export interface Voice {
  /** Boshidan o'tgan vaqt (s) */
  time: () => number
  /** Taxminiy davomiylik (s) — subtitr so'zlarini ochib borish uchun */
  duration: number
  levels: () => MouthLevels
  ended: Promise<void>
  /** false — ovoz ochilmadi, so'zlar soni bo'yicha simulyatsiya */
  real: boolean
  stop: () => void
}

type Ctor = typeof AudioContext
const SILENT: MouthLevels = { vol: 0, low: 0, mid: 0, high: 0 }

/** Bitta urinish uchun TTS yuklash chegarasi (ms) */
const TTS_TIMEOUT_MS = 15000
/** Birinchi urinish shundan tezroq xato bersa (503 tts_failed, tarmoq uzilishi) — bir marta qayta so'raladi */
const TTS_RETRY_IF_FAST_MS = 5000

/**
 * Server mp3 (audio_url) ni Web Audio orqali chaladi; analizator guvoh og'zi uchun daraja beradi.
 * Har gap alohida: bitta gap ovozi yuklanmasa (503/timeout) faqat shu gap subtitr bilan o'tadi, muvaffaqiyatsiz natija
 * keshlanmaydi — keyingi gaplar (va shu gapning keyingi ijrosi) qaytadan so'raladi.
 */
class VoicePlayer {
  private ctx: AudioContext | null = null
  private cache = new Map<string, Promise<AudioBuffer | null>>()
  private current: Voice | null = null
  /** play() yuklanayotganda stop()/skip() bosilsa — shu gap ijro qilinmaydi */
  private seq = 0

  /** Foydalanuvchi bosganda (autoplay qoidasi) */
  unlock() {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AC: Ctor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext
      if (AC) this.ctx = new AC()
    }
    void this.ctx?.resume().catch(() => {})
  }

  private async fetchOnce(url: string): Promise<{ buf: AudioBuffer | null; retry: boolean }> {
    const ctl = new AbortController()
    const timer = window.setTimeout(() => ctl.abort(), TTS_TIMEOUT_MS)
    try {
      const r = await fetch(url, { signal: ctl.signal })
      // 404 — bunday ovoz yo'q (qayta so'rash befoyda); 5xx — TTS vaqtincha ishlamadi
      if (!r.ok) return { buf: null, retry: r.status >= 500 }
      const data = await r.arrayBuffer()
      const ctx = this.ctx
      if (!ctx || ctx.state === 'closed') return { buf: null, retry: false }
      try {
        return { buf: await ctx.decodeAudioData(data), retry: false }
      } catch {
        return { buf: null, retry: false }
      }
    } catch (e) {
      return { buf: null, retry: !(e instanceof DOMException && e.name === 'AbortError') }
    } finally {
      window.clearTimeout(timer)
    }
  }

  /** Oldindan yuklash (deferred TTS: mp3 shu so'rovda yaratiladi) */
  load(url: string | null): Promise<AudioBuffer | null> {
    if (!url) return Promise.resolve(null)
    let p = this.cache.get(url)
    if (!p) {
      const t0 = performance.now()
      p = this.fetchOnce(url).then(async (a) => {
        if (a.buf || !a.retry || performance.now() - t0 > TTS_RETRY_IF_FAST_MS) return a.buf
        await new Promise((r) => window.setTimeout(r, 600))
        return (await this.fetchOnce(url)).buf
      })
      const mine = p
      // muvaffaqiyatsiz natija keshda qolmaydi: bitta xato butun sessiyani (yoki shu iborani) ovozsiz qilmasin
      void mine.then((b) => {
        if (!b && this.cache.get(url) === mine) this.cache.delete(url)
      })
      if (this.cache.size > 40) this.cache.clear()
      this.cache.set(url, p)
    }
    return p
  }

  stop() {
    this.seq++
    this.current?.stop()
    this.current = null
  }

  async play(url: string | null, text: string): Promise<Voice> {
    this.stop()
    const my = this.seq
    const buf = await this.load(url)
    // yuklanish paytida "O'tkazish" (yoki yangi amal) bosildi — gap ijro qilinmaydi, navbat keyingisiga o'tadi
    if (my !== this.seq) return skipped()
    const ctx = this.ctx
    const v = ctx && buf && ctx.state !== 'closed' ? playBuffer(ctx, buf) : simulate(text)
    this.current = v
    return v
  }

  /** Unmount: ovoz to'xtaydi, AudioContext yopiladi (keyingi unlock() yangisini ochadi) */
  dispose() {
    this.stop()
    this.cache.clear()
    const ctx = this.ctx
    this.ctx = null
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {})
  }
}

/** O'tkazib yuborilgan gap: darhol tugagan (real: true — "ovoz ochilmadi" yozuvi chiqmasin) */
function skipped(): Voice {
  return { real: true, duration: 0.5, time: () => 0.5, levels: () => SILENT, ended: Promise.resolve(), stop: () => {} }
}

/** "Ovoz" tugmasi (UI holati): AI ovozlari jim — analizator (og'iz harakati) va subtitr vaqti o'zgarmaydi */
let voiceMuted = false
const masters = new WeakMap<AudioContext, GainNode>()
function master(ctx: AudioContext): GainNode {
  let g = masters.get(ctx)
  if (!g) {
    g = ctx.createGain()
    g.gain.value = voiceMuted ? 0 : 1
    g.connect(ctx.destination)
    masters.set(ctx, g)
  }
  return g
}
let lastCtx: AudioContext | null = null
export function setVoiceMuted(m: boolean) {
  voiceMuted = m
  if (lastCtx) master(lastCtx).gain.value = m ? 0 : 1
}

function playBuffer(ctx: AudioContext, buf: AudioBuffer): Voice {
  lastCtx = ctx
  const src = ctx.createBufferSource()
  src.buffer = buf
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  analyser.smoothingTimeConstant = 0.35
  src.connect(analyser)
  analyser.connect(master(ctx))
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
  let resolveEnd: () => void = () => {}
  const ended = new Promise<void>((r) => {
    resolveEnd = r
  })
  src.onended = () => resolveEnd()
  const out: MouthLevels = { vol: 0, low: 0, mid: 0, high: 0 }
  return {
    real: true,
    // edge-tts mp3 oxirida ~0.8 s jimlik bor — subtitr undan oldin to'lsin
    duration: Math.max(0.5, buf.duration - 0.8),
    time: () => Math.max(0, ctx.currentTime - start),
    levels: () => {
      if (stopped) return SILENT
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
      resolveEnd()
    },
  }
}

/** Ovozsiz zaxira: ~0.38 s/so'z, bo'g'in tezligida tebranuvchi amplituda */
function simulate(text: string): Voice {
  const n = Math.max(1, text.trim().split(/\s+/).length)
  const duration = 0.6 + n * 0.38
  const t0 = performance.now() / 1000
  let stopped = false
  let resolveEnd: () => void = () => {}
  const ended = new Promise<void>((r) => {
    resolveEnd = r
  })
  const timer = window.setTimeout(() => resolveEnd(), duration * 1000)
  const time = () => performance.now() / 1000 - t0
  return {
    real: false,
    duration,
    time,
    levels: () => {
      const t = time()
      if (stopped || t > duration) return SILENT
      const syl = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 5.5)
      const k = Math.sin(t * 17.3) * 0.5 + 0.5
      return { vol: 0.3 + 0.55 * syl, low: 0.3 + 0.3 * k, mid: 0.5 - 0.2 * k, high: 0.2 - 0.1 * k }
    },
    ended,
    stop: () => {
      stopped = true
      window.clearTimeout(timer)
      resolveEnd()
    },
  }
}

// ----------------------------------------------------------------------------- holat
export type Status = 'idle' | 'starting' | 'ready' | 'sending' | 'speaking' | 'finishing' | 'result'

export interface Line {
  speaker: Speaker
  text: string
}

export interface SessionError {
  message: string
  /** 'session' — sessiya yo'qolgan (server qayta ishga tushgan): faqat qayta boshlash yordam beradi */
  kind: ApiError['kind']
  retry: () => void
}

/** URL dagi rejim: ?mode=talim|majlis (boshqa qiymat yoki yo'q — majlis) */
export function readMode(): Mode {
  return new URLSearchParams(window.location.search).get('mode') === 'talim' ? 'talim' : 'majlis'
}

/** URL dagi ish: ?case=case-001-noutbuk (bo'lmasa — server joriy ishni oladi) */
export function readCaseId(): string | null {
  const c = new URLSearchParams(window.location.search).get('case')
  return c && /^[\w-]{1,64}$/.test(c) ? c : null
}

/** Talaba murojaatining qisqa matni (subtitrdagi "Siz:" qatori; server to'liq iborani bayonnomaga yozadi) */
export const MOTION_TEXT = "Hurmatli sud, savolni rad etishni so'rayman: savol ishora qiluvchi."

export interface SessionHandlers {
  /** Talaba gap yubordi (guvoh tinglaydi) */
  onStudent?: (text: string) => void
  /** Javob kutilmoqda (guvoh o'ylaydi) */
  onWaiting?: () => void
  /** AI gapira boshladi: speaker, matn va ovoz (og'iz uchun levels) */
  onSpeak?: (line: Line, voice: Voice) => void
  /** Bitta gap tugadi */
  onSpeakEnd?: (line: Line) => void
  /** Navbatdagi barcha gaplar tugadi yoki to'xtatildi */
  onQuiet?: () => void
}

export interface CourtSession {
  mode: Mode
  status: Status
  sessionId: string | null
  stages: StageInfo[]
  stageId: string | null
  stageKind: StageKind | null
  canAdvance: boolean
  /** Majlis yopildi (oxirgi bosqich) — endi faqat yakunlash */
  closed: boolean
  violation: Violation | null
  /** Shu navbatda guvoh yashirin faktni ochdi */
  revealed: boolean
  /** Sessiyada guvoh yashirin faktni ochgan birinchi gapi (serverdan kelgan matn); ochilmagan bo'lsa null */
  revealedLine: string | null
  /** Ekrandagi subtitr: joriy yoki oxirgi AI gapi */
  line: Line | null
  /** 0..1 — subtitrning ochilgan qismi */
  progress: number
  /** Hozir gapirayotgan (ijro paytida), aks holda null */
  speaker: Speaker | null
  lastStudent: string | null
  silent: boolean
  error: SessionError | null
  result: FinishRes | null
  /** So'z navbati (server); eski serverda null */
  floor: Floor | null
  /** So'z talabadami (floor bo'lmasa — ha, eski xatti-harakat) */
  hasFloor: boolean
  /** Talaba so'z so'radi, javob kutilmoqda (yoki server requested_by da) */
  floorRequested: boolean
  /** Ochiq imkoniyat oynasi (tuzoq savol aytilgandan keyin, until_ms davomida). Majlisda UI uni ko'rsatmaydi */
  opportunity: TurnWindow | null
  /** AI ustoz (faqat talim): oxirgi kartasi */
  tutor: Tutor | null
  tutorSpeaking: boolean
  /** "Vaqt to'xtadi" overlay ochiq */
  paused: boolean
  hintsLeft: number | null
  /** Jonli bayonnoma (record_delta lar ketma-ket) */
  record: RecordItem[]
  start: () => void
  send: (text: string) => void
  advance: () => void
  requestFloor: () => void
  motion: () => void
  hint: () => void
  choose: (c: TutorChoice) => void
  resume: () => void
  finish: () => void
  restart: () => void
  /** Ovozni to'xtatish (subtitr qoladi) */
  skip: () => void
  /**
   * Imkoniyat taymerini ushlab turish. true — talaba gapirayotgan / "Eshitildi" kartasi (cheklangan muddatli holatlar);
   * 'typing' — matn yozilmoqda: oyna oxirgi chaqiruvdan (tugma bosilishidan) WINDOW_TYPING_IDLE_MS keyin baribir tugaydi;
   * false — qo'yib yuborish
   */
  holdWindow: (on: boolean | 'typing') => void
}

type QItem = { kind: 'line'; speaker: Speaker; text: string; audio: string | null } | { kind: 'tutor'; tutor: Tutor }

const SCENE_SPEAKERS = new Set<string>(['judge', 'witness', 'prosecutor', 'clerk', 'defendant'])
const isScene = (s: AnySpeaker): s is Speaker => SCENE_SPEAKERS.has(s)
/** event 'none' — yangi ustoz gapi yo'q (eski karta yopiladi); eski server event yubormaydi — mazmunga qaraladi */
const tutorHasContent = (t: Tutor) => t.event !== 'none' && (!!t.say_uz || t.choices.length > 0 || t.pause)
/** Matn maydonida yuborilmagan matn qolsa: oxirgi tugma bosilishidan shuncha ms keyin oyna baribir yopiladi */
export const WINDOW_TYPING_IDLE_MS = 8000
/** Javob kelgandan "Vaqt to'xtadi" ochilguncha (ms): avval sudya to'xtatgani (banner, kamera sudyada) ko'rinsin */
const PAUSE_DELAY_MS = 1400

/** Javobdan ijro navbati: asosiy gap + followups; ustoz — bosqich boshida asosiy gapdan keyin, xatoda oxirida */
function buildQueue(r: TurnRes | StartRes): QItem[] {
  const line = (speaker: AnySpeaker, text: string, audio: string | null): QItem[] =>
    isScene(speaker) && text ? [{ kind: 'line', speaker, text, audio }] : []
  const main = line(r.speaker, r.text_uz, r.audio_url)
  const fol = ('followups' in r ? r.followups : []).flatMap((f) => line(f.speaker, f.text_uz, f.audio_url))
  const t = r.tutor
  if (!t || !tutorHasContent(t)) return [...main, ...fol]
  const ti: QItem = { kind: 'tutor', tutor: t }
  if (t.pause || r.speaker === 'tutor') return [...main, ...fol, ti]
  return [...main, ti, ...fol]
}

export function useCourtSession(handlers: SessionHandlers, mode: Mode, caseId: string | null): CourtSession {
  const h = useRef(handlers)
  /** Qayta urinish tugmasi uchun eng so'nggi amallar (callbacklar o'ziga o'zi murojaat qilmasin) */
  const again = useRef<{ start: () => void; turn: (i: TurnInput) => void; finish: () => void }>({
    start: () => {},
    turn: () => {},
    finish: () => {},
  })
  useEffect(() => {
    h.current = handlers
  })
  const player = useMemo(() => new VoicePlayer(), [])
  const run = useRef(0)
  const winTimer = useRef(0)
  const winHold = useRef<{ hard: boolean; typingAt: number | null }>({ hard: false, typingAt: null })
  /** Yo'ldagi /turn so'rovining run id si (null — yo'q): bir vaqtda faqat bitta so'rov */
  const inflight = useRef<number | null>(null)
  /** Joriy sessiya id (eskirgan javobning record_delta si shu sessiyaga tegishlimi) */
  const sessionRef = useRef<string | null>(null)
  /** Shu run (amal) uchun "Vaqt to'xtadi" allaqachon ochilgan — talaba yopsa navbat uni qayta ochmasin */
  const pauseRun = useRef(-1)
  const pauseTimer = useRef(0)

  const [status, setStatus] = useState<Status>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [stages, setStages] = useState<StageInfo[]>([])
  const [stageId, setStageId] = useState<string | null>(null)
  const [stageKind, setStageKind] = useState<StageKind | null>(null)
  const [canAdvance, setCanAdvance] = useState(false)
  const [closed, setClosed] = useState(false)
  const [violation, setViolation] = useState<Violation | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [revealedLine, setRevealedLine] = useState<string | null>(null)
  const [line, setLine] = useState<Line | null>(null)
  const [progress, setProgress] = useState(0)
  const [speaker, setSpeaker] = useState<Speaker | null>(null)
  const [lastStudent, setLastStudent] = useState<string | null>(null)
  const [silent, setSilent] = useState(false)
  const [error, setError] = useState<SessionError | null>(null)
  const [result, setResult] = useState<FinishRes | null>(null)
  const [floor, setFloor] = useState<Floor | null>(null)
  const [asked, setAsked] = useState(false)
  const [opportunity, setOpportunity] = useState<TurnWindow | null>(null)
  const [tutor, setTutor] = useState<Tutor | null>(null)
  const [tutorSpeaking, setTutorSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [hintsLeft, setHintsLeft] = useState<number | null>(null)
  const [record, setRecord] = useState<RecordItem[]>([])

  const clearWindow = useCallback(() => {
    window.clearTimeout(winTimer.current)
    setOpportunity(null)
  }, [])

  useEffect(
    () => () => {
      // unmount: navbat (playQueue), yo'ldagi javoblar va barcha taymerlar to'xtaydi, AudioContext yopiladi
      run.current++
      inflight.current = null
      player.dispose()
      window.clearTimeout(winTimer.current)
      window.clearTimeout(pauseTimer.current)
    },
    [player],
  )

  /** Imkoniyat oynasi: tuzoq savol aytib bo'lingach until_ms; o'tsa — action "continue" (sahna davom etadi) */
  const armWindow = useCallback((w: TurnWindow, id: number) => {
    window.clearTimeout(winTimer.current)
    setOpportunity(w)
    let deadline = performance.now() + Math.max(1000, w.until_ms)
    const tick = () => {
      if (id !== run.current) return
      const t = performance.now()
      const hold = winHold.current
      if (hold.hard) deadline = Math.max(deadline, t + 2500)
      else if (hold.typingAt !== null) deadline = Math.max(deadline, hold.typingAt + WINDOW_TYPING_IDLE_MS)
      if (t >= deadline) {
        setOpportunity(null)
        again.current.turn({ action: 'continue' })
        return
      }
      winTimer.current = window.setTimeout(tick, Math.min(400, deadline - t))
    }
    winTimer.current = window.setTimeout(tick, 400)
  }, [])

  /** Gaplarni ketma-ket ijro qiladi; yangi amal (run) boshlansa to'xtaydi */
  const playQueue = useCallback(
    async (items: QItem[], id: number, win: TurnWindow | null) => {
      items.forEach((it) => void player.load(it.kind === 'line' ? it.audio : it.tutor.audio_url))
      setStatus('speaking')
      for (const it of items) {
        if (id !== run.current) return
        if (it.kind === 'tutor') {
          const t = it.tutor
          setTutor(t)
          if (t.pause && pauseRun.current !== id) {
            pauseRun.current = id
            window.clearTimeout(pauseTimer.current)
            setPaused(true)
          }
          if (t.say_uz && t.audio_url) {
            setSpeaker(null)
            setTutorSpeaking(true)
            const v = await player.play(t.audio_url, t.say_uz)
            if (id !== run.current) {
              v.stop()
              return
            }
            await v.ended
            setTutorSpeaking(false)
          }
          continue
        }
        const l: Line = { speaker: it.speaker, text: it.text }
        // matn darhol (och rangda) ko'rinadi, ovoz kelishi bilan so'zlar ochilib boradi
        setLine(l)
        setProgress(0)
        const v = await player.play(it.audio, it.text)
        if (id !== run.current) {
          v.stop()
          return
        }
        // har gap alohida: keyingi gap ovozi ochilsa "ovoz ochilmadi" yozuvi yo'qoladi
        setSilent(!v.real)
        setLine(l)
        setSpeaker(l.speaker)
        setProgress(0)
        h.current.onSpeak?.(l, v)
        let raf = 0
        const tick = () => {
          setProgress(Math.min(1, v.time() / v.duration))
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        await v.ended
        cancelAnimationFrame(raf)
        if (id !== run.current) return
        setProgress(1)
        h.current.onSpeakEnd?.(l)
      }
      if (id !== run.current) return
      setSpeaker(null)
      setStatus('ready')
      h.current.onQuiet?.()
      if (win && win.kind === 'motion_opportunity') armWindow(win, id)
    },
    [player, armWindow],
  )

  const fail = useCallback((e: unknown, retry: () => void) => {
    const err = e instanceof ApiError ? e : new ApiError('http', "Kutilmagan xato. Qayta urinib ko'ring.")
    setError({ message: err.message, kind: err.kind, retry })
    h.current.onQuiet?.()
  }, [])

  /** Rejim maydonlari: floor, bayonnoma, ustoz (maslahatlar soni darhol yangilanadi) */
  const applyExtras = useCallback((r: TurnRes | StartRes, id: number) => {
    setFloor(r.floor ?? null)
    setAsked(false)
    const delta = r.record_delta
    if (delta?.length) setRecord((prev) => [...prev, ...delta])
    const t = r.tutor
    if (t) {
      setHintsLeft(t.hints_left)
      if (tutorHasContent(t)) {
        // karta darhol yangilanadi: oldingi navbatdagi (eskirgan) maqtov xatodan keyin ko'rinib turmasin
        setTutor(t)
        if (t.pause) {
          // "Vaqt to'xtadi" sudya to'xtatgani ko'ringach (banner + sudya kadri) ochiladi — sudya gapi tugashini
          // (deferred TTS yuklanishi bilan bir necha soniya) kutmaydi. Navbat ustozga yetsa — undan oldin ham
          window.clearTimeout(pauseTimer.current)
          pauseTimer.current = window.setTimeout(() => {
            if (id !== run.current || pauseRun.current === id) return
            pauseRun.current = id
            setPaused(true)
          }, PAUSE_DELAY_MS)
        }
      } else {
        // bo'sh ustoz javobi: eski kartadagi gap va tanlovlar endi eskirgan
        setTutor((prev) => (prev ? { ...prev, say_uz: null, audio_url: null, choices: [], pause: false } : prev))
      }
    }
  }, [])

  const applyTurn = useCallback(
    (r: TurnRes, id: number) => {
      setStageId(r.stage_id)
      setStageKind(r.stage_kind)
      setCanAdvance(r.can_advance)
      setClosed(r.finished)
      setViolation(r.violation)
      setRevealed(r.revealed_hidden_fact)
      if (r.revealed_hidden_fact) {
        // ochilgan gap: asosiy javob guvohniki bo'lsa — u, aks holda followups dagi guvoh gapi
        const said = (r.speaker === 'witness' ? r.text_uz : r.followups.find((f) => f.speaker === 'witness')?.text_uz)?.trim()
        if (said) setRevealedLine((prev) => prev ?? said)
      }
      applyExtras(r, id)
      void playQueue(buildQueue(r), id, r.window ?? null)
    },
    [playQueue, applyExtras],
  )

  const start = useCallback(() => {
    player.unlock()
    const id = ++run.current
    clearWindow()
    setError(null)
    setStatus('starting')
    api
      .start({ mode, case_id: caseId })
      .then((r) => {
        if (id !== run.current) return
        sessionRef.current = r.session_id
        setSessionId(r.session_id)
        setStages(r.stages)
        setStageId(r.stage_id)
        setStageKind(r.stages.find((s) => s.id === r.stage_id)?.kind ?? 'opening')
        setCanAdvance(false)
        setClosed(false)
        setViolation(null)
        setRevealed(false)
        setRevealedLine(null)
        setResult(null)
        setLastStudent(null)
        setRecord([])
        setTutor(null)
        setPaused(false)
        setHintsLeft(null)
        applyExtras(r, id)
        void playQueue(buildQueue(r), id, r.window ?? null)
      })
      .catch((e) => {
        if (id !== run.current) return
        setStatus('idle')
        fail(e, () => again.current.start())
      })
  }, [player, playQueue, fail, mode, caseId, applyExtras, clearWindow])

  const doTurn = useCallback(
    (input: TurnInput) => {
      if (!sessionId) return
      // so'rov yo'lda: ikkinchisi yuborilmaydi (birinchi javob tashlanib, uning bayonnoma yozuvlari yo'qolardi).
      // UI tugmalari 'sending' da disabled; bu — "Eshitildi" avto-yuborish, taymer va tez bosishlar uchun himoya
      if (inflight.current !== null) return
      player.unlock()
      player.stop()
      const id = ++run.current
      inflight.current = id
      const sid = sessionId
      clearWindow()
      setError(null)
      setViolation(null)
      setRevealed(false)
      setSpeaker(null)
      setTutorSpeaking(false)
      setPaused(false)
      setStatus('sending')
      if ('text' in input) {
        setLastStudent(input.text)
        h.current.onStudent?.(input.text)
      } else if (input.action === 'motion_reject_question') {
        setLastStudent(MOTION_TEXT)
        h.current.onStudent?.(MOTION_TEXT)
      } else if (input.action === 'request_floor') {
        setLastStudent("(so'z so'radingiz)")
        setAsked(true)
      } else {
        setLastStudent(null)
      }
      h.current.onWaiting?.()
      api
        .turn(sid, input)
        .then((r) => {
          if (inflight.current === id) inflight.current = null
          if (id === run.current) {
            applyTurn(r, id)
            return
          }
          // eskirgan javob (masalan, shu paytda yakunlash bosildi): server record_cursor ni allaqachon surgan —
          // yozuvlari jonli bayonnomaga baribir qo'shiladi (sessiya o'sha bo'lsa)
          const delta = r.record_delta
          if (delta?.length && sid === sessionRef.current) setRecord((prev) => [...prev, ...delta])
        })
        .catch((e) => {
          if (inflight.current === id) inflight.current = null
          if (id !== run.current) return
          setAsked(false)
          if (isSessionFinished(e)) {
            // sessiya serverda yakunlangan: xato ko'rsatilmaydi — majlis yopiladi va keshdagi natija olinadi
            // (takroriy /finish o'sha natijani qaytaradi)
            setClosed(true)
            setCanAdvance(false)
            setStatus('ready')
            again.current.finish()
            return
          }
          setStatus('ready')
          fail(e, () => again.current.turn(input))
        })
    },
    [sessionId, player, applyTurn, fail, clearWindow],
  )

  const send = useCallback(
    (text: string) => {
      const t = text.trim()
      if (t) doTurn({ text: t })
    },
    [doTurn],
  )
  const advance = useCallback(() => doTurn({ action: 'next_stage' }), [doTurn])
  const requestFloor = useCallback(() => doTurn({ action: 'request_floor' }), [doTurn])
  const motion = useCallback(() => doTurn({ action: 'motion_reject_question' }), [doTurn])
  const hint = useCallback(() => {
    if (mode === 'talim') doTurn({ action: 'hint' })
  }, [doTurn, mode])
  const choose = useCallback(
    (c: TutorChoice) => {
      if (c.action) doTurn({ action: c.action })
      else if (c.text_uz.trim()) doTurn({ text: c.text_uz.trim() })
    },
    [doTurn],
  )
  const resume = useCallback(() => setPaused(false), [])

  const finish = useCallback(() => {
    if (!sessionId) return
    player.stop()
    const id = ++run.current
    clearWindow()
    setError(null)
    setSpeaker(null)
    setTutorSpeaking(false)
    setPaused(false)
    setStatus('finishing')
    h.current.onQuiet?.()
    api
      .finish(sessionId)
      .then((r) => {
        if (id !== run.current) return
        setResult(r)
        setStatus('result')
      })
      .catch((e) => {
        if (id !== run.current) return
        setStatus('ready')
        fail(e, () => again.current.finish())
      })
  }, [sessionId, player, fail, clearWindow])

  const restart = useCallback(() => {
    player.stop()
    run.current++
    inflight.current = null
    sessionRef.current = null
    clearWindow()
    setSessionId(null)
    setResult(null)
    setLine(null)
    setSpeaker(null)
    setLastStudent(null)
    setViolation(null)
    setRevealed(false)
    setRevealedLine(null)
    setError(null)
    setFloor(null)
    setTutor(null)
    setTutorSpeaking(false)
    setPaused(false)
    setRecord([])
    h.current.onQuiet?.()
    start()
  }, [player, start, clearWindow])

  useEffect(() => {
    again.current = { start, turn: doTurn, finish }
  })

  const skip = useCallback(() => {
    player.stop()
  }, [player])

  const holdWindow = useCallback((on: boolean | 'typing') => {
    winHold.current = { hard: on === true, typingAt: on === 'typing' ? performance.now() : null }
  }, [])

  const hasFloor = !floor || floor.holder === 'defense'
  const floorRequested = asked || !!floor?.requested_by.includes('defense')

  return {
    mode,
    status,
    sessionId,
    stages,
    stageId,
    stageKind,
    canAdvance,
    closed,
    violation,
    revealed,
    revealedLine,
    line,
    progress,
    speaker,
    lastStudent,
    silent,
    error,
    result,
    floor,
    hasFloor,
    floorRequested,
    opportunity,
    tutor,
    tutorSpeaking,
    paused,
    hintsLeft,
    record,
    start,
    send,
    advance,
    requestFloor,
    motion,
    hint,
    choose,
    resume,
    finish,
    restart,
    skip,
    holdWindow,
  }
}
