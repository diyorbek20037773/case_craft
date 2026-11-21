import { useProgress } from '@react-three/drei'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Credits } from './Credits'
import { CourtScene, INITIAL_VIEW, SPEAKERS, VIEWS, VIEW_ORDER, type SpeakerId, type ViewId } from './scene'

interface Subtitle {
  speaker: SpeakerId | 'defense'
  text: string
}

// Demo matnlar — keyin AI javoblari bilan almashtiriladi
const INITIAL_SUBTITLE: Subtitle = {
  speaker: 'judge',
  text: "Sud majlisi davom etadi. Himoyachi, guvohga savollaringiz bo'lsa, berishingiz mumkin.",
}
const DEMO_REPLY: Subtitle = {
  speaker: 'judge',
  text: "Himoyachi, savolingizni aniq va qisqa bering. Yo'naltiruvchi savollarga yo'l qo'yilmaydi.",
}
const DEMO_SPEAK_MS = 3000

function speakerLabel(s: Subtitle['speaker']) {
  return s === 'defense' ? 'Himoyachi (siz)' : SPEAKERS[s].label
}

export default function App() {
  const [view, setView] = useState<ViewId>(INITIAL_VIEW)
  const [speaking, setSpeaking] = useState<SpeakerId | null>(null)
  const [subtitle, setSubtitle] = useState<Subtitle>(INITIAL_SUBTITLE)
  const [creditsOpen, setCreditsOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const onSpeak = useCallback(() => {
    window.clearTimeout(timer.current)
    setSubtitle(DEMO_REPLY)
    setSpeaking('judge')
    timer.current = window.setTimeout(() => setSpeaking(null), DEMO_SPEAK_MS)
  }, [])

  const busy = speaking !== null
  const closeCredits = useCallback(() => setCreditsOpen(false), [])

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#1a1714] text-white">
      <CourtScene view={view} speaking={speaking} className="!absolute inset-0" />
      <LoadingOverlay />

      {/* Yuqori panel */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 bg-gradient-to-b from-black/60 to-transparent px-3 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold tracking-wide">Sud trenajyori</h1>
          <p className="mt-0.5 text-[11px] text-amber-200/90">AI o'quv simulyatsiyasi · real sud qarori emas</p>
        </div>
        <button
          type="button"
          onClick={() => setCreditsOpen(true)}
          className="pointer-events-auto shrink-0 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-[11px] text-slate-200 backdrop-blur hover:bg-black/60 focus-visible:outline-2 focus-visible:outline-amber-400"
        >
          Mualliflar
        </button>
      </header>

      {/* Pastki panel */}
      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 via-black/60 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-10">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
          {/* Subtitr */}
          <section
            aria-live="polite"
            className={[
              'rounded-2xl border px-4 py-3 backdrop-blur-md transition-colors duration-300',
              busy ? 'border-amber-300/60 bg-slate-950/80' : 'border-white/10 bg-slate-950/70',
            ].join(' ')}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
              {speakerLabel(subtitle.speaker)}
            </p>
            <p className="mt-1 text-[15px] leading-snug text-slate-50">{subtitle.text}</p>
          </section>

          {/* Kamera nuqtalari */}
          <nav aria-label="Kamera nuqtalari" className="-mx-3 overflow-x-auto px-3 [scrollbar-width:none]">
            <div className="flex w-max gap-2 sm:w-full sm:justify-center">
              {VIEW_ORDER.map((id) => {
                const active = id === view
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setView(id)}
                    aria-pressed={active}
                    className={[
                      'min-h-10 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-amber-400',
                      active
                        ? 'border-amber-300 bg-amber-300 text-slate-950'
                        : 'border-white/15 bg-white/10 text-slate-100 hover:bg-white/20',
                    ].join(' ')}
                  >
                    {VIEWS[id].label}
                  </button>
                )
              })}
            </div>
          </nav>

          {/* Gapirish */}
          <button
            type="button"
            onClick={onSpeak}
            disabled={busy}
            className="flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-amber-400 text-base font-semibold text-slate-950 shadow-lg shadow-amber-500/20 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300 disabled:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
          >
            <MicIcon />
            {busy ? `${SPEAKERS[speaking].label} gapirmoqda…` : 'Gapirish'}
          </button>
        </div>
      </div>

      {creditsOpen && <Credits onClose={closeCredits} />}
    </div>
  )
}

function LoadingOverlay() {
  const { active, progress } = useProgress()
  const [shown, setShown] = useState(true)
  useEffect(() => {
    if (!active) {
      const t = window.setTimeout(() => setShown(false), 250)
      return () => window.clearTimeout(t)
    }
    setShown(true)
  }, [active])
  if (!shown) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 z-30 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/70 px-4 py-2 text-xs text-slate-200 backdrop-blur">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" aria-hidden />
        Sud zali yuklanmoqda… {Math.round(progress)}%
      </div>
    </div>
  )
}

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v4" />
    </svg>
  )
}
