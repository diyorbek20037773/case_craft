// CaseCraft: 3D sud zali (Meshy personajlar) + AI backend (server/README.md, prompts/api-rejimlar.md).
// Kirish qismi ?role=himoyachi&case=<id>&mode=talim|majlis bilan ochadi; mode /session/start ga doim yuboriladi.
// session.ts: kim gapiryapti (SpeakerContext — barcha o'tirganlar va guvoh xulqi), so'z navbati (FloorContext — oltin
// halqa, asosiy tugma), tuzoq savol oynasi, AI ustoz (talim: karta, "Vaqt to'xtadi"), jonli bayonnoma (kotib paneli).
// ?debug — FPS/og'iz paneli, ?api=http://localhost:PORT — lokal backend porti (faqat localhost).
import { useProgress } from '@react-three/drei'
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CameraPicker } from './characters/CameraPicker'
import { court } from './characters/court'
import { director, now, setPhase, type CameraMode } from './director'
import { Scene, type Tier } from './Scene'
import { FloorContext, readCaseId, readMode, setVoiceMuted, SpeakerContext, useCourtSession, type Line, type Speaker, type Voice } from './session'
import { CasePanel } from './ui/CasePanel'
import { CourtDock } from './ui/CourtDock'
import { RecordPanel } from './ui/RecordPanel'
import { ResultScreen } from './ui/ResultScreen'
import { StartCard } from './ui/StartCard'
import { TopBar } from './ui/TopBar'
import { PauseOverlay } from './ui/TutorCard'
import { useIsDesktop } from './ui/useIsDesktop'
import { ViolationBanner } from './ui/ViolationBanner'

const TIER_LABEL: Record<Tier, string> = { 0: 'past', 1: "o'rta", 2: 'yuqori' }

function isMobileDevice() {
  const q = new URLSearchParams(window.location.search).get('q')
  if (q === 'high') return false
  if (q === 'low') return true
  const coarse = window.matchMedia?.('(pointer: coarse)').matches
  return coarse || Math.min(window.innerWidth, window.innerHeight) < 600
}

