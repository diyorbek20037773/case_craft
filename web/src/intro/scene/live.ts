// Kadrdan kadrga o'zgaradigan umumiy qiymatlar (React holati emas — re-render bo'lmasin).
// Personajlar yozadi; nur, halqa va yorliqlar o'qiydi. Yorug'lik "rejissurasi" (qaysi fazada qaysi nur qancha) — shu yerda.
import * as THREE from 'three'
import { ROLES, type ModeId, type RoleId } from '../config'
import type { IntroState } from '../state'

export const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/** Titul chiroqlari sessiyada bir marta yonadi (sessionStorage) */
export const IGNITE_KEY = 'casecraft.intro.lit'
function initialIgnite(): [number, number, number, number] {
  let played = true
  try {
    played = reducedMotion || typeof sessionStorage === 'undefined' || sessionStorage.getItem(IGNITE_KEY) === '1'
  } catch {
    played = true
  }
  return played ? [1, 1, 1, 1] : [0, 0, 0, 0]
}

export const live = {
  /** personaj ildizining joriy dunyo pozitsiyasi */
  pos: Object.fromEntries(ROLES.map((r) => [r.id, new THREE.Vector3()])) as Record<RoleId, THREE.Vector3>,
  /** joriy yorug'lik darajasi (0..~1.2) */
  light: Object.fromEntries(ROLES.map((r) => [r.id, 0.3])) as Record<RoleId, number>,
  /** nur rangi: 0 — iliq, 1 — sovuq ko'k (Lights yozadi, damp bilan) */
  cool: Object.fromEntries(ROLES.map((r) => [r.id, 0])) as Record<RoleId, number>,
  /**
   * Birinchi titulda chiroqlarning birin-ketin yonishi, har bosqich 0..1:
   * [0] tashqi (sudya, kotib + devor chiroqlari), [1] ichki (prokuror, guvoh), [2] himoyachi, [3] sudya stoli + yo'lak.
   */
  ignite: initialIgnite(),
  /** Room teksturalari tayyor bo'lgan payt (performance.now, ms); 0 — hali yo'q */
  roomReadyAt: 0,
  /** orqa devordagi gerb ramkasining ko'rinishi 0..1 (rejim/lobbida kartalar ortida ko'rinmasin) */
  plaque: 1,
  /**
   * Personajning sahnada "borligi" 0..1 (Characters yozadi): titulda 0 — bo'sh, tantanali zal (konsept 1);
   * tituldan chiqqach oyoqdan boshga oltin kesim bilan paydo bo'ladi. GLB'lar titulda ham yuklanadi va chiziladi.
   */
  show: Object.fromEntries(ROLES.map((r) => [r.id, 0])) as Record<RoleId, number>,
  /** launch ("Sud kelmoqda") boshlanganidan beri o'tgan vaqt, s (CameraRig yuritadi; launch bo'lmasa -1) */
  launchT: -1,
  /**
   * Sahna soati, s — monoton, kadr qadami 0,25 s bilan cheklangan (SceneClock yuritadi, hamma useFrame dan oldin).
   * R3F clock.elapsedTime frameloop almashganda 0 ga qaytadi va vkladka qaytganda sakraydi — tween/nigoh shunga
   * bog'lansa kamera sakraydi yoki nigoh "qotadi". Shuning uchun animatsiyalar faqat shu soatdan foydalanadi.
   */
  time: 0,
}

/** Har kadr bir marta (SceneClock, useFrame priority -1): sahna soatini oldinga suradi */
export function advanceTime(rawDt: number) {
  // 0,25 s chegara: juda sekin kadrda (<10 fps) ham kamera tweenlari devor soatiga yaqin tugaydi, vkladka qaytganda
  // (bir necha soniyalik delta) esa sakrash bo'lmaydi
  const dt = Number.isFinite(rawDt) && rawDt > 0 ? Math.min(rawDt, 0.25) : 0
  live.time += dt
}

/**
 * Launch soati: kamera dolly, nigoh va burilish shu soatga bog'langan. DEV da sekin kadr olish uchun
 * window.__introSlowmo (ko'paytiruvchi) va window.__introLaunchHold (s, shu nuqtada to'xtaydi).
 */
export function advanceLaunch(phase: IntroState['phase'], dt: number) {
  if (phase !== 'launch') {
    live.launchT = -1
    return
  }
  let k = 1
  let hold = Infinity
  if (import.meta.env.DEV) {
    const w = window as unknown as { __introSlowmo?: number; __introLaunchHold?: number }
    k = w.__introSlowmo ?? 1
    hold = w.__introLaunchHold ?? Infinity
  }
  live.launchT = live.launchT < 0 ? 0 : Math.min(hold, live.launchT + dt * k)
}

/** Personaj ko'rinadimi: titulda yo'q, qolgan hamma fazada bor (launch/case o'zgarmagan) */
export const wantShow = (s: IntroState): 0 | 1 => (s.phase === 'title' ? 0 : 1)
/** Bitta personajning paydo bo'lishi (s) va yonish tartibi bo'yicha oraliq (tashqi -> ichki -> himoyachi) */
export const SHOW_SEC = 0.7
export const SHOW_STAGGER = 0.08

