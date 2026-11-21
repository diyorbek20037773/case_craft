// "Jinoyat ishi" papkasi: muqova ochiladi, sahifalar 3D varaqlanadi (CSS transform, kutubxonasiz).
// Ota komponent fonni (3D sahna, qorong‘ilashtirish) beradi; bu komponent foni shaffof.
//
// Ishlatish:
//   <CaseBook onStart={actions.launch} onBack={actions.back} soundOn={soundOn} />
// Ildiz element `position: absolute; inset: 0` — to‘liq ekranli, `position: relative` konteyner ichiga qo‘ying.
// Yuqoridagi TopBar uchun joy: CSS o‘zgaruvchi `--cb-top` (standart 64px), masalan style={{ '--cb-top': '72px' }}.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as RPointerEvent,
  type ReactNode,
} from 'react'
import './caseBook.css'
import { Emblem } from './caseArt'
import { CASE_FILE, PAGE_COUNT, SECTIONS } from './caseData'
import { BlankPaper, SectionPage, type PageCtx } from './CasePages'
import { playCoverOpen, playPageFlip } from './paperSound'
import { useIntro } from '../../state'

export type CaseBookProps = {
  onStart: () => void
  onBack: () => void
  soundOn?: boolean
}

const FLIP_MS = 900
const SINGLE_FLIP_MS = 640
const COVER_DELAY_MS = 700
const COVER_MS = 1200

type Phase = 'closed' | 'opening' | 'open'
type Flip = { from: number; to: number; dir: 1 | -1; id: number }