/** Javob "Yo'q" bilan boshlansa guvoh bosh chayqaydi (tutuq belgisining barcha turlari) */
const startsWithNo = (t: string) => /^\s*[«"]?yo['’ʻʼ‘`]?q(?![a-z'])/i.test(t)

export function GuvohApp() {
  const debug = useMemo(() => {
    const v = new URLSearchParams(window.location.search).get('debug')
    return v !== null && v !== '0' && v !== 'false'
  }, [])
  const mode = useMemo(() => readMode(), [])
  const caseId = useMemo(() => readCaseId(), [])
  const desktop = useIsDesktop()
  /** null — standart: noutbukda ochiq, telefonda yopiq */
  const [recordPref, setRecordPref] = useState<boolean | null>(null)
  const mobile = useMemo(() => isMobileDevice(), [])
  const lockedTier = useMemo(() => {
    const t = new URLSearchParams(window.location.search).get('tier')
    return t === '0' || t === '1' || t === '2' ? (Number(t) as Tier) : null
  }, [])
  // Noutbukda o'rta sifatdan boshlanadi: AdaptiveQuality 4 s dan keyin ishga tushadi — FPS yetarli bo'lsa 2 ga ko'taradi.
  // 2 dan boshlansa, sekin kompyuterda birinchi soniyalar qotib qolardi.
  const [tier, setTier] = useState<Tier>(lockedTier ?? (mobile ? 0 : 1))
  const [cam, setCam] = useState<CameraMode>('auto')
  const [muted, setMuted] = useState(false)
  useEffect(() => setVoiceMuted(muted), [muted])
  /** ?q=low yoki eng past sifat: shisha blur'siz (T3) */
  const qLow = useMemo(() => new URLSearchParams(window.location.search).get('q') === 'low', [])
  const [caseOpen, setCaseOpen] = useState(false)
  const timers = useRef<number[]>([])
  const answers = useRef(0)

  const camera = useCallback((m: CameraMode) => {
    director.camera = m
    setCam(m)
  }, [])
  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])
  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }, [])
  useEffect(() => clearTimers, [clearTimers])

  /** Guvohni tinch holatga qaytarish: nigoh sudyaga, so'ng idle */
  const settle = useCallback(() => {
    director.mouth = () => null
    director.shakeAt = null
    if (director.phase === 'idle' || director.phase === 'return') return
    setPhase('return')
    later(2600, () => {
      if (director.phase === 'return') setPhase('idle')
    })
  }, [later])

  // speaker -> guvoh xulqi (listen/think/answer/shake). O'tirganlar SpeakerContext dan o'zi oladi (characters/Character.tsx).
  const s = useCourtSession({
    onStudent: () => {
      clearTimers()
      director.mouth = () => null
      director.shakeAt = null
      setPhase('listen')
    },
    onWaiting: () => {
      later(1100, () => {
        if (director.phase === 'listen') setPhase('think')
      })
    },
    onSpeak: (line: Line, voice: Voice) => {
      clearTimers()
      if (line.speaker !== 'witness') {
        settle()
        return
      }
      // talk_right (bitta qo'l) asosiy; har 3-javobda talk_both
      director.talkClip = answers.current++ % 3 === 2 ? 'talk_both' : 'talk_right'
      director.mouth = () => voice.levels()
      director.shakeAt = startsWithNo(line.text) ? now() + 0.05 : null
      setPhase('answer')
    },
    onSpeakEnd: (line: Line) => {
      if (line.speaker === 'witness') settle()
    },
    onQuiet: () => {
      clearTimers()
      settle()
    },
  }, mode, caseId)

  const started = !!s.sessionId
  // zal ekrani uchun joriy bosqich nomi
  const stageName = s.closed ? 'Majlis yakunlandi' : (s.stages.find((x) => x.id === s.stageId)?.name_uz ?? '')
  // noutbukda yig'ilgan holda boshlanadi va birinchi muhim yozuvda (qoidabuzarlik / fakt / murojaat / qaror) o'zi ochiladi;
  // foydalanuvchi o'zi ochsa/yopsa — uning tanlovi ustun
  const important = s.record.some((r) => r.type !== 'normal')
  const recordOpen = started && !s.result && (recordPref ?? (desktop && important))
  const paused = mode === 'talim' && s.paused && !!s.tutor

  // Avto kamera subyekti (Scene.tsx CameraRig): navbatdagi gap egasi — ovozi yuklanishini kutmasdan; raislik qiluvchi
  // to'xtatganda (banner) — prokuror murojaati va qaror davomida ham kamera sudyada; majlis yopilgach — sudyada qoladi
  const speakingLine = s.status === 'speaking' && s.line ? s.line.speaker : null
  const camCue: Speaker | null = s.result
    ? null
    : s.violation && (!speakingLine || speakingLine === 'judge' || speakingLine === 'prosecutor')
      ? 'judge'
      : (speakingLine ?? (s.closed ? 'judge' : null))
  useEffect(() => {
    court.cue = camCue
  }, [camCue])

  return (
    <SpeakerContext.Provider value={s.speaker}>
      <FloorContext.Provider value={started && !s.closed ? (s.floor?.holder ?? null) : null}>
      <div className={`relative h-dvh w-full overflow-hidden bg-navy-950 font-sans text-ivory ${qLow || tier === 0 ? 'q-low' : ''}`}>
        {/* "Vaqt to'xtadi": sahna kulrang va och (CSS filtr — WebGL ga qo'shimcha yuk yo'q) */}
        <div
          className="absolute inset-0 transition-[filter] duration-700"
          style={paused ? { filter: 'grayscale(0.85) brightness(0.55)' } : undefined}
        >
          <SceneBoundary>
            <Scene mobile={mobile} tier={tier} onTier={setTier} lockTier={lockedTier !== null} debug={debug} stageName={stageName} />
          </SceneBoundary>
        </div>

        <Loader />

        <TopBar
          mode={mode}
          stages={s.stages}
          stageId={s.stageId}
          closed={s.closed}
          floor={started ? s.floor : null}
          floorRequested={s.floorRequested}
          recordCount={s.record.length}
          recordOpen={recordOpen}
          onRecord={() => setRecordPref(!recordOpen)}
          onCase={() => setCaseOpen(true)}
          muted={muted}
          onMute={() => setMuted((m) => !m)}
          camera={<CameraPicker cam={cam} onCamera={camera} />}
        />
        <RecordPanel
          items={s.record}
          open={recordOpen}
          onClose={() => setRecordPref(false)}
          hideText={s.status === 'speaking' && s.line ? s.line.text : null}
        />
        {started && !s.result && <ViolationBanner violation={s.violation} />}

        {debug && <DebugPanel tier={tier} mobile={mobile} />}

        {started ? (
          <CourtDock s={s} insetLeft={recordOpen && desktop} />
        ) : (
          <StartCard mode={mode} busy={s.status === 'starting'} error={s.error?.message ?? null} onStart={s.start} onCase={() => setCaseOpen(true)} />
        )}

        {paused && s.tutor && (
          <PauseOverlay tutor={s.tutor} speaking={s.tutorSpeaking} disabled={s.status === 'sending' || s.status === 'finishing' || s.closed} onChoose={s.choose} onResume={s.resume} />
        )}

        <CasePanel open={caseOpen} onClose={() => setCaseOpen(false)} />

        {s.result && <ResultScreen result={s.result} onRestart={s.restart} />}

        {debug && (
          <p className="pointer-events-none absolute bottom-1 left-3 z-10 hidden text-[12px] text-ivory/70 lg:block">
            Sifat: {TIER_LABEL[tier]}
            {mobile ? ' (telefon)' : ''} · personaj — Meshy AI, zal — real vaqtli 3D
          </p>
        )}
      </div>
      </FloorContext.Provider>
    </SpeakerContext.Provider>
  )
}

