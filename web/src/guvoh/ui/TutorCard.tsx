// AI ustoz (faqat talim rejimi): sahna personaji emas — portretli karta. Bosqich boshida 1–2 gap + tanlov kartalari,
// xatoda "Vaqt to'xtadi" overlay (qoida matni + qayta urinish). Ustoz gaplari bayonnomaga yozilmaydi (server).
import { useEffect, useRef, useState } from 'react'
import type { Tutor, TutorChoice } from '../api'
import { CapIcon, PauseIcon } from './icons'

export function TutorAvatar({ size = 36, speaking = false }: { size?: number; speaking?: boolean }) {
  return (
    <span
      className={`relative grid shrink-0 place-items-center rounded-full border border-gold/60 bg-[radial-gradient(circle_at_30%_25%,#1c2f54,#0c1629)] text-gold-soft ${speaking ? 'shadow-[0_0_0_3px_rgb(201_164_92/0.35)]' : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <CapIcon size={Math.round(size * 0.58)} />
      {speaking && <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-gold-soft" />}
    </span>
  )
}

function ChoiceCards({ choices, disabled, onChoose }: { choices: TutorChoice[]; disabled: boolean; onChoose: (c: TutorChoice) => void }) {
  if (!choices.length) return null
  return (
    <div className="mt-2 grid gap-1.5 sm:grid-cols-2" role="group" aria-label="Ustoz taklif qilgan variantlar">
      {choices.map((c) => (
        <button
          key={c.id + c.label_uz}
          type="button"
          disabled={disabled}
          onClick={() => onChoose(c)}
          title={c.text_uz || c.label_uz}
          className="min-h-11 rounded-[10px] border border-gold/35 bg-navy-900/50 px-3 py-2 text-left transition duration-150 hover:-translate-y-px hover:border-gold-soft hover:bg-gold/15 active:scale-[0.98] disabled:opacity-45"
        >
          <span className="block text-[14px] font-semibold text-ivory">{c.label_uz}</span>
          {c.text_uz && !c.action && <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-ivory/75">{c.text_uz}</span>}
          {c.action && <span className="mt-0.5 block text-[12px] text-gold-soft">harakat · bir bosishda</span>}
        </button>
      ))}
    </div>
  )
}

interface CardProps {
  tutor: Tutor
  speaking: boolean
  disabled: boolean
  onChoose: (c: TutorChoice) => void
  /** Telefon: faqat birinchi gapda ochiq, keyin bir qator + "Variantlar" (sahnani yopmasin) */
  compact?: boolean
}

/** Sessiyada ustoz kartasi birinchi marta ko'rsatildimi (telefonda faqat birinchisi o'zi ochiladi) */
let firstShown = false

/** Ustoz kartasi (dock ichida). Noutbukda yangi gap kelsa o'zi ochiladi; yig'ib qo'yish mumkin */
export function TutorCard({ tutor, speaking, disabled, onChoose, compact = false }: CardProps) {
  const [open, setOpen] = useState(() => !compact || !firstShown)
  useEffect(() => {
    firstShown = true
  }, [])
  const last = useRef(tutor)
  useEffect(() => {
    if (!compact && last.current !== tutor && (tutor.say_uz !== last.current.say_uz || tutor.choices.length > 0)) setOpen(true)
    last.current = tutor
  }, [tutor, compact])
  const hasBody = !!tutor.say_uz || tutor.choices.length > 0
  const n = tutor.choices.length

  return (
    <section aria-label="Ustoz" className="glass-strong px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <TutorAvatar speaking={speaking} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold tracking-[0.08em] text-gold-soft uppercase">Ustoz</p>
          {!open && tutor.say_uz && <p className="truncate text-[13px] text-ivory/75">{stripReviewNote(tutor.say_uz)}</p>}
        </div>
        {hasBody && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className={open ? 'link-btn shrink-0 text-[13px] no-underline' : 'btn-secondary min-h-11 shrink-0 px-3 text-[13px]'}
          >
            {open ? "Yig'ish" : n > 0 ? `Variantlar · ${n}` : 'Ochish'}
          </button>
        )}
      </div>
      {open && hasBody && (
        <div className="thin-scroll max-h-[26dvh] overflow-y-auto">
          {tutor.say_uz && (
            <p className="mt-1.5 text-[15px] leading-snug text-ivory/95" aria-live="polite">
              {stripReviewNote(tutor.say_uz)}
            </p>
          )}
          <ChoiceCards choices={tutor.choices} disabled={disabled} onChoose={onChoose} />
        </div>
      )}
    </section>
  )
}

interface PauseProps {
  tutor: Tutor
  speaking: boolean
  disabled: boolean
  onChoose: (c: TutorChoice) => void
  onResume: () => void
}

/**
 * Tekshirilmagan modda matni oxiridagi ichki izohni olib tashlaydi: «(Mazmuni; rus tahriri bo'yicha tekshirildi,
 * o'zbekcha matn lex.uz da tasdiqlanishi kerak.)» — talabaga faqat «(yurist tekshiruvi kutilmoqda)» ko'rinadi
 */
function stripReviewNote(t: string) {
  return t.replace(/\s*\([^()]*(?:Mazmuni|rus tahriri|lex\.uz|tasdiqlanishi kerak)[^()]*\)\s*/gi, ' ').trim()
}

const RETRY_RX = /Qayta urinib ko['’ʻʼ‘`]ring\./
const count = (t: string, ch: string) => t.split(ch).length - 1

/**
 * Overlay matni. Qoidabuzarlikda server: «Vaqt to'xtadi. <nom>. <ref>: <sarlavha>. <matn> Qayta urinib ko'ring.[ <qo'shimcha>]»
 * — modda alohida kartada ko'rsatilgani uchun faqat «<ref>: … Qayta urinib ko'ring.» bo'lagi olib tashlanadi (ovozda to'liq).
 * Kesish faqat aniq shu shaklda: event 'violation' (yoki eski server — event yo'q), «<ref>:» topilgan, undan oldingi qism
 * iqtibos «…» yoki qavs ichida emas va «Qayta urinib ko'ring.» undan keyin bor. Aks holda (masalan, motion_missed —
 * iqtibos ichida «JPK 102-modda» bor) matn to'liq ko'rsatiladi: gap hech qachon o'rtasidan kesilmaydi.
 */
function pauseText(tutor: Pick<Tutor, 'say_uz' | 'rule' | 'event'>): string {
  const full = stripReviewNote(tutor.say_uz ?? '').replace(/^Vaqt to['’ʻʼ‘`]xtadi\.\s*/i, '').trim()
  const ref = tutor.rule?.ref?.trim()
  if (!ref || (tutor.event && tutor.event !== 'violation')) return full
  const at = full.indexOf(`${ref}:`)
  if (at <= 0) return full
  const head = full.slice(0, at)
  if (count(head, '«') !== count(head, '»') || count(head, '(') !== count(head, ')') || count(head, '"') % 2) return full
  const rest = full.slice(at)
  const m = RETRY_RX.exec(rest)
  if (!m) return full
  const tail = rest.slice(m.index + m[0].length).trim()
  return [head.trim(), "Qayta urinib ko'ring.", tail].filter(Boolean).join(' ')
}

/** "Vaqt to'xtadi": sahna kulrang tusga kiradi (GuvohApp), ustoz nima bo'lganini qoida bilan tushuntiradi */
export function PauseOverlay({ tutor, speaking, disabled, onChoose, onResume }: PauseProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onResume()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onResume])
  const say = pauseText(tutor)
  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-navy-950/40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center">
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-title"
        className="glass-strong stagger-in thin-scroll max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto p-4 text-ivory outline-none sm:p-5"
      >
        <div className="flex items-center gap-3">
          <TutorAvatar size={48} speaking={speaking} />
          <div>
            <p id="pause-title" className="flex items-center gap-2 font-display text-[28px] leading-none font-semibold text-gold-soft">
              <PauseIcon size={22} />
              Vaqt to'xtadi
            </p>
            <p className="mt-1 text-[13px] text-ivory/75">Ustoz · ta'lim rejimi</p>
          </div>
        </div>
        {say && <p className="thin-scroll mt-3 max-h-[24dvh] overflow-y-auto text-[16px] leading-snug text-ivory/95">{say}</p>}
        {tutor.rule && (
          <div className="mt-3 rounded-[10px] border border-gold/40 border-l-4 border-l-gold bg-gold/10 p-3">
            <p className="text-[14px] font-semibold text-gold-soft">
              {tutor.rule.ref} · {tutor.rule.title_uz}
            </p>
            <p className="thin-scroll mt-1 max-h-[18dvh] overflow-y-auto text-[14px] leading-snug text-ivory/85">
              {tutor.rule.verified ? tutor.rule.text_uz : stripReviewNote(tutor.rule.text_uz)}
            </p>
            {!tutor.rule.verified && <p className="mt-1 text-[12px] text-ivory/70">(yurist tekshiruvi kutilmoqda)</p>}
          </div>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {tutor.choices.map((c) => (
            <button
              key={c.id + c.label_uz}
              type="button"
              disabled={disabled}
              onClick={() => onChoose(c)}
              title={c.text_uz || c.label_uz}
              className="btn-primary flex-1 px-4 text-[14px]"
            >
              Qayta urinish: {c.label_uz}
            </button>
          ))}
          <button type="button" onClick={onResume} className="btn-secondary min-h-12 flex-1 px-4">
            {tutor.choices.length ? "O'zim yozaman" : 'Tushundim, davom etish'}
          </button>
        </div>
      </div>
    </div>
  )
}
