// Rol tushuntiruvchi slaydlar — modal oyna (fokus tuzog‘i, Esc, ←/→, svayp, chiziqli indikator).
// Ishlatish: <RoleSlides role="guvoh" open={open} onClose={() => setOpen(false)} onChooseRole={chooseHimoyachi} />
// Slayd almashuvi: 220 ms crossfade + 12px siljish, playTick; portretda Ken Burns (1→1.06, 8 s) va ±6px parallaks.
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { PointerEvent, ReactNode, TouchEvent } from 'react'
import { createPortal } from 'react-dom'
import { useIntro } from '../../state'
import { playTick } from '../audio'
import { portraitCaption } from '../portraits'
import { slidesData } from './slidesData'
import type { Passport, RoleDeck, Slide, SlideRole } from './slidesData'
import { SlideIconSvg } from './slideIcons'
import './roleSlides.css'

export type { RoleDeck, Slide, SlideRole }

export type RoleSlidesProps = {
  role: SlideRole
  open: boolean
  onClose: () => void
  /** himoyachi oxirgi slaydidagi "Himoyachi sifatida davom etish" tugmasi */
  onChooseRole?: () => void
}

const AI_LABEL = 'AI o‘quv simulyatsiyasi'
const CTA_LABEL = 'Himoyachi sifatida davom etish'
const SWIPE_PX = 48
/** chiqib ketayotgan slayd shuncha ms dan keyin olib tashlanadi (animatsiya 220 ms) */
const LEAVE_MS = 260
const PARALLAX_PX = 6
/** "Keyingi" ikki marta tez bosilsa, ikkinchi bosish oxirgi slayddagi (shu joyda paydo bo‘lgan) "Yopish" ga tushmasin */
const CLOSE_GUARD_MS = 450

function prefersReducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function RoleSlides({ role, open, onClose, onChooseRole }: RoleSlidesProps) {
  if (!open || typeof document === 'undefined') return null
  // key: rol yoki ochilish o‘zgarsa — 1-slayddan boshlanadi
  return createPortal(<Deck key={role} role={role} onClose={onClose} onChooseRole={onChooseRole} />, document.body)
}

