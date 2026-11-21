// Kirish sahnasi joylashuvi — BITTA joyda (metr, +Y yuqori, zal orqasi -Z, kamera/kirish tomoni +Z).
// 5 personaj sudya stoli oldida sayoz yarim doirada, kameraga yuzlangan; himoyachi markazda va biroz oldinda.
import * as THREE from 'three'
import { ROLES, type RoleId } from '../config'

export const ROOM = {
  xMin: -5.6,
  xMax: 5.6,
  zBack: -4.8,
  zFront: 11.5,
  height: 5.0,
  /** yong'oq panel balandligi */
  wainscot: 2.6,
} as const

/** Sudya supasi (kodda quriladi) */
export const DAIS = { x0: -2.3, x1: 2.3, z0: -4.8, z1: -2.0, h: 0.45 } as const
/** Sudya stoli (Meshy prop) — supa ustida */
export const BENCH_POS = new THREE.Vector3(0, DAIS.h, -3.05)
/** Orqa devordagi gerb/emblema ramkasi */
export const PLAQUE = { x: 0, y: 3.55, r: 0.55 } as const
/** Emblema (bo'lsa) — stol tepasida, ramka oldida suzadi */
export const EMBLEM_POS = new THREE.Vector3(0, 3.5, -3.9)
/** Boshlash'dan keyin emblema orqa devordagi navy diskka "gerb" bo'lib o'rnashadi */
export const EMBLEM_SETTLED = new THREE.Vector3(PLAQUE.x, PLAQUE.y, ROOM.zBack + 0.14)

/** Yo'lak gilami: supa zinasidan zal kirishigacha (navy, oltin hoshiya) */
export const CARPET = { width: 1.7, z0: DAIS.z1 + 0.48, z1: ROOM.zFront, y: 0.003 } as const

/**
 * Devor chiroqlari (bra): yong'oq taglik + iliq abajur + nur dog'i.
 * `n` — devordan zal tomonga birlik normal (XZ). Yon devorlarda pilyastrlar orasida, orqa devorda supa yonida.
 */
export const SCONCES: { pos: THREE.Vector3; n: THREE.Vector3 }[] = [
  ...[-0.8, 2.4].flatMap((z) => [
    { pos: new THREE.Vector3(ROOM.xMin, 2.25, z), n: new THREE.Vector3(1, 0, 0) },
    { pos: new THREE.Vector3(ROOM.xMax, 2.25, z), n: new THREE.Vector3(-1, 0, 0) },
  ]),
  { pos: new THREE.Vector3(-3.5, 2.25, ROOM.zBack), n: new THREE.Vector3(0, 0, 1) },
  { pos: new THREE.Vector3(3.5, 2.25, ROOM.zBack), n: new THREE.Vector3(0, 0, 1) },
]

/** Personajlar shu nuqtaga (kamera tomoniga) yuzlanadi */
const FACE_AT = new THREE.Vector3(0, 0, 9)
/** Tanlangan personaj shuncha oldinga chiqadi (m) */
export const STEP_FORWARD = 0.3

export type Slot = {
  id: RoleId
  index: number
  pos: THREE.Vector3
  rotY: number
  /** kamera tomonga birlik vektor (XZ) */
  forward: THREE.Vector3
}

/**
 * Yarim doira: chetdagilar orqaroqda. portrait — telefon tik holati, oraliq qisqaroq (hammasi kadrga sig'sin).
 */
export function makeSlots(portrait: boolean): Record<RoleId, Slot> {
  const gap = portrait ? 0.72 : 1.25
  const out = {} as Record<RoleId, Slot>
  ROLES.forEach((r, i) => {
    const k = i - 2
    const pos = new THREE.Vector3(k * gap, 0, 0.35 - 0.16 * k * k)
    const dx = FACE_AT.x - pos.x
    const dz = FACE_AT.z - pos.z
    const rotY = Math.atan2(dx, dz)
    out[r.id] = { id: r.id, index: i, pos, rotY, forward: new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY)) }
  })
  return out
}

/** Guruhning yarim kengligi (kadrga sig'dirish uchun) */
export const groupHalfWidth = (portrait: boolean) => (portrait ? 2 * 0.72 + 0.38 : 2 * 1.25 + 0.7)

/** Shift chiroqlari (har personajga bittadan nur): personaj oldidan-yuqoridan, diagonal tushadi */
export function spotSource(slot: Slot) {
  return new THREE.Vector3(slot.pos.x * 1.25, ROOM.height - 0.04, slot.pos.z + 1.5)
}

/** Ekran tik (telefon) holatimi */
export const isPortrait = (w: number, h: number) => w / h < 0.8