/** ?debug=1: FPS, sifat, og'izni qo'lda ochish (face.json sozlash uchun) */
function DebugPanel({ tier, mobile }: { tier: Tier; mobile: boolean }) {
  const [fps, setFps] = useState(0)
  const [open, setOpen] = useState<number | null>(null)
  useEffect(() => {
    const id = window.setInterval(() => {
      setFps(director.fps)
      ;(window as unknown as { __fps?: number }).__fps = director.fps
    }, 500)
    return () => window.clearInterval(id)
  }, [])
  useEffect(() => {
    director.debugOpen = open
  }, [open])
  return (
    <div className="glass-strong absolute top-24 left-3 z-10 w-56 p-3 text-[12px] text-ivory/85">
      <p className="font-semibold text-gold-soft">Debug</p>
      <p>
        FPS: <span data-testid="fps">{fps}</span> · sifat {TIER_LABEL[tier]}
        {mobile ? ' (mobil)' : ''}
      </p>
      <p className="mt-1 text-ivory/70">Qizil — iyak sohasi, yashil — og'iz chizig'i (face.json)</p>
      <label className="mt-2 flex items-center gap-2">
        <input type="checkbox" checked={open !== null} onChange={(e) => setOpen(e.target.checked ? 0.8 : null)} />
        Og'izni qo'lda
      </label>
      {open !== null && (
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={open}
          onChange={(e) => setOpen(Number(e.target.value))}
          className="mt-1 w-full"
          aria-label="Og'iz ochilishi"
        />
      )}
    </div>
  )
}

function Loader() {
  const { active, progress } = useProgress()
  if (!active && progress >= 100) return null
  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-navy-950 bg-[radial-gradient(ellipse_at_center,#13223f_0%,#08111f_70%)] px-6 text-center"
      role="status"
      aria-live="polite"
    >
      <img src="/intro/casecraft-logo-900.webp" alt="CaseCraft" width={900} height={747} className="h-28 w-auto drop-shadow-[0_10px_40px_rgb(201_164_92/0.25)] sm:h-36" />
      <p className="font-display text-[28px] leading-tight font-semibold text-ivory sm:text-[32px]">Sud zali yuklanmoqda</p>
      <div className="h-0.5 w-56 overflow-hidden rounded-full bg-ivory/10" aria-hidden="true">
        <div className="loader-shimmer h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.max(4, Math.round(progress))}%` }} />
      </div>
      <p className="text-[13px] text-ivory/75">{Math.round(progress)}% · AI o'quv simulyatsiyasi</p>
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
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-navy-950 bg-[radial-gradient(ellipse_at_center,#13223f_0%,#08111f_70%)] p-6 text-center">
          <div className="glass-strong flex max-w-sm flex-col items-center gap-3 p-6">
            <img src="/intro/casecraft-emblem-128.webp" alt="" width={48} height={48} className="h-12 w-12" />
            <p className="font-display text-[26px] leading-tight font-semibold text-ivory">Sahna ochilmadi</p>
            <p className="text-[14px] text-ivory/80">{this.state.error}</p>
            <button type="button" onClick={() => window.location.reload()} className="btn-primary">
              Qayta yuklash
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