type Dir = 'next' | 'prev' | 'none'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function Deck({ role, onClose, onChooseRole }: Omit<RoleSlidesProps, 'open'>) {
  const deck = slidesData[role] ?? slidesData.himoyachi
  const total = deck.slides.length
  const quality = useIntro((s) => s.quality)
  // prev — chiqib ketayotgan slayd (crossfade uchun), seq — har almashuvda +1
  const [{ index, dir, prev, seq }, setPos] = useState<{ index: number; dir: Dir; prev: number | null; seq: number }>({
    index: 0,
    dir: 'none',
    prev: null,
    seq: 0,
  })
  const dialogRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const titleId = useId()
  const descId = useId()

  const slide = deck.slides[index]
  const isLast = index === total - 1
  const showCta = slide.kind === 'tips' && deck.playable

  const go = useCallback(
    (to: number) => {
      setPos((p) => {
        const t = Math.max(0, Math.min(total - 1, to))
        return t === p.index ? p : { index: t, dir: t > p.index ? 'next' : 'prev', prev: p.index, seq: p.seq + 1 }
      })
    },
    [total],
  )
  const step = useCallback(
    (d: 1 | -1) =>
      setPos((p) => {
        const t = Math.max(0, Math.min(total - 1, p.index + d))
        return t === p.index ? p : { index: t, dir: d > 0 ? 'next' : 'prev', prev: p.index, seq: p.seq + 1 }
      }),
    [total],
  )

  // Slayd almashdi: yengil "tiq" (faqat ovoz yoqilgan bo‘lsa yangraydi) va chiqayotgan slaydni tozalash
  const changedAt = useRef(-1e9)
  useEffect(() => {
    if (seq === 0) return
    changedAt.current = performance.now()
    playTick()
    const t = window.setTimeout(() => setPos((p) => (p.seq === seq ? { ...p, prev: null } : p)), LEAVE_MS)
    return () => window.clearTimeout(t)
  }, [seq])

  // Portret parallaksi (faqat sichqoncha, harakat cheklanmagan va lite bo‘lmagan holatda)
  const motionOk = quality !== 'low' && !prefersReducedMotion()
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = stageRef.current
    if (!el || !motionOk || e.pointerType !== 'mouse') return
    const r = el.getBoundingClientRect()
    const nx = (e.clientX - r.left) / r.width - 0.5
    const ny = (e.clientY - r.top) / r.height - 0.5
    el.style.setProperty('--rs-px', `${(-nx * 2 * PARALLAX_PX).toFixed(2)}px`)
    el.style.setProperty('--rs-py', `${(-ny * 2 * PARALLAX_PX).toFixed(2)}px`)
  }
  const onPointerLeave = () => {
    const el = stageRef.current
    if (!el) return
    el.style.removeProperty('--rs-px')
    el.style.removeProperty('--rs-py')
  }

  // Eng so‘nggi onClose — klaviatura effektini qayta ulamaslik uchun
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  // Ochilganda: fokusni ichkariga, sahifa aylantirishini to‘xtatish; yopilganda fokusni qaytarish
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null
    const html = document.documentElement
    const prevOverflow = html.style.overflow
    html.style.overflow = 'hidden'
    nextRef.current?.focus({ preventScroll: true })
    return () => {
      html.style.overflow = prevOverflow
      if (prevFocus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true })
    }
  }, [])

  // Klaviatura: window capture — orqadagi sahna (IntroApp) tugmalari ishlamasin
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dlg = dialogRef.current
      if (!dlg) return
      e.stopPropagation()
      if (e.altKey || e.ctrlKey || e.metaKey) return
      // Enter/Probel bosib turilsa — tugma qayta-qayta bosilib, oxirida modal yopilib ketmasin
      if (e.repeat && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        step(1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        step(-1)
      } else if (e.key === 'Tab') {
        const items = Array.from(dlg.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (el) => el.offsetParent !== null || el === document.activeElement,
        )
        if (items.length === 0) {
          e.preventDefault()
          dlg.focus()
          return
        }
        const first = items[0]
        const last = items[items.length - 1]
        const active = document.activeElement as HTMLElement | null
        const inside = !!active && dlg.contains(active) && active !== dlg
        if (e.shiftKey && (!inside || active === first)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && (!inside || active === last)) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [step])

  // Slayd almashganda fokus yo‘qolib qolsa (masalan CTA yo‘qoldi) — dialogga qaytarish
  useEffect(() => {
    const dlg = dialogRef.current
    if (dlg && !dlg.contains(document.activeElement)) dlg.focus({ preventScroll: true })
  }, [index])

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]
    touch.current = t ? { x: t.clientX, y: t.clientY } : null
  }
  const onTouchEnd = (e: TouchEvent) => {
    const s = touch.current
    touch.current = null
    const t = e.changedTouches[0]
    if (!s || !t) return
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.3) step(dx < 0 ? 1 : -1)
  }

  return (
    <div
      className={quality === 'low' ? 'rs-overlay is-low' : 'rs-overlay'}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="rs-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={slide.lead ? descId : undefined}
        tabIndex={-1}
      >
        <header className="rs-head">
          <img className="rs-avatar" src={deck.portrait} alt="" width={44} height={44} decoding="async" />
          <div className="rs-head-text">
            <h2 id={titleId} className="rs-role">
              {deck.name}
            </h2>
            <p className="rs-status">{deck.status}</p>
          </div>
          <span className={deck.playable ? 'rs-badge rs-badge--you' : 'rs-badge'}>{deck.badge}</span>
          <span className="rs-ai-label">{AI_LABEL}</span>
          <button type="button" className="rs-icon-btn rs-close" onClick={onClose} aria-label="Yopish">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div
          ref={stageRef}
          className="rs-stage"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
        >
          {prev !== null && deck.slides[prev] && (
            <SlideView
              key={`out-${seq}`}
              deck={deck}
              slide={deck.slides[prev]}
              dir={dir}
              leaving
              label=""
              descId=""
              cta={null}
            />
          )}
          <SlideView
            key={index}
            deck={deck}
            slide={slide}
            dir={dir}
            label={`${index + 1} / ${total}`}
            descId={descId}
            cta={
              showCta && onChooseRole ? (
                <button type="button" className="rs-btn rs-btn--primary rs-cta" onClick={onChooseRole}>
                  {CTA_LABEL}
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </button>
              ) : null
            }
          />
        </div>

        <footer className="rs-nav">
          <button
            type="button"
            className="rs-btn rs-btn--ghost rs-prev"
            onClick={() => step(-1)}
            disabled={index === 0}
            aria-label="Oldingi slayd"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M19 12H5M11 6l-6 6 6 6" />
            </svg>
            <span className="rs-btn-text">Oldingi</span>
          </button>

          <div className="rs-progress">
            <div className="rs-dots">
              {deck.slides.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  className={i === index ? 'rs-dot is-active' : 'rs-dot'}
                  onClick={() => go(i)}
                  aria-label={`${i + 1}-slayd: ${s.kicker}`}
                  aria-current={i === index ? 'step' : undefined}
                />
              ))}
            </div>
            <span className="rs-count" aria-hidden="true">
              {index + 1} / {total}
            </span>
          </div>

          {isLast ? (
            <button
              ref={nextRef}
              type="button"
              className="rs-btn rs-btn--ghost rs-next"
              onClick={() => {
                if (performance.now() - changedAt.current < CLOSE_GUARD_MS) return
                onClose()
              }}
            >
              <span className="rs-btn-text rs-btn-text--always">Yopish</span>
            </button>
          ) : (
            <button
              ref={nextRef}
              type="button"
              className="rs-btn rs-btn--primary rs-next"
              onClick={() => step(1)}
              aria-label="Keyingi slayd"
            >
              <span className="rs-btn-text">Keyingi</span>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          )}
        </footer>

        <p className="rs-sr" aria-live="polite">
          {`${index + 1} / ${total}: ${slide.kicker}. ${slide.title}`}
        </p>
      </div>
    </div>
  )
}

