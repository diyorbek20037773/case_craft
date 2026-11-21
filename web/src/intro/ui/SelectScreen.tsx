import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ROLES, type RoleId } from '../config'
import { actions, getState, useIntro } from '../state'
import { agentHeading, PEOPLE, ROLE_BADGE, ROLE_TAG } from './content'
import { IconArrowRight, IconBook, IconClose } from './icons'
import { OrderOverlay } from './order/OrderOverlay'
import { onOrderRequest, requestOrder } from './order/orderStore'
import { openSlides } from './slidesStore'
import { StageHeader } from './StageHeader'

/** Plitka/chip: tanlanmagan bo‘lsa — tanlash; tanlangan o‘ynaladigan rol (himoyachi) qayta bosilsa (yoki Enter) — muhr marosimi */
function pickTile(id: RoleId, playable: boolean) {
  if (playable && getState().selected === id) {
    if (!requestOrder()) actions.chooseRole()
  } else actions.select(id)
}

const DESKTOP = '(min-width: 1024px)'

function useDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(DESKTOP)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => window.matchMedia(DESKTOP).matches,
  )
}

function hoverProps(id: RoleId) {
  return {
    onPointerEnter: () => actions.hover(id),
    onPointerLeave: () => actions.hover(null),
    onFocus: () => actions.hover(id),
    onBlur: () => actions.hover(null),
  }
}

/** Matn panelga sig‘masa — pastki chetini xiralashtiramiz (data-more), oxiriga yetganda olib tashlaymiz */
function useScrollFade<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      el.dataset.more = String(el.scrollHeight - el.scrollTop - el.clientHeight > 4)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [])
  return ref
}

/** Konsept 2: pastdagi katta shisha plitkalar, tanlangani — to‘liq oltin */
function RoleTiles() {
  const selected = useIntro((s) => s.selected)
  return (
    <div role="group" aria-label="Rollar" className="pointer-events-auto mx-auto grid w-full max-w-[1100px] grid-cols-5 gap-2.5 xl:gap-4">
      {ROLES.map((r, i) => (
        <button
          key={r.id}
          type="button"
          data-role-chip={r.id}
          className={`role-tile intro-rise intro-rise-d${i + 1}`}
          aria-pressed={selected === r.id}
          onClick={() => pickTile(r.id, r.playable)}
          {...hoverProps(r.id)}
        >
          <span className="font-display text-[clamp(1.2rem,1.9vw,1.8rem)] font-bold leading-none">{r.name}</span>
          <span className="pill-gold pill-gold-sm">{ROLE_TAG[r.id]}</span>
        </button>
      ))}
    </div>
  )
}

/** Konsept 4: mobil varaqdagi gorizontal chiplar */
function RoleChips() {
  const selected = useIntro((s) => s.selected)
  return (
    <div
      role="group"
      aria-label="Rollar"
      className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:justify-center"
    >
      {ROLES.map((r) => (
        <button
          key={r.id}
          type="button"
          data-role-chip={r.id}
          className="role-tile min-h-12 shrink-0 snap-start rounded-[12px] px-4 py-1.5"
          aria-pressed={selected === r.id}
          onClick={() => pickTile(r.id, r.playable)}
          {...hoverProps(r.id)}
        >
          <span className="font-display text-[1.3rem] font-bold leading-none">{r.name}</span>
        </button>
      ))}
    </div>
  )
}

/** Oltin asosiy tugma: order marosimini boshlaydi (SelectScreen tinglaydi) */
function ContinueButton({ compact = false }: { compact?: boolean }) {
  return (
    <button
      type="button"
      className={'btn-primary btn-gold w-full ' + (compact ? 'px-4 text-[1.2rem] max-[380px]:text-[1.05rem]' : '')}
      onClick={() => {
        if (!requestOrder()) actions.chooseRole()
      }}
    >
      Himoyachi sifatida davom etish
      <IconArrowRight className="size-5 shrink-0" />
    </button>
  )
}

function SeeDefenderButton({ className = '' }: { className?: string }) {
  return (
    <button type="button" className={'btn-secondary ' + className} onClick={() => actions.select('himoyachi')}>
      Himoyachini ko‘rish
    </button>
  )
}

