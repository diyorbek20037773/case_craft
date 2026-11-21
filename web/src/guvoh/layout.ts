// Sahna joylashuvi — BITTA joyda (metr, +Y yuqori, zal orqasi (sudya) -Z, kamera/himoyachi tomoni +X/+Z).
// O'zbekiston birinchi instansiya jinoyat sudi zali (research/zal-joylashuvi.md, prompts/royxat.md E):
//   orqa devor markazida ko'tarilgan supa (+0,38 m) va raislik qiluvchi stoli, ortida devorda GERB, yonida BAYROQ;
//   kotib stoli supa oldida, chapda, pastroq; prokuror chapda (o'ngga qaragan); himoyachi o'ngda (kamera shu yerda);
//   guvoh minbari markazda, sud tarkibiga yuzlangan; orqa-o'ng burchakda oq ramkali SHISHA KABINA (sudlanuvchi);
//   orqada jamoatchilik skameykalari va past to'siq; eshik sudya tomonidagi o'ng devorda; orqa devorda ekran.
//
//            gerb   (orqa devor, z = -3,4)              ekran
//   bayroq  [ SUDYA STOLI  — supa ]                      | eshik
//   KOTIB                                                |
//   PROKUROR ->        [GUVOH minbari]       <- HIMOYACHI (kamera)
//   ======= to'siq =======                   [SHISHA KABINA: sudlanuvchi]
//   skameyka  skameyka
//   skameyka  skameyka                       (old devor, z = 7)
import * as THREE from 'three'

export const ROOM = {
  xMin: -4.5,
  xMax: 4.8,
  zBack: -3.4,
  zFront: 7.0,
  height: 4.4,
  /** Yog'och panel balandligi */
  wainscot: 2.7,
} as const

/** Sudya supasi (kodda quriladi: yong'oq + marmar qirra), balandligi 0,38 m */
export const DAIS = { x0: -1.75, x1: 2.25, z0: -3.4, z1: -1.3, h: 0.38 } as const
/** Gerb (orqa devorda, sudya stoli tepasida) — rasmiy SVG (public/court/gerb.webp) */
export const GERB = { x: 0.3, y: 2.88, size: 1.05 } as const
/** Bayroq ustuni (supada, sudyaning o'ng qo'li tomonida — zaldan qaraganda chapda) */
export const FLAG = { x: -1.55, z: -2.95, poleH: 2.5 } as const

/** Guvoh ildizi (supacha 0,11 m ko'tarilgan) */
export const WITNESS_POS = new THREE.Vector3(0.55, 0.11, 2.0)
/**
 * Guvoh sud tarkibiga yuzlangan: sudya stolining o'ng-markaziga (x 1,4) qaraydi — sudya ~14° chapda, himoyachi (kamera)
 * ~75° o'ngda; tinglaganda bosh kameraga buriladi (pose.json look.yawDeg), javobda nigoh sudyaga qaytadi.
 */
const FACE_AT = new THREE.Vector3(1.4, 0, -2.6)
export const WITNESS_ROT_Y = Math.atan2(FACE_AT.x - WITNESS_POS.x, FACE_AT.z - WITNESS_POS.z)
const fwd = new THREE.Vector3(Math.sin(WITNESS_ROT_Y), 0, Math.cos(WITNESS_ROT_Y))
/** guvohning o'ng tomoni (personaj +Z ga qaraganda chap qo'li +X da) */
const right = new THREE.Vector3(-Math.cos(WITNESS_ROT_Y), 0, Math.sin(WITNESS_ROT_Y))
/**
 * Minbar va guvoh masofasi FK bilan o'lchab tanlangan (yumshatilgan talk kliplari, arms.ts): minbar 0,92 masshtab
 * (yuqori qirrasi 1,02–1,13 m), ildiz minbar markazidan 0,45 m orqada — mikrofon boshi og'izdan ~33 sm;
 * kesilgan talk_right / idle da barmoqlar minbarga kirmaydi, talk_both (og'irlik 1, oraliq oxiri) da ≤ 2 sm.
 */
