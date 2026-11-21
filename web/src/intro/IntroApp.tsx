import { lazy, Suspense, useEffect, useRef } from 'react'
import { ROLES, simHref, type ModeId } from './config'
import { actions, getState, useIntro, type Phase } from './state'
import { playRoleMotif, playTick, playWhoosh, probeMusic, setMusicPhase } from './ui/audio'
import { CaseBook } from './ui/case/CaseBook'
import { InfoSections } from './ui/InfoSections'
import { LaunchOverlay } from './ui/LaunchOverlay'
import './ui/loading/loading.css'
import { dismissSplash } from './ui/loading/splash'
import { LobbyScreen } from './ui/LobbyScreen'
import { ModeScreen } from './ui/ModeScreen'
import { requestOrder } from './ui/order/orderStore'
import { StageOrnaments } from './ui/Ornaments'
import { SceneBoundary, StageBoundary } from './ui/SceneBoundary'
import { SelectScreen } from './ui/SelectScreen'
import { RoleSlidesHost } from './ui/slidesHost'
import { TitleScreen } from './ui/TitleScreen'
import { TopBar } from './ui/TopBar'

// Og‘ir 3D (three, R3F, drei, postprocessing) alohida chunk: logo va "Boshlash" uni kutmasdan ~1 s da chiqadi
const LazyScene = lazy(() => import('./ui/loading/LazyScene'))

/** Case fazasida asosiy sahna sahifasini oldindan yuklab qo‘yamiz — "Majlisni boshlash" dan keyin tezroq ochiladi.
 *  Manzil o‘tiladigan URL bilan bir xil (simHref: ?role&case&mode) — aks holda HTTP kesh mos kelmaydi. Bitta <link>. */
function usePrefetchSim(phase: Phase, mode: ModeId) {
  useEffect(() => {
    if (phase !== 'case') return
    const href = simHref(mode)
    const link = document.querySelector<HTMLLinkElement>('link[data-sim-prefetch]')
    if (link) {
      if (link.getAttribute('href') !== href) link.href = href
      return
    }
    const l = document.createElement('link')
    l.rel = 'prefetch'
    l.href = href
    l.dataset.simPrefetch = ''
    document.head.appendChild(l)
  }, [phase, mode])
}

function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

function isActivatable(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return !!el && !!el.closest?.('button, a, [role="button"], summary')
}

/**
 * Klaviatura: ←/→ rollar, Enter tasdiq, Esc orqaga. Rejim ekrani (1/2/3, strelkalar) — ModeScreen ichida;
 * ish papkasi ←/→ — CaseBook ichida; slaydlar va order marosimi ochiq bo‘lsa ular tugmalarni o‘zi ushlaydi (capture).
 * Faqat sahna ko‘rinib turganda (sahifa pastga aylantirilmagan) ishlaydi. Bosib turilgan tugma (repeat) qayta
 * ishlamaydi — Esc ni ushlab turish titulgacha "yugurib" ketmaydi, Enter ikki amal bajarmaydi.
 * Ish papkasida Enter ataylab hech narsa qilmaydi: majlis faqat papkadagi aniq tugma bilan boshlanadi
 * (order marosimidan keyin tasodifiy Enter papkani o‘tkazib yubormasin).
 */