function MoreButton({ id, className = '' }: { id: RoleId; className?: string }) {
  return (
    <button
      type="button"
      className={'btn-secondary ' + className}
      onClick={() => openSlides(id)}
      aria-haspopup="dialog"
    >
      <IconBook className="size-5" />
      Batafsil
    </button>
  )
}

/** Konsept 2: o‘ng tomondagi katta panel (lg+). Qoida — qisqa matn; to‘liq matn "Batafsil" slaydlarida. */
function RolePanel({ id }: { id: RoleId }) {
  const role = ROLES.find((r) => r.id === id)!
  const info = PEOPLE[id]
  const bodyRef = useScrollFade<HTMLDivElement>()
  const sections = [
    { h: 'Vazifasi', t: info.task },
    { h: agentHeading(id), t: info.agent },
    { h: 'Bo‘ysunadigan qoida', t: info.ruleShort },
  ]
  return (
    <section
      aria-label={`${role.name} — rol ma’lumoti`}
      aria-live="polite"
      className="glass-strong intro-sheet pointer-events-auto absolute bottom-[3.75rem] right-6 top-[var(--stage-top)] flex w-[min(460px,34vw)] flex-col overflow-hidden xl:right-8 xl:w-[480px]"
    >
      <button
        type="button"
        onClick={() => actions.select(null)}
        className="icon-btn absolute right-2 top-2 z-10"
        aria-label="Panelni yopish"
      >
        <IconClose className="size-5" />
      </button>
      <div ref={bodyRef} className="scroll-fade min-h-0 flex-1 overflow-y-auto px-6 pb-3 pt-5 xl:px-7">
        <div>
          <div className="text-center">
            <h3 className="m-0 font-display text-[2.4rem] font-bold leading-none text-ivory xl:text-[2.75rem]">{role.name}</h3>
            <p className="m-0 mt-2 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5">
              <span className="text-sm text-ivory/70">{info.title}</span>
              <span className={'pill-gold ' + (role.playable ? '' : 'text-gold-soft')}>{ROLE_BADGE[id]}</span>
            </p>
          </div>
          <dl className="m-0 mt-4 grid gap-3 text-[0.94rem] leading-[1.55]">
            {sections.map((s, i) => (
              <div key={s.h} className={`intro-rise intro-rise-d${i + 1}`}>
                <dt className="font-display text-[1.28rem] font-semibold leading-tight text-ivory">{s.h}</dt>
                <dd className="m-0 mt-1 border-t border-gold/25 pt-1.5 text-ivory/85">{s.t}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <div className="grid shrink-0 gap-2.5 border-t border-gold/15 px-6 pb-5 pt-3.5">
        {role.playable ? (
          <>
            <ContinueButton />
            <MoreButton id={id} className="w-full" />
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <SeeDefenderButton />
            <MoreButton id={id} />
          </div>
        )}
      </div>
    </section>
  )
}

/** Konsept 4: mobil/planshet — pastki varaq (chiplar, rol nomi, nishon, vazifa, oltin tugma) */
function MobileSheet() {
  const selected = useIntro((s) => s.selected)
  const role = selected ? ROLES.find((r) => r.id === selected)! : null
  const info = selected ? PEOPLE[selected] : null
  return (
    <section
      aria-label="Rol tanlash"
      className="sheet intro-sheet pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-[58svh] flex-col px-4 pt-2 sm:inset-x-6 sm:mx-auto sm:max-w-[640px]"
    >
      <span className="mx-auto mb-3 h-1 w-12 shrink-0 rounded-full bg-gold/70" aria-hidden />
      <RoleChips />
      {role && info && selected ? (
        <>
          <div key={selected} className="intro-rise scroll-fade min-h-0 flex-1 overflow-y-auto pt-3 text-center" aria-live="polite">
            <h3 className="m-0 font-display text-[2.4rem] font-bold leading-none text-ivory">{role.name}</h3>
            <span className={'pill-gold mt-2 ' + (role.playable ? '' : 'text-gold-soft')}>{ROLE_BADGE[selected]}</span>
            <div className="mt-3 text-left">
              <p className="m-0 font-display text-[1.3rem] font-semibold leading-tight text-ivory">Vazifasi</p>
              <p className="m-0 mt-1 border-t border-gold/25 pt-1.5 text-[0.95rem] leading-snug text-ivory/85">{info.task}</p>
            </div>
          </div>
          <div className="grid shrink-0 gap-2 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-3">
            {role.playable ? (
              <ContinueButton compact />
            ) : (
              <div className="flex items-center justify-between gap-2">
                <p className="m-0 text-sm text-ivory/75">
                  {selected === 'kotib' ? 'Bayonnomani dastur avtomatik yuritadi.' : 'Bu rolni AI boshqaradi.'}
                </p>
                <SeeDefenderButton className="shrink-0" />
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="inline-flex min-h-11 items-center px-1 text-sm font-semibold text-ivory/70 underline decoration-gold/40 underline-offset-4"
                onClick={() => actions.select(null)}
              >
                Yopish
              </button>
              <MoreButton id={selected} />
            </div>
          </div>
        </>
      ) : (
        <p className="m-0 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-sm text-ivory/75">
          Rolni tanlang — siz <span className="font-semibold text-gold-soft">Himoyachi</span> sifatida o‘ynaysiz.
        </p>
      )}
    </section>
  )
}

/**
 * Order marosimi: tugma, slayd yoki Enter (IntroApp) requestOrder() ni chaqiradi — overlay chiqadi va 1,3 s dan
 * keyin chooseRole(). Yagona yo‘l: hamma so‘rov shu tinglovchidan o‘tadi, ikkinchi so‘rov e’tiborsiz.
 * Marosim davomida klaviatura butunlay ushlanadi (capture): Esc/strelka/Enter orqadagi ekranni o‘zgartirmaydi,
 * Tab fokusni overlay ortiga olib chiqmaydi. Marosim 1,3 s — foydalanuvchi qotib qolmaydi.
 */
function useOrder() {
  const [ordering, setOrdering] = useState(false)
  const orderingRef = useRef(false)

  useEffect(
    () =>
      onOrderRequest(() => {
        if (orderingRef.current || getState().phase !== 'select') return
        orderingRef.current = true
        setOrdering(true)
      }),
    [],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!orderingRef.current) return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  return ordering
}

export function SelectScreen() {
  const selected = useIntro((s) => s.selected)
  const desktop = useDesktop()
  const ordering = useOrder()
  const panelOpen = desktop && !!selected
  const headPad = panelOpen ? 'lg:pr-[calc(min(460px,34vw)+2rem)] xl:pr-[calc(480px+2.5rem)]' : ''
  return (
    <>
      {/* sarlavha ortidagi yumshoq qorong‘i radial dog‘ (quti emas): orqadagi chiroq/halqa matnga aralashmaydi */}
      <div
        aria-hidden
        className={
          'select-head-scrim-wrap pointer-events-none absolute inset-x-0 top-[calc(var(--stage-top)-1.25rem)] px-3 sm:px-6 ' + headPad
        }
      >
        <div className="select-head-scrim" />
      </div>
      <StageHeader
        title="Rolingizni tanlang"
        hint={desktop ? 'Personajni yoki pastdagi rolni bosing' : undefined}
        className={headPad}
      />
      {desktop ? (
        <>
          {selected && <RolePanel key={selected} id={selected} />}
          <div
            className={
              'select-tiles pointer-events-none absolute inset-x-0 bottom-9 px-6 ' +
              (panelOpen ? 'lg:pr-[calc(min(460px,34vw)+2.5rem)] xl:pr-[calc(480px+3rem)]' : '')
            }
          >
            <RoleTiles />
            <p className="m-0 mt-2 text-center text-xs text-ivory/65">
              <kbd className="font-sans">←</kbd> <kbd className="font-sans">→</kbd> — rolni almashtirish · Enter — tanlash · Esc — orqaga
            </p>
          </div>
        </>
      ) : (
        <MobileSheet />
      )}
      {ordering && <OrderOverlay />}
    </>
  )
}