export const STAND_SCALE = 0.92
export const STAND_GAP = 0.45
export const STAND_POS = WITNESS_POS.clone().setY(0).addScaledVector(fwd, STAND_GAP)
export const STAND_ROT_Y = WITNESS_ROT_Y
/** Guvoh supachasi markazi (Hall.tsx: 1,3 x 1,4 m) — guvoh va minbarni qoplaydi */
export const WITNESS_PLATFORM = WITNESS_POS.clone().setY(0).addScaledVector(fwd, 0.15)
/** Guvoh boshi (nigoh nishoni, kamera kadrlari) */
export const WITNESS_HEAD = WITNESS_POS.clone().setY(1.6).addScaledVector(fwd, 0.06)

/** Yorug'lik: yuz uchun key — guvohning o'ng-oldidan yuqoridan; kontur — orqa-chapdan (Scene.tsx) */
export const KEY_LIGHT_POS = WITNESS_POS.clone().setY(3.5).addScaledVector(fwd, 1.5).addScaledVector(right, 1.6)
export const RIM_LIGHT_POS = WITNESS_POS.clone().setY(2.6).addScaledVector(fwd, -1.6).addScaledVector(right, -0.8)

/** Shisha kabina (sudlanuvchi): oq metall ramka + shisha; old devori sudyaga qaragan, eshikchasi chap (zal) devorida */
export const BOOTH = { x0: 2.35, x1: 4.72, z0: 3.95, z1: 6.45, h: 2.35 } as const

/** Jamoatchilik skameykalari (har model ikki qator) — instancing, sudyaga qaragan */
export const BENCHES: [number, number][] = [
  [-3.25, 4.35],
  [-0.6, 4.35],
  [-3.25, 6.12],
  [-0.6, 6.12],
]
/** Past to'siq (barerka) — ishtirokchilar va jamoatchilikni ajratadi; o'rtada yo'lak */
export const BARRIER = { z: 3.3, h: 0.92, segments: [[-4.5, -2.2], [-1.65, 2.3]] as [number, number][] }

/** Shiftdagi chiroqlar (kesson kataklari markazida). Birinchi `LAMP_LIGHTS` tasida haqiqiy nur manbai bor */
export const LAMPS: [number, number][] = [
  [-2.43, -0.8],
  [1.28, -0.8],
  [-0.58, 1.2],
  [3.13, 1.2],
  [-2.43, 3.2],
  [1.28, 3.2],
]

/** Ekran (orqa devor, o'ng qism) — Meshy ekran.glb, displey tekisligi +Z */
export const SCREEN = { x: 3.62, y: 1.45, z: ROOM.zBack + 0.08 } as const

/**
 * Meshy jihozlari. Yangi jihoz: `node scripts/meshy/process.mjs <glb> --prop <nom> --width|--height M`,
 * so'ng shu ro'yxatga. Fayl: /models/meshy/props/<nom>.glb (telefonda <nom>-mobile.glb).
 * rotY — Meshy oldi tomoni +Z deb hisoblanadi (+Z = zal/kamera tomoni); Math.PI/2 — o'ngga (+X) qaraydi.
 */
export interface PropSpec {
  name: string
  pos: [number, number, number]
  rotY: number
  scale?: number
  enabled: boolean
  /** soya (katta jihozlar uchun true) */
  shadow?: boolean
  /**
   * Noutbukda ham 2048 teksturali asl fayl. Qolganlari doim *-mobile.glb (1024): har GLB 3 ta 2048² tekstura —
   * ~64 MB GPU xotira; hammasi asl bo'lsa ~1 GB bo'lib, sekin noutbukda WebGL konteksti yo'qoldi (headless'da ko'rildi).
   */
  hq?: boolean
}

/** Stollar (personajlar o'rni shulardan hisoblanadi — characters/cast.ts) */
export const DESK = {
  judge: { pos: [GERB.x, DAIS.h, -2.3] as [number, number, number], rotY: Math.PI },
  clerk: { pos: [-2.5, 0, -0.62] as [number, number, number], rotY: Math.PI + 0.35 },
  prosecutor: { pos: [-3.05, 0, 1.75] as [number, number, number], rotY: Math.PI / 2 },
  defense: { pos: [3.45, 0, 1.75] as [number, number, number], rotY: -Math.PI / 2 },
  dock: { pos: [3.55, 0, 5.35] as [number, number, number], rotY: Math.PI },
}

