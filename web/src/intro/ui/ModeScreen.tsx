import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import type { ModeId } from '../config'
import { actions, DOUBLE_CLICK_GUARD_MS, getState, msSincePhaseChange } from '../state'
import { playTick } from './audio'
import { MODES } from './content'
import { IconArrowRight, IconCap, IconGavel, IconUsers, Star8Frame } from './icons'
import { StageHeader } from './StageHeader'

const ICONS: Record<ModeId, ComponentType<{ className?: string }>> = {
  talim: IconCap,
  majlis: IconGavel,
  dostlar: IconUsers,
}

/** Tanlangan karta chegarasida oltin sweep (500 ms) tugagach rejimga o‘tamiz */
const CHOOSE_DELAY = 550

function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

/**
 * phase 'mode': uchta katta shisha karta. Ko‘rsatilgan karta zal yorug‘ini o‘zgartiradi (actions.hoverMode).
 * Klaviatura: 1/2/3 — tanlash, strelkalar — kartalar orasida, Enter — tanlash, Esc — orqaga (IntroApp).
 */
export function ModeScreen() {
  const [active, setActive] = useState(() => Math.max(0, MODES.findIndex((m) => m.id === getState().mode)))
  const [chosen, setChosen] = useState<ModeId | null>(null)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const activeRef = useRef(active)
  const chosenRef = useRef<ModeId | null>(null)
  const timer = useRef(0)

  /** karta ko‘rsatildi (sichqoncha, fokus, strelka): zal yorug‘i + yengil "tik" */
  const show = useCallback((i: number) => {
    if (chosenRef.current) return
    if (activeRef.current !== i) playTick()
    activeRef.current = i
    setActive(i)
    actions.hoverMode(MODES[i].id)
  }, [])

  const choose = useCallback((i: number) => {
    // "Boshlash"ni ikki marta bosish (mobilda u kartalar o‘rnida) rejimni o‘zi tanlab yubormasin
    if (chosenRef.current || msSincePhaseChange() < DOUBLE_CLICK_GUARD_MS) return
    const id = MODES[i].id
    chosenRef.current = id
    activeRef.current = i
    setActive(i)
    setChosen(id)
    actions.hoverMode(id)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    timer.current = window.setTimeout(() => actions.chooseMode(id), reduced ? 120 : CHOOSE_DELAY)
  }, [])

  // ekran ochilganda — ko‘rsatilgan kartaga mos yorug‘; yopilganda tozalaymiz
  useEffect(() => {
    actions.hoverMode(MODES[activeRef.current].id)
    return () => {
      window.clearTimeout(timer.current)
      actions.hoverMode(null)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return
      if (window.scrollY > window.innerHeight * 0.5) return
      const n = MODES.length
      const idx = ['1', '2', '3'].indexOf(e.key)
      if (idx >= 0 && idx < n) {
        e.preventDefault()
        choose(idx)
        return
      }
      const fwd = e.key === 'ArrowRight' || e.key === 'ArrowDown'
      const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp'
      if (fwd || back) {
        e.preventDefault()
        const next = (activeRef.current + (fwd ? 1 : -1) + n) % n
        show(next)
        refs.current[next]?.focus({ preventScroll: true })
        return
      }
      if (e.key === 'Enter') {
        const el = e.target as HTMLElement | null
        if (el?.closest?.('button, a, [role="button"]')) return // tugmaning o‘zi ishlaydi
        e.preventDefault()
        choose(activeRef.current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [choose, show])

  return (
    <>
      <StageHeader title="Rejimni tanlang" hint="Keyin rolingizni tanlaysiz" />
      {/* kartalar ekranning pastki qismida: ustida zal va personajlar ko‘rinadi, pastki chorak bo‘sh qolmaydi */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[calc(var(--stage-top)+5.5rem)] flex flex-col overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] [scrollbar-width:none] sm:top-[calc(var(--stage-top)+7.5rem)] sm:px-6 lg:pb-[5.25rem]">
        <ul
          role="list"
          aria-label="Majlis rejimlari"
          data-choosing={chosen ? 'true' : undefined}
          className="mode-list pointer-events-auto m-0 mx-auto mt-auto grid w-full max-w-[1180px] list-none gap-3 p-0 sm:gap-4 lg:grid-cols-3 lg:gap-6"
        >
          {MODES.map((m, i) => {
            const Icon = ICONS[m.id]
            return (
              <li key={m.id} className={`intro-rise intro-rise-d${i + 1}`}>
                <button
                  ref={(el) => {
                    refs.current[i] = el
                  }}
                  type="button"
                  data-active={active === i}
                  data-chosen={chosen === m.id ? 'true' : undefined}
                  data-dim={chosen && chosen !== m.id ? 'true' : undefined}
                  aria-disabled={chosen ? true : undefined}
                  onClick={() => choose(i)}
                  onFocus={() => show(i)}
                  onPointerEnter={() => show(i)}
                  className="glass-strong mode-card h-full w-full items-center gap-4 p-4 sm:p-5 lg:flex-col lg:items-center lg:gap-0 lg:px-7 lg:pb-8 lg:pt-8 lg:text-center"
                >
                  {/* fon rasmi (bezak): /intro/art/mode-{id}.webp — ustida navy gradient (intro.css .mode-art) */}
                  <span className="mode-art" aria-hidden>
                    <img src={`/intro/art/mode-${m.id}.webp`} alt="" width={1200} height={800} loading="lazy" decoding="async" draggable={false} />
                  </span>
                  <span
                    className="absolute right-3 top-3 hidden size-7 items-center justify-center rounded-md border border-ivory/20 text-xs font-bold text-ivory/60 lg:inline-flex"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <span className={'mode-icon size-16 sm:size-[4.5rem] lg:size-[6.5rem] ' + (m.soon ? 'opacity-80' : '')} aria-hidden>
                    <Star8Frame className="mode-icon-star" />
                    <Icon className="relative size-7 sm:size-8 lg:size-10" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col lg:items-center">
                    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 lg:mt-5 lg:flex-col lg:gap-3">
                      <span className="font-display text-[1.6rem] font-semibold leading-none text-ivory sm:text-[1.9rem] lg:text-[2.4rem]">
                        {m.title}
                      </span>
                      <span
                        className={
                          'pill-gold pill-gold-sm lg:order-first ' +
                          (m.soon ? 'border-ivory/30 text-ivory/75' : 'text-gold-soft')
                        }
                      >
                        {m.badge}
                      </span>
                    </span>
                    <span className="mt-1.5 block text-[0.92rem] leading-snug text-ivory/85 sm:text-base lg:mt-4 lg:min-h-[3.2em] lg:text-[1.05rem] lg:leading-relaxed">
                      {m.text}
                    </span>
                    <span className="mt-6 hidden items-center gap-2 font-semibold text-gold-soft lg:inline-flex" aria-hidden>
                      {m.soon ? 'Namunani ko‘rish' : 'Tanlash'}
                      <IconArrowRight className="mode-arrow size-5" />
                    </span>
                  </span>
                  <IconArrowRight className="mode-arrow size-5 shrink-0 text-gold-soft lg:hidden" />
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      <p className="pointer-events-none absolute inset-x-0 bottom-9 m-0 hidden text-center text-xs text-ivory/65 lg:block">
        <kbd className="font-sans">1</kbd> <kbd className="font-sans">2</kbd> <kbd className="font-sans">3</kbd> — tanlash ·{' '}
        <kbd className="font-sans">←</kbd> <kbd className="font-sans">→</kbd> — almashtirish · Enter — tasdiq · Esc — orqaga
      </p>
    </>
  )
}