function SlideView({
  deck,
  slide,
  dir,
  label,
  descId,
  cta,
  leaving = false,
}: {
  deck: RoleDeck
  slide: Slide
  dir: Dir
  label: string
  descId: string
  cta: ReactNode
  /** chiqib ketayotgan nusxa: faqat ko‘rinish, fokus va o‘qish yo‘q */
  leaving?: boolean
}) {
  const isWho = slide.kind === 'who'
  const passport = slide.passport
  const caption = portraitCaption(deck.role)
  const visualClass = isWho
    ? 'rs-visual rs-visual--portrait'
    : passport
      ? 'rs-visual rs-visual--icon rs-visual--passport'
      : 'rs-visual rs-visual--icon'
  return (
    <section
      className={`rs-slide rs-slide--${slide.kind} ${leaving ? `rs-leave rs-leave-${dir}` : `rs-enter-${dir}`}`}
      aria-roledescription={leaving ? undefined : 'slayd'}
      aria-label={leaving ? undefined : label}
      aria-hidden={leaving || undefined}
      inert={leaving || undefined}
    >
      <div className={visualClass}>
        {isWho ? (
          <figure className="rs-portrait">
            <img src={deck.portrait} alt={`${deck.name} — portret`} width={480} height={640} decoding="async" />
            <span className="rs-portrait-grade" aria-hidden="true" />
            {caption && <figcaption className="rs-portrait-caption">{caption}</figcaption>}
          </figure>
        ) : (
          <>
            <img className="rs-visual-bg" src={deck.portrait} alt="" aria-hidden="true" decoding="async" />
            {passport ? (
              <PassportCard deck={deck} passport={passport} caption={caption} />
            ) : (
              <div className="rs-medallion" aria-hidden="true">
                <SlideIconSvg name={slide.icon} className="rs-medallion-icon" />
              </div>
            )}
          </>
        )}
      </div>

      <div className="rs-text">
        <p className="rs-kicker">
          {isWho && <SlideIconSvg name={slide.icon} className="rs-kicker-icon" />}
          {slide.kicker}
        </p>
        <h3 className="rs-title">{slide.title}</h3>
        {slide.lead && (
          <p id={descId} className="rs-lead">
            {slide.lead}
          </p>
        )}
        {slide.bullets && slide.bullets.length > 0 && (
          <ul className="rs-list">
            {slide.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
        {slide.source && <span className="rs-source">{slide.source}</span>}
        {cta}
      </div>
    </section>
  )
}

const PASSPORT_ROWS: { key: keyof Omit<Passport, 'engine'>; label: string }[] = [
  { key: 'model', label: 'Model' },
  { key: 'knows', label: 'Biladi' },
  { key: 'rule', label: 'Qoidani' },
  { key: 'voice', label: 'Ovoz' },
]

/** "AI pasport": rolning texnik tavsifi — faqat backend'da haqiqatan bor xususiyatlar */
function PassportCard({ deck, passport, caption }: { deck: RoleDeck; passport: Passport; caption: string | null }) {
  // AI pasport — faqat LLM agentlari (sudya, prokuror, guvoh); kod yuritadigan rollar — texnik pasport
  const heading = passport.engine === 'llm' ? 'AI pasport' : 'Texnik pasport'
  return (
    <div className="rs-passport" role="group" aria-label={`${heading}: ${deck.name}`}>
      <div className="rs-passport-head">
        <svg className="rs-passport-star" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 2l2.6 4.2L19 4.9l-1.3 4.5L22 12l-4.3 2.6L19 19.1l-4.4-1.3L12 22l-2.6-4.2L5 19.1l1.3-4.5L2 12l4.3-2.6L5 4.9l4.4 1.3z" />
        </svg>
        <span className="rs-passport-title">{heading}</span>
        <span className={passport.engine === 'llm' ? 'rs-passport-engine is-llm' : 'rs-passport-engine'}>
          {passport.engine === 'llm' ? 'LLM + kod' : 'Kod'}
        </span>
      </div>
      <div className="rs-passport-body">
        <figure className="rs-passport-photo">
          <img src={deck.portrait} alt="" width={96} height={128} decoding="async" />
          <figcaption>
            <span className="rs-passport-name">{deck.name}</span>
            {caption && <span className="rs-passport-note">{caption}</span>}
          </figcaption>
        </figure>
        <dl className="rs-passport-rows">
          {PASSPORT_ROWS.map((r, i) => (
            <div key={r.key} className="rs-passport-row" style={{ animationDelay: `${120 + i * 60}ms` }}>
              <dt>{r.label}</dt>
              <dd>{passport[r.key]}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