export const PROPS: PropSpec[] = [
  { name: 'minbar', pos: [STAND_POS.x, 0.11, STAND_POS.z], rotY: STAND_ROT_Y, scale: STAND_SCALE, enabled: true, shadow: true, hq: true },
  // Meshy ko'rinishida orqadan (kreslo oldinda) — shuning uchun 180°
  { name: 'sudya-stoli', pos: DESK.judge.pos, rotY: DESK.judge.rotY, enabled: true, shadow: true },
  // kotib: Meshy da kreslo old tomonda — 180° + yengil burilish (zalga qaragan)
  { name: 'kotib-stoli', pos: DESK.clerk.pos, rotY: DESK.clerk.rotY, enabled: true, shadow: true },
  { name: 'prokuror-stoli', pos: DESK.prosecutor.pos, rotY: DESK.prosecutor.rotY, enabled: true, shadow: true },
  // o'ng devor bo'ylab, guvoh bilan bir qatorda (zal markaziga qaragan) — kamera shu stol ortida
  { name: 'himoyachi-stoli', pos: DESK.defense.pos, rotY: DESK.defense.rotY, enabled: true, shadow: true, hq: true },
  // shisha kabina ichida, sudyaga qaragan
  { name: 'sudlanuvchi-orni', pos: DESK.dock.pos, rotY: DESK.dock.rotY, enabled: true, shadow: true },
  // sudya tomonidagi o'ng devorda (orqasi devorga)
  { name: 'eshik', pos: [ROOM.xMax - 0.14, 0, -1.95], rotY: -Math.PI / 2, enabled: true, shadow: false },
]