/** Keng zal kadri bosqichlari: titul, rejim tanlash va lobbi (personajlar siluyetga yaqin, yorliqsiz) */
export const isWidePhase = (p: IntroState['phase']) => p === 'title' || p === 'mode' || p === 'lobby'

/** Titulda personaj spotlari (avval 0.32 — iliqroq zal uchun ~1.5×) */
const TITLE_LIGHT = 0.48

/** Personaj qaysi yonish bosqichiga tegishli (tashqi -> ichki -> himoyachi) */
export const IGNITE_STEP: Record<RoleId, 0 | 1 | 2> = { sudya: 0, kotib: 0, prokuror: 1, guvoh: 1, himoyachi: 2 }

/** Rejim kartasi ustida turilganda (va lobbida) zal yorug'i — rejimning "kayfiyati" */
// raund 2: hover qilingan rejim nurlari +40%, nishon bo'lmagan figuralar qorong'iroq — farq 200 ms da o'qilsin
function modeLight(id: RoleId, m: ModeId | null): number {
  if (m === 'talim') return id === 'himoyachi' ? 1.54 : 0.03 // AI ustoz bilan yakkama-yakka
  if (m === 'majlis') return 1.26 // to'liq sud: hamma yoritilgan
  if (m === 'dostlar') return id === 'sudya' ? 0.3 : 1.26 // do'stlar iliq, AI o'rin (sudya) ko'k; kotib — kod
  return TITLE_LIGHT
}

/** Holatga qarab personajning yorug'lik darajasi (nur intensivligi va material tusi shunga ergashadi) */
export function wantLight(id: RoleId, s: IntroState): number {
  switch (s.phase) {
    case 'title':
      return TITLE_LIGHT
    case 'mode':
      return modeLight(id, s.modeHover)
    case 'lobby':
      return modeLight(id, 'dostlar')
    case 'launch':
      return 0.35 // figuralar yumshoq yoritilgan qoladi; asosiy nur — sudya stoli (1.3)
    case 'case':
      return id === 'himoyachi' ? 1.12 : 0.05
    case 'select': {
      if (s.selected) {
        if (id === s.selected) return 1.12
        return s.hovered === id ? 0.7 : 0.45
      }
      return s.hovered === id ? 0.94 : 0.82 // hover ~×1.15
    }
  }
}

/** Nur rangi: "Do'stlar bilan" kayfiyatida AI o'rin (sudya) sovuq ko'k (kotib — kod, AI emas) */
export function wantCool(id: RoleId, s: IntroState): number {
  const dostlar = s.phase === 'lobby' || (s.phase === 'mode' && s.modeHover === 'dostlar')
  return dostlar && id === 'sudya' ? 1 : 0
}

/** Sudya stoli spoti ko'paytiruvchisi (asos 70) */
export function wantBench(s: IntroState): number {
  switch (s.phase) {
    case 'title':
      return 1.5
    case 'mode':
      return s.modeHover === 'talim' ? 0.3 : s.modeHover === 'majlis' ? 1.5 : s.modeHover === 'dostlar' ? 0.9 : 1.5
    case 'lobby':
      return 0.9
    case 'select':
      return 1
    case 'case':
      return 0.7
    case 'launch':
      return 1.3
  }
}

/** Yo'lak spoti (gilam va parket yaltirashi) ko'paytiruvchisi */
export function wantAisle(s: IntroState): number {
  if (s.phase === 'title') return 1.5
  if (s.phase === 'mode') return s.modeHover === 'talim' ? 0.4 : 1.2
  if (s.phase === 'lobby') return 1
  if (s.phase === 'launch') return 0.2
  return 0.6
}

/** Ta'lim kartasida sovuq ko'k yon nur (#9fc3ff) */
export const wantSideCool = (s: IntroState) => (s.phase === 'mode' && s.modeHover === 'talim' ? 0.85 : 0)

/** Orqadan sovuq kontur nur ko'paytiruvchisi: select'da kuchliroq — figuralar fondan ajralib tursin */
export const wantRim = (s: IntroState) => (s.phase === 'select' ? 2 : s.phase === 'case' ? 1.3 : 1)

/** Nur o'zgarishi tezligi (damp λ): rejim kartasi hover'i ~250 ms da o'qilsin */
export const lightLambda = (s: IntroState) => (s.phase === 'mode' ? 12 : 7.5)

/** Muhit (HDR) yorug'i: titul zali iliqroq (0.14 -> 0.22), launch'da stol ajralib tursin */
export function wantEnv(s: IntroState): number {
  if (isWidePhase(s.phase)) return 0.22
  if (s.phase === 'launch') return 0.13
  return 0.18
}

/** Halqa va oldinga chiqish uchun "fokusdagi" personaj */
export function focusOf(s: IntroState): RoleId | null {
  if (s.phase === 'case' || s.phase === 'launch') return 'himoyachi'
  if (s.phase === 'select') return s.selected
  return null
}