function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return
      if (window.scrollY >= window.innerHeight * 0.5) return
      const { phase, selected } = getState()

      if (e.key === 'Escape') {
        if (e.repeat) return
        if (phase === 'mode' || phase === 'lobby' || phase === 'select' || phase === 'case') {
          e.preventDefault()
          actions.back()
        }
        return
      }

      if (phase === 'select' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        const ids = ROLES.map((r) => r.id)
        const cur = selected ? ids.indexOf(selected) : -1
        const next =
          cur < 0 ? ids.indexOf('himoyachi') : (cur + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length
        actions.select(ids[next])
        const active = document.activeElement as HTMLElement | null
        if (active?.dataset.roleChip) {
          document.querySelector<HTMLElement>(`[data-role-chip="${ids[next]}"]`)?.focus()
        }
        return
      }

      if (e.key === 'Enter' && !e.repeat && !isActivatable(e.target)) {
        if (phase === 'title') {
          e.preventDefault()
          actions.start()
        } else if (phase === 'select') {
          e.preventDefault()
          // himoyachi — order marosimi orqali (SelectScreen ko‘rsatadi va oxirida chooseRole ni o‘zi chaqiradi)
          if (selected === 'himoyachi') {
            if (!requestOrder()) actions.chooseRole()
          } else actions.select('himoyachi')
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Holat o‘zgarishlariga mos UI tovushlari (ovoz yoqilgan bo‘lsa) */
function useStateSounds() {
  const phase = useIntro((s) => s.phase)
  const selected = useIntro((s) => s.selected)
  const hovered = useIntro((s) => s.hovered)
  const prevPhase = useRef(phase)

  useEffect(() => {
    void probeMusic()
    // sichqoncha tugma/havola ustiga kelganda — yengil "tik"
    let last: Element | null = null
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const el = (e.target as HTMLElement | null)?.closest?.('button, a') ?? null
      if (el && el !== last) playTick()
      last = el
    }
    document.addEventListener('pointerover', onOver)
    return () => document.removeEventListener('pointerover', onOver)
  }, [])

  useEffect(() => {
    setMusicPhase(phase)
    // faqat haqiqiy almashuvda (StrictMode effektni ikki marta ishlatsa ham birinchi chizishda emas)
    const changed = prevPhase.current !== phase
    prevPhase.current = phase
    // launch: musiqa jim, marosim tovushlarini LaunchOverlay o‘zi boshqaradi
    if (changed && phase !== 'launch') playWhoosh()
  }, [phase])

  useEffect(() => {
    // yagona joy: 3D figura, chip yoki klaviatura — qaysi yo'l bilan tanlanmasin, rol motivi shu yerda chalinadi
    if (selected) playRoleMotif(selected)
  }, [selected])

  useEffect(() => {
    if (hovered) playTick()
  }, [hovered])
}

export function IntroApp() {
  const phase = useIntro((s) => s.phase)
  const quality = useIntro((s) => s.quality)
  const soundOn = useIntro((s) => s.soundOn)
  const mode = useIntro((s) => s.mode)

  useKeyboard()
  useStateSounds()
  usePrefetchSim(phase, mode)

  // React birinchi marta chizildi — intro.html dagi statik splash yumshoq yo‘qoladi
  useEffect(() => {
    dismissSplash()
  }, [])

  // Brauzerning "orqaga" tugmasi bilan qaytilsa (bfcache), qora ekranda qolib ketmasin: ish papkasiga qaytamiz
  // (LaunchOverlay yopiladi va html/body fonini tiklaydi, TopBar va papka qayta ko‘rinadi)
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) actions.restoreFromLaunch()
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

  // Ekran almashganda fokusni yangi ekran boshiga o‘tkazamiz (klaviatura foydalanuvchilari uchun): rejim/lobbi/rol —
  // sarlavhaga; titul va ish papkasi — ekran konteyneriga (keyingi Tab birinchi tugmaga tushadi). Birinchi yuklashda emas.
  const stageRef = useRef<HTMLDivElement>(null)
  const focusedPhase = useRef(phase)
  useEffect(() => {
    if (focusedPhase.current === phase) return
    focusedPhase.current = phase
    if (phase === 'launch') return
    const root = stageRef.current?.querySelector<HTMLElement>('[data-phase-root]')
    const target = phase === 'title' || phase === 'case' ? root : (root?.querySelector<HTMLElement>('h2') ?? root)
    target?.focus({ preventScroll: true })
  }, [phase])

  return (
    <div id="top" className={'relative min-h-svh ' + (quality === 'low' ? 'q-low' : '')}>
      <div className="fixed inset-0 z-0">
        <div className="ld-scene-fallback" aria-hidden />
        <SceneBoundary>
          <Suspense fallback={null}>
            <LazyScene />
          </Suspense>
        </SceneBoundary>
      </div>

      <TopBar />

      <main className="pointer-events-none relative z-10">
        <div
          ref={stageRef}
          className={'relative h-svh min-h-[560px] overflow-hidden ' + (phase === 'title' ? 'pointer-events-auto' : 'pointer-events-none')}
          aria-label="CaseCraft — kirish"
        >
          <div className="stage-vignette pointer-events-none absolute inset-0" aria-hidden />
          <StageOrnaments />
          <div
            key={phase === 'launch' ? 'case' : phase}
            data-phase-root
            tabIndex={-1}
            // launch: papka so‘nadi va bosilmaydi; inert — klaviatura fokusi va Tab ham unga tushmaydi
            inert={phase === 'launch' || undefined}
            className={
              'absolute inset-0 outline-none ' +
              (phase === 'case' || phase === 'launch' ? 'stage-case ' : '') +
              (phase === 'launch' ? 'ld-stage-out' : '')
            }
          >
            <StageBoundary phase={phase}>
              {phase === 'title' && <TitleScreen />}
              {phase === 'mode' && <ModeScreen />}
              {phase === 'lobby' && <LobbyScreen />}
              {phase === 'select' && <SelectScreen />}
              {(phase === 'case' || phase === 'launch') && (
                <CaseBook onStart={actions.launch} onBack={actions.back} soundOn={soundOn} />
              )}
            </StageBoundary>
          </div>
        </div>
        <div inert={phase === 'launch' || undefined}>
          <InfoSections />
        </div>
      </main>

      <RoleSlidesHost />
      {phase === 'launch' && <LaunchOverlay />}
    </div>
  )
}