export interface Shot {
  pos: THREE.Vector3
  target: THREE.Vector3
  fov: number
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const DEG = Math.PI / 180

/**
 * Obyektni kadrga sig'diradi: `subject` markazi, `from` tomondan, yarim kenglik/balandlik (m) har qanday ekran nisbatida
 * ko'rinadi (tor telefon ekranida kamera orqaga chekinadi — personaj chetdan chiqib ketmaydi).
 * `lift` — subyektni kadrning yuqori qismiga ko'tarish (pastdagi subtitr paneli yopmasin), ko'rinadigan balandlik ulushi.
 */
export function frameShot(subject: THREE.Vector3, from: THREE.Vector3, halfW: number, halfH: number, fov: number, aspect: number, lift = 0): Shot {
  const vf = (fov * DEG) / 2
  const hf = Math.atan(Math.tan(vf) * aspect)
  const dist = Math.max(halfH / Math.tan(vf), halfW / Math.tan(hf))
  const dir = from.clone().sub(subject).normalize()
  const pos = subject.clone().addScaledVector(dir, dist)
  const target = subject.clone()
  if (lift) target.y -= dist * Math.tan(vf) * lift
  return { pos, target, fov }
}

/**
 * Guvoh kadrlari (himoyachi stoli tomonidan). portrait — telefon tik holati (aspect bilan sig'diriladi).
 * close — javob kadri: guvohning o'ng-oldidan 3/4 (sudyaga qarab gapirganda yuzi ko'rinadi); gorizontalda guvoh kadrning
 * chap qismida — o'ng-pastdagi subtitr paneli ko'krak/qo'llarni yopmasin.
 */
export function witnessShots(aspect: number): Record<'listen' | 'close', Shot> {
  const portrait = aspect < 0.85
  const head = WITNESS_POS.clone().setY(1.45).addScaledVector(fwd, 0.12)
  const d = fwd.clone().multiplyScalar(Math.cos(0.8)).addScaledVector(right, Math.sin(0.8))
  if (portrait) {
    // tor ekran: guvoh (bosh + yelkalar + imo-ishora) yarim kengligi 0,5 m — kamera orqaga chekinadi, qo'l chetdan
    // chiqmaydi; yuz kadrning ~30% balandligida (tepada TopBar, pastda subtitr paneli — ikkalasi ham yopmasin)
    const upper = WITNESS_POS.clone().setY(1.48).addScaledVector(fwd, 0.1)
    return {
      listen: frameShot(upper, v(3.0, 1.55, 2.7), 0.62, 0.7, 50, aspect, 0.25),
      close: frameShot(upper, upper.clone().addScaledVector(d, 2).setY(1.6), 0.5, 0.55, 48, aspect, 0.25),
    }
  }
  const closePos = head.clone().addScaledVector(d, 1.45).setY(1.7)
  // kamera o'ng vektori (chapga siljigan nishon -> guvoh kadrda chapga)
  const camRight = new THREE.Vector3(d.z, 0, -d.x)
  return {
    listen: { pos: v(3.1, 1.6, 2.35), target: v(0.6, 1.42, 1.95), fov: 30 },
    close: { pos: closePos, target: head.clone().setY(1.36).addScaledVector(camRight, 0.28), fov: 44 },
  }
}

/** Umumiy kadr: kabina oldidan, himoyachi stoli ortidan — butun zal (sudya, gerb, guvoh, prokuror) */
export function wideShot(aspect: number): Shot {
  // telefon: guvoh va sudya kadrning yuqori yarmida (pastki ~45% — subtitr/start paneli), gerb TopBar ostida
  if (aspect < 0.85) return { pos: v(4.15, 2.25, 3.75), target: v(0.4, 0.55, 0.44), fov: 76 }
  if (aspect < 1.3) return { pos: v(4.25, 2.3, 3.75), target: v(0.0, 1.0, -0.9), fov: 62 }
  return { pos: v(4.3, 2.3, 3.7), target: v(-0.2, 1.05, -0.8), fov: 56 }
}

/**
 * Tekshirish kadrlari (?view=side|front|close|top|judge|clerk|prosecutor|dock): qat'iy kamera, avtomatik kadrlash o'chadi.
 * side — guvohning chap yonidan (minbar bilan masofa ko'rinadi), front — to'g'ri oldidan, close — bosh/yelka.
 */
export function debugShot(view: string | null): Shot | null {
  if (!view) return null
  const f = new THREE.Vector3(Math.sin(WITNESS_ROT_Y), 0, Math.cos(WITNESS_ROT_Y))
  const side = new THREE.Vector3(Math.cos(WITNESS_ROT_Y), 0, -Math.sin(WITNESS_ROT_Y))
  const at = (y: number) => WITNESS_POS.clone().setY(y).addScaledVector(f, 0.2)
  switch (view) {
    case 'side':
      return { pos: at(1.25).addScaledVector(side, 2.6), target: at(1.0), fov: 40 }
    case 'front':
      return { pos: at(1.45).addScaledVector(f, 2.8), target: at(1.1), fov: 40 }
    case 'close':
      return { pos: WITNESS_POS.clone().setY(1.75).addScaledVector(f, 1.1), target: WITNESS_POS.clone().setY(1.62), fov: 35 }
    case 'arms': {
      // qo'l/yelka nuqsonlari: guvohning o'ng-old 3/4 tomonidan, belidan boshigacha (arms.ts tekshiruvi)
      const d = f.clone().multiplyScalar(Math.cos(0.9)).addScaledVector(side, -Math.sin(0.9))
      return { pos: WITNESS_POS.clone().setY(1.5).addScaledVector(d, 1.55), target: WITNESS_POS.clone().setY(1.3), fov: 40 }
    }
    case 'top':
      return { pos: at(3.2).addScaledVector(f, 0.6).addScaledVector(side, 0.3), target: at(1.0), fov: 45 }
    // o'tirgan personajlar: yon tomondan (son o'rindiqda, oyoqlar polda ekanini ko'rish uchun)
    case 'judge':
      return { pos: v(2.6, 1.3, -2.2), target: v(0.3, 0.9, -2.4), fov: 40 }
    case 'clerk':
      return { pos: v(-0.4, 1.2, -0.2), target: v(-2.5, 0.65, -0.9), fov: 40 }
    case 'prosecutor':
      return { pos: v(-3.4, 1.3, 4.3), target: v(-3.4, 0.7, 1.9), fov: 40 }
    case 'dock':
      return { pos: v(1.2, 1.4, 5.1), target: v(3.5, 0.7, 5.2), fov: 40 }
    // yelka/qo'l tekshiruvi: oldidan, belidan boshigacha
    case 'judge-close':
      return { pos: v(0.3, 1.45, -0.9), target: v(0.28, 1.3, -2.42), fov: 35 }
    case 'prosecutor-close':
      return { pos: v(-1.95, 1.2, 2.05), target: v(-3.44, 1.05, 1.9), fov: 35 }
    case 'plan':
      return { pos: v(0.2, 11.5, 1.8), target: v(0.2, 0, 1.6), fov: 60 }
    default:
      return null
  }
}
