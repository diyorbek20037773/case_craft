// Kirish qismining umumiy holati: 3D sahna (scene/) va interfeys (ui/) shu orqali gaplashadi.
// Kutubxonasiz kichik store — useSyncExternalStore.
import { useSyncExternalStore } from 'react'
import type { ModeId, RoleId } from './config'

/**
 * title  — titul ekran, kamera zal bo'ylab sekin suzadi
 * mode   — rejim tanlash: Ta'lim / Sud majlisi / Do'stlar bilan
 * lobby  — "Do'stlar bilan" namunaviy lobbisi (tez orada, ishlamaydi)
 * select — rol tanlash, 5 personaj yarim doirada
 * case   — himoyachi tanlangan, ish papkasi ochiq
 * launch — "Majlisni boshlash" bosildi: kamera sudya stoli tomon uchadi, UI ekranni qoraytirib SIM_URL ga o'tadi
 */
export type Phase = 'title' | 'mode' | 'lobby' | 'select' | 'case' | 'launch'

export type IntroState = {
  phase: Phase
  /** tanlangan majlis rejimi (SIM_URL ga &mode= bo'lib uzatiladi) */
  mode: ModeId
  /** kamera yaqinlashgan personaj (select va case da); null — umumiy ko'rinish */
  selected: RoleId | null
  /** sichqoncha ustida turgan personaj (yengil yoritish uchun) */
  hovered: RoleId | null
  /** rejim ekranida ko'rsatilgan karta (zal yorug'i shunga qarab o'zgaradi) */
  modeHover: ModeId | null
  /** yuklangan personajlar soni (0..ROLES.length) — yuklanish ko'rsatkichi uchun */
  loadedFigures: number
  soundOn: boolean
  /** PerformanceMonitor pasaytirsa 'low' — effektlarni kamaytirish uchun */
  quality: 'high' | 'low'
}

// Dev'da Vite HMR (?t=) modulning ikkinchi nusxasini yuklashi mumkin — holat globalThis'da, hamma nusxa bitta store'ni ko'radi
type Shared = { state: IntroState; listeners: Set<() => void> }
const G = globalThis as unknown as { __introStore?: Shared }
const shared: Shared = (G.__introStore ??= {
  state: { phase: 'title', mode: 'talim', selected: null, hovered: null, modeHover: null, loadedFigures: 0, soundOn: false, quality: 'high' },
  listeners: new Set<() => void>(),
})
const listeners = shared.listeners

export function getState() {
  return shared.state
}

/** oxirgi faza almashuvi vaqti (performance.now) — ikki marta bosishdan himoya uchun */
let phaseChangedAt = -Infinity

export function setState(patch: Partial<IntroState>) {
  if (patch.phase !== undefined && patch.phase !== shared.state.phase) phaseChangedAt = performance.now()
  shared.state = { ...shared.state, ...patch }
  listeners.forEach((l) => l())
}

/** Faza almashganidan beri o‘tgan vaqt (ms). Yangi ekran tugmasi eski ekran tugmasi o‘rnida bo‘lsa (masalan
 *  "Orqaga" yoki mobilda "Boshlash" o‘rnidagi rejim kartasi), ikkinchi bosish yangi ekranda amal bajarmasin. */
export function msSincePhaseChange() {
  return performance.now() - phaseChangedAt
}

/** ikki marta bosish oralig‘i: shundan tezroq kelgan "orqaga"/tanlash e’tiborsiz */
export const DOUBLE_CLICK_GUARD_MS = 400

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useIntro<T>(pick: (s: IntroState) => T): T {
  return useSyncExternalStore(subscribe, () => pick(shared.state))
}

// Amallar — ikkala tomon faqat shularni chaqiradi.
// Har faza o‘tishi faqat o‘z fazasidan ishlaydi (ikki marta bosish, kechikkan taymer yoki marosim paytidagi tugma
// holatni buzmaydi). Faza almashganda hovered tozalanadi — eski ekrandagi hover yangi ekranda "osilib" qolmasin.
const phase = () => shared.state.phase

export const actions = {
  /** titul (yoki slayddan: lobbi) -> rejim tanlash */
  start: () => {
    const p = phase()
    // allaqachon rejim tanlashda bo'lsa — hech narsa (ko'rsatilgan karta yorug'i saqlanadi)
    if (p === 'title' || p === 'lobby') setState({ phase: 'mode', selected: null, hovered: null, modeHover: null })
  },
  /** talim | majlis -> rol tanlash; dostlar -> namunaviy lobbi */
  chooseMode: (m: ModeId) => {
    if (phase() !== 'mode') return
    setState(
      m === 'dostlar'
        ? { phase: 'lobby', mode: m, selected: null, hovered: null, modeHover: null }
        : { phase: 'select', mode: m, selected: null, hovered: null, modeHover: null },
    )
  },
  select: (id: RoleId | null) => {
    if (phase() === 'select') setState({ selected: id })
  },
  hover: (id: RoleId | null) => {
    if (shared.state.hovered !== id) setState({ hovered: id })
  },
  hoverMode: (m: ModeId | null) => {
    if (shared.state.modeHover !== m) setState({ modeHover: m })
  },
  figureLoaded: () => setState({ loadedFigures: shared.state.loadedFigures + 1 }),
  /** faqat o'ynash mumkin bo'lgan rol uchun (himoyachi); faqat rol tanlashdan */
  chooseRole: () => {
    if (phase() === 'select') setState({ phase: 'case', selected: 'himoyachi', hovered: null })
  },
  /** bir qadam orqaga. launch paytida ishlamaydi (marosim yarim yo‘lda to‘xtamaydi) */
  back: () => {
    if (msSincePhaseChange() < DOUBLE_CLICK_GUARD_MS) return
    const p = phase()
    if (p === 'case') setState({ phase: 'select', hovered: null })
    else if (p === 'select' || p === 'lobby') setState({ phase: 'mode', selected: null, hovered: null })
    else if (p === 'mode') setState({ phase: 'title', selected: null, hovered: null, modeHover: null })
  },
  /** faqat ish papkasidan; ikkinchi chaqiruv e’tiborsiz */
  launch: () => {
    if (phase() === 'case') setState({ phase: 'launch', hovered: null })
  },
  /** bfcache: brauzer "Orqaga" bilan majlisdan qaytilganda — ish papkasiga */
  restoreFromLaunch: () => {
    if (phase() === 'launch') setState({ phase: 'case' })
  },
  toggleSound: () => setState({ soundOn: !shared.state.soundOn }),
  setQuality: (q: IntroState['quality']) => {
    if (shared.state.quality !== q) setState({ quality: q })
  },
}
