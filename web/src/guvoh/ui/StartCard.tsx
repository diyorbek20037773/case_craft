import { useMemo, type ComponentType } from 'react'
import type { Mode } from '../api'
import { CapIcon, ChartIcon, EarIcon, GavelIcon, PauseIcon } from './icons'

type Step = { icon: ComponentType<{ size?: number; className?: string }>; text: string }

const COPY: Record<Mode, { kicker: string; title: string; steps: Step[]; cta: string }> = {
  majlis: {
    kicker: 'Sud majlisi · imtihon',
    title: 'Siz — sudlanuvchining himoyachisisiz',
    steps: [
      { icon: GavelIcon, text: "So'zni raislik qiluvchi beradi — «So'z so'rash» tugmasini bosing." },
      { icon: EarIcon, text: "Prokuror savollarini tinglang: noto'g'ri savolda «Raislik qiluvchiga murojaat» qiling." },
      { icon: ChartIcon, text: 'Guvohni ochiq savollar bilan so\'roq qiling. Maslahat yo\'q, baho 5 mezon bo\'yicha.' },
    ],
    cta: 'Majlisni boshlash',
  },
  talim: {
    kicker: "Ta'lim rejimi · ustoz bilan",
    title: 'Himoyachi sifatida mashq qiling',
    steps: [
      { icon: CapIcon, text: 'Ustoz har bosqichni 1–2 gapda tushuntiradi va variantlar beradi.' },
      { icon: PauseIcon, text: "Xato qilsangiz — «Vaqt to'xtadi»: ustoz qoidani ko'rsatadi, qayta urinasiz." },
      { icon: ChartIcon, text: '3 ta maslahat bor (natijada ko\'rinadi). Yakunda baho va bayonnoma.' },
    ],
    cta: 'Mashqni boshlash',
  },
}

/** Kirish kartasi: rejimga mos vazifa va boshlash (bosish ovozni ham ochadi — autoplay qoidasi) */
export function StartCard({ mode, busy, error, onStart, onCase }: { mode: Mode; busy: boolean; error: string | null; onStart: () => void; onCase: () => void }) {
  const c = COPY[mode]
  // intro'dan kelganda (URL da role/mode) — "Zalga kirish": intro'dagi "Majlisni boshlash" takrorlanmasin; bosish ovozni ochadi
  const fromIntro = useMemo(() => {
    const q = new URLSearchParams(window.location.search)
    return q.has('role') || q.has('mode')
  }, [])
  const cta = fromIntro ? 'Zalga kirish' : c.cta
  return (
    <>
      <div className="start-vignette pointer-events-none absolute inset-0 z-[5]" aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 z-20 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-6">
        <div className="glass-strong stagger-in mx-auto max-w-[31rem] p-5 text-ivory sm:p-6">
          <img src="/intro/casecraft-logo-900.webp" alt="CaseCraft" width={900} height={747} className="mx-auto -mt-1 mb-2 h-14 w-auto sm:h-16" />
          <p className="eyebrow text-center">{c.kicker}</p>
          <h1 className="mt-1.5 text-center font-display text-[28px] leading-tight font-semibold text-ivory">{c.title}</h1>
          <div className="hairline mx-auto my-3.5 w-2/3" />
          <ul className="space-y-2">
            {c.steps.map((s) => (
              <li key={s.text} className="flex gap-3 text-[15px] leading-snug text-ivory/90">
                <span className="mt-px grid h-7 w-7 shrink-0 place-items-center rounded-full border border-gold/50 text-gold-soft"><s.icon size={15} /></span>
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
          {error && (
            <p className="mt-3 rounded-[10px] border border-rose-400/60 border-l-4 bg-rose-950/60 px-3 py-2 text-[14px] text-rose-50" role="alert">
              {error}
            </p>
          )}
          <div className="mt-4 flex flex-col items-center gap-1">
            <button type="button" onClick={onStart} disabled={busy} className="btn-primary w-full sm:w-[60%] sm:min-w-[16rem]">
              {busy && <span className="spin" aria-hidden="true" />}
              {busy ? 'Majlis ochilmoqda…' : error ? 'Qayta urinish' : cta}
            </button>
            <button type="button" onClick={onCase} className="link-btn">
              Ish bilan tanishish
            </button>
          </div>
          <p className="mt-1 text-center text-[13px] text-ivory/75">Ovoz yoqilgan bo'lsin. Javoblarni AI yaratadi — bu o'quv mashqi.</p>
        </div>
      </div>
    </>
  )
}