function useMedia(query: string) {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = window.matchMedia(query)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

// Shriftlar sahifaning o‘zida: Lora, Courier Prime — intro.css; Caveat (qo‘lyozma) — caseBook.css @font-face.
// Tashqi (Google Fonts) so‘rov yo‘q.

function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

/** Sahifalar to‘dasi chekkasi (qolgan varaqlar soniga qarab) */
function stackShadow(layers: number, side: 'left' | 'right') {
  const n = Math.max(0, Math.min(4, layers))
  if (!n) return undefined
  const sx = side === 'right' ? 1 : -1
  const tones = ['#efe6cf', '#e3d7ba', '#d7c9a7', '#cbbb96']
  return Array.from({ length: n }, (_, i) => `${sx * (i + 1) * 1.6}px ${(i + 1) * 1.1}px 0 ${tones[i]}`).join(', ')
}

export function CaseBook({ onStart, onBack, soundOn = false }: CaseBookProps) {
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const spread = useMedia('(min-width: 1100px) and (min-height: 620px)')
  // past sifat (PerformanceMonitor) — CCTV shovqini, skanlayn kabi doimiy effektlar o‘chadi
  const lite = useIntro((s) => s.quality === 'low')
  // ilova fazasi: 'launch' da (papka hali ekranda so‘nib ketayotganda) hech qaysi tugma/klavish ishlamaydi
  const appPhase = useIntro((s) => s.phase)
  // "sessiya": brauzerning "orqaga" tugmasi bilan (bfcache) launch → case qaytilsa +1 — muhr va start qayta ishlaydi
  const [session, setSession] = useState(0)
  const [seenAppPhase, setSeenAppPhase] = useState(appPhase)
  if (seenAppPhase !== appPhase) {
    setSeenAppPhase(appPhase)
    if (seenAppPhase === 'launch' && appPhase !== 'launch') setSession((n) => n + 1)
  }

  const [rawPhase, setPhase] = useState<Phase>('closed')
  // harakat kamaytirilgan bo‘lsa — muqova animatsiyasiz, darhol ochiq
  const phase: Phase = reduced ? 'open' : rawPhase
  const [index, setIndex] = useState(0)
  const [flip, setFlip] = useState<Flip | null>(null)
  const [exhibit, setExhibit] = useState(0)

  const target = flip ? flip.to : index
  const last = PAGE_COUNT - 1

  // eng so‘nggi holat — hodisa ishlovchilari eskirib qolmasligi uchun
  const live = useRef({ index, flip, phase, reduced, soundOn, appPhase, session, onStart, onBack })
  useLayoutEffect(() => {
    live.current = { index, flip, phase, reduced, soundOn, appPhase, session, onStart, onBack }
  })

  /* ---- "Majlisni boshlash": hamma tugmalar (yuqoridagi, 1-sahifa, muhr) shu orqali — sessiyada faqat BIR marta ---- */
  const startedIn = useRef(-1)
  const start = useCallback(() => {
    const s = live.current
    if (s.appPhase === 'launch' || startedIn.current === s.session) return
    startedIn.current = s.session
    s.onStart()
  }, [])
  const back = useCallback(() => {
    if (live.current.appPhase === 'launch') return
    live.current.onBack()
  }, [])

  /* ---- muqova ochilishi ---- */
  useEffect(() => {
    if (phase === 'open') return
    if (phase === 'closed') {
      const t = window.setTimeout(() => setPhase('opening'), COVER_DELAY_MS)
      return () => window.clearTimeout(t)
    }
    const t = window.setTimeout(() => setPhase('open'), COVER_MS)
    return () => window.clearTimeout(t)
  }, [phase])

  const coverSoundDone = useRef(false)
  useEffect(() => {
    if (phase === 'opening' && soundOn && !coverSoundDone.current) {
      coverSoundDone.current = true
      playCoverOpen()
    }
  }, [phase, soundOn])

  /* ---- varaqlash ---- */
  const go = useCallback((to: number) => {
    const s = live.current
    if (s.appPhase === 'launch') return
    if (s.phase !== 'open') {
      if (s.phase === 'closed') setPhase('opening')
      return
    }
    const cur = s.flip ? s.flip.to : s.index
    const next = Math.max(0, Math.min(PAGE_COUNT - 1, to))
    if (next === cur) return
    if (s.soundOn) playPageFlip()
    if (s.reduced) {
      setFlip(null)
      setIndex(next)
      return
    }
    setIndex(cur)
    setFlip({ from: cur, to: next, dir: next > cur ? 1 : -1, id: performance.now() })
  }, [])

  const step = useCallback(
    (d: 1 | -1) => {
      const s = live.current
      go((s.flip ? s.flip.to : s.index) + d)
    },
    [go],
  )

  useEffect(() => {
    if (!flip) return
    const t = window.setTimeout(
      () => {
        setIndex(flip.to)
        setFlip(null)
      },
      spread ? FLIP_MS : SINGLE_FLIP_MS,
    )
    return () => window.clearTimeout(t)
  }, [flip, spread])

  /* ---- klaviatura: ← → ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return
      if (live.current.appPhase !== 'case') return
      // sahifa pastga (InfoSections) aylantirilgan bo‘lsa — strelkalar/PageUp/Down o‘sha yerda ishlasin
      if (window.scrollY >= window.innerHeight * 0.5) return
      const d = e.key === 'ArrowRight' || e.key === 'PageDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'PageUp' ? -1 : 0
      if (!d) return
      e.preventDefault()
      // tugma bosib turilganda (avto-takror) har 30 ms da varaq qayta boshlanmasin
      if (e.repeat) return
      step(d)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  /* ---- suring (touch) ---- */
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const onPointerDown = (e: RPointerEvent) => {
    swipe.current = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: RPointerEvent) => {
    const s = swipe.current
    swipe.current = null
    if (!s) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1)
  }

  const ctx: PageCtx = { exhibit, setExhibit, onStart: start, onNext: () => step(1), session }
  const page = (i: number, side: 'left' | 'right' | 'single') => <SectionPage index={i} side={side} ctx={ctx} />

  const flipMs = spread ? FLIP_MS : SINGLE_FLIP_MS
  const rootStyle = { '--flip-ms': `${flipMs}ms`, '--cover-ms': `${COVER_MS}ms` } as CSSProperties

  /* ---- ikki betlik ko‘rinish ---- */
  let book: ReactNode
  if (spread) {
    const leftIdx = flip ? (flip.dir === 1 ? flip.from : flip.to) : index
    const rightIdx = flip ? (flip.dir === 1 ? flip.to : flip.from) : index
    book = (
      <>
        <div className="cb-board" aria-hidden />
        {leftIdx > 0 && (
          <div
            key={`l${leftIdx}`}
            className="cb-slot cb-slot--left"
            style={{ boxShadow: stackShadow(leftIdx, 'left') }}
          >
            {page(leftIdx, 'left')}
          </div>
        )}
        <div
          key={`r${rightIdx}`}
          className="cb-slot cb-slot--right"
          style={{ boxShadow: stackShadow(last - rightIdx, 'right') }}
        >
          {page(rightIdx, 'right')}
        </div>
        <Cover phase={phase} spread onOpen={() => go(0)} />
        {flip && (
          <>
            <div key={`cl${flip.id}`} className="cb-cast cb-cast--l" aria-hidden />
            <div key={`cr${flip.id}`} className="cb-cast cb-cast--r" aria-hidden />
            <div key={flip.id} className={'cb-leaf ' + (flip.dir === 1 ? 'cb-leaf--fwd' : 'cb-leaf--back')} aria-hidden inert>
              <div className="cb-face">{page(flip.dir === 1 ? flip.from : flip.to, 'right')}</div>
              <div className="cb-face cb-face--back">{page(flip.dir === 1 ? flip.to : flip.from, 'left')}</div>
            </div>
          </>
        )}
        {phase === 'open' && target > 0 && (
          <button type="button" className="cb-edge cb-edge--prev" aria-label="Oldingi sahifa" onClick={() => step(-1)} />
        )}
        {phase === 'open' && target < last && (
          <button type="button" className="cb-edge cb-edge--next" aria-label="Keyingi sahifa" onClick={() => step(1)} />
        )}
      </>
    )
  } else {
    /* ---- bitta sahifa (mobil) ---- */
    const staticIdx = flip ? (flip.dir === 1 ? flip.to : flip.from) : index
    book = (
      <>
        <div className="cb-board" aria-hidden />
        <div key={`s${staticIdx}`} className="cb-slot cb-slot--single">
          {page(staticIdx, 'single')}
        </div>
        {phase !== 'open' && <Cover phase={phase} spread={false} onOpen={() => go(0)} />}
        {flip && (
          <>
            <div key={`cr${flip.id}`} className="cb-cast cb-cast--r" aria-hidden />
            <div key={flip.id} className={'cb-leaf ' + (flip.dir === 1 ? 'cb-leaf--fwd' : 'cb-leaf--back')} aria-hidden inert>
              <div className="cb-face">{page(flip.dir === 1 ? flip.from : flip.to, 'single')}</div>
              <div className="cb-face cb-face--back">
                <BlankPaper />
              </div>
            </div>
          </>
        )}
      </>
    )
  }

  // 1-sahifada o‘z oltin tugmasi doim ko‘rinadi. Mobil oxirgi sahifada muhr scroll ostida qolishi mumkin —
  // shuning uchun yuqoridagi tugma ham turadi; ikki betlikda oxirgi sahifadagi muhr yetarli.
  const showTopStart = target > 0 && (spread ? target < last : true)

  return (
    <section
      className={[
        'cb-root',
        spread ? 'is-spread' : 'is-single',
        reduced ? 'is-reduced' : '',
        lite ? 'is-lite' : '',
        `is-${phase}`,
        flip ? (flip.dir === 1 ? 'is-fwd' : 'is-back') : '',
      ].join(' ')}
      style={rootStyle}
      aria-label={`Jinoyat ishi № ${CASE_FILE.number}: ${CASE_FILE.title}`}
    >
      <div className="cb-toolbar">
        <button type="button" className="cb-btn cb-btn--ghost" onClick={back}>
          <span aria-hidden className="cb-chev">‹</span> Orqaga
        </button>
        {spread ? (
          <p className="cb-toolbar__title">
            <span>Ish bilan tanishing</span>
            Himoyachi sifatida majlisga tayyorlaning
          </p>
        ) : (
          <p className="cb-toolbar__count" aria-hidden>
            {target + 1} / {PAGE_COUNT}
          </p>
        )}
        {showTopStart ? (
          <button type="button" className="cb-btn cb-btn--gold-outline cb-btn--sm" onClick={start}>
            Majlisni boshlash
          </button>
        ) : (
          <span className="cb-toolbar__spacer" aria-hidden />
        )}
      </div>

      <div className="cb-stage" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => (swipe.current = null)}>
        <div className="cb-shift">
          <div className="cb-book">
            <nav className="cb-tabs" aria-label="Bo‘limlar">
              {SECTIONS.map((s, i) =>
                s.tab ? (
                  <button
                    key={s.id}
                    type="button"
                    className={`cb-tab cb-tab--${s.id}`}
                    aria-current={target === i ? 'true' : undefined}
                    onClick={() => go(i)}
                  >
                    {s.tab}
                  </button>
                ) : null,
              )}
            </nav>
            {book}
          </div>
        </div>
      </div>

      <div className="cb-nav">
        <button type="button" className="cb-round" aria-label="Oldingi sahifa" disabled={target === 0} onClick={() => step(-1)}>
          <span aria-hidden>‹</span>
        </button>
        <div className="cb-dots" role="group" aria-label="Sahifalar">
          {SECTIONS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className="cb-dot"
              aria-label={`${i + 1}-sahifa: ${s.title}`}
              aria-current={i === target ? 'page' : undefined}
              onClick={() => go(i)}
            >
              <span />
            </button>
          ))}
        </div>
        {spread && (
          <p className="cb-nav__label">
            <b>
              {target + 1} / {PAGE_COUNT}
            </b>{' '}
            · {SECTIONS[target].title}
          </p>
        )}
        <button type="button" className="cb-round" aria-label="Keyingi sahifa" disabled={target === last} onClick={() => step(1)}>
          <span aria-hidden>›</span>
        </button>
      </div>
      {spread && <p className="cb-hint">← → tugmalari, sahifa chetini bosing yoki yorliqdan bo‘limni tanlang</p>}

      <p className="cb-sr" aria-live="polite">
        {phase === 'open' ? `Sahifa ${target + 1} / ${PAGE_COUNT}: ${SECTIONS[target].title}` : ''}
      </p>
    </section>
  )
}

function Cover({ phase, spread, onOpen }: { phase: Phase; spread: boolean; onOpen: () => void }) {
  return (
    <div className="cb-cover" aria-hidden onClick={phase === 'closed' ? onOpen : undefined}>
      <div className="cb-face cb-cover__front">
        <span className="cb-cover__gleam" />
        <Emblem className="cb-cover__emblem" />
        <p className="cb-cover__kicker cb-foil">Jinoyat ishi</p>
        <p className="cb-cover__no cb-foil">№ {CASE_FILE.number}</p>
        <span className="cb-cover__rule" />
        <p className="cb-cover__title cb-foil">{CASE_FILE.title}</p>
        <p className="cb-cover__foot">To‘qima o‘quv ishi</p>
        <span className="cb-strap" />
      </div>
      {spread && (
        <div className="cb-face cb-face--back cb-cover__back">
          <SectionPage index={0} side="left" ctx={NOOP_CTX} />
        </div>
      )}
    </div>
  )
}

const NOOP_CTX: PageCtx = { exhibit: 0, setExhibit: () => {}, onStart: () => {}, onNext: () => {}, session: 0 }
