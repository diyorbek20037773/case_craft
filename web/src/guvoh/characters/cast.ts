// O'tirgan personajlar (sudya, prokuror, kotib, sudlanuvchi) — model, stol va o'rindiqdagi o'rni.
// Manba: web/public/models/meshy/manifest.json (hipsMeters.seatedAnchor — sit_idle klipida son suyagi personaj ildiziga
// nisbatan qayerda). O'rindiq balandligi va markazi jihoz geometriyasidan brauzerda raycast bilan o'lchangan (pastda).
//
// Joylash: son suyagi (Hips) stul o'rindig'i ustida bo'lishi kerak. Ildiz = sonNishoni − R(rotY)·anchor (gorizontal),
// ildiz.y = sonNishoni.y − anchor.y. Son nishoni stol lokal koordinatasida berilgan (stol aylansa ham to'g'ri).
import * as THREE from 'three'
import type { ArmsConfig } from '../arms'
import { DESK, WITNESS_HEAD } from '../layout'
import type { Speaker } from '../session'
import type { SeatedPostureConfig } from './seatedPosture'

export type SeatedRole = 'judge' | 'prosecutor' | 'clerk' | 'defendant'

export interface CastSpec {
  role: SeatedRole
  /** /models/meshy/<model>.glb */
  model: 'sudya' | 'prokuror' | 'kotib' | 'sudlanuvchi'
  /** manifest: hipsMeters.seatedAnchor */
  anchor: [number, number, number]
  desk: keyof typeof DESK
  /** son suyagi nishoni — stol lokal fazosida (y — stol tagidan balandlik) */
  seatLocal: [number, number, number]
  /** o'tirgan odam stol lokal fazosida qaysi tomonga qaraydi: PI — -Z ga (stol oldi -Z bo'lsa), 0 — +Z ga */
  faceLocal: number
  /** qo'l yumshatish (arms.ts) — sit_idle pozasiga nisbatan, gradus. Sudya alohida tekshirilgan */
  arms: Partial<ArmsConfig>
  /** yelka qaddi (seatedPosture.ts) — standartdan farqlar */
  posture?: Partial<SeatedPostureConfig>
  /**
   * sit_idle dan faqat shu oraliq (asl klip soniyalari, oxiri klip uzunligidan oshsa — boshiga o'raladi) ping-pong
   * aylantiriladi. Sabab: Meshy "Sitting Idle" klipining 1,8–8,0 s qismida odam oldinga 0,4 m engashib, boshini
   * tizzasiga tushiradi (probe: head.y 1,14 -> 0,89) — sudya/prokuror uchun yaramaydi.
   */
  idleRange: [number, number]
  /** noutbukda 2048 teksturali asl model (yaqin kadrda yuz aniq); qolganlari *-mobile.glb — GPU xotira (layout.ts PropSpec.hq) */
  hq?: boolean
}

/** Barcha o'tirganlar uchun umumiy qo'l chegaralari (sit_idle pozasidan og'ish) */
export const SEATED_ARMS: ArmsConfig = {
  upperArmMaxDeg: 30,
  upperArmSoftDeg: 18,
  upperArmTwistMaxDeg: 22,
  upperArmTwistSoftDeg: 12,
  elbowMaxDeg: 50,
  elbowSoftDeg: 32,
  foreArmTwistKeep: 0.6,
  handTwistFreeDeg: 15,
  handTwistKeep: 0.6,
  handTwistToForeArm: 0.4,
  shoulderMaxDeg: 12,
  shoulderSoftDeg: 6,
  shoulderKeep: 0.5,
  shoulderFollow: 2,
}

export const CAST: CastSpec[] = [
  {
    role: 'judge',
    model: 'sudya',
    anchor: [0.229, 0.556, -0.332],
    desk: 'judge',
    seatLocal: [0.02, 0.555, 0.12],
    faceLocal: Math.PI,
    // sudya mantiyada: yelka keng — o'mrov chegarasi qattiqroq
    arms: { shoulderMaxDeg: 10, upperArmMaxDeg: 26, upperArmSoftDeg: 15 },
    idleRange: [9.2, 11.8],
    hq: true,
  },
  {
    role: 'clerk',
    model: 'kotib',
    anchor: [0.263, 0.659, -0.737],
    desk: 'clerk',
    seatLocal: [-0.06, 0.6, 0.3],
    faceLocal: Math.PI,
    arms: {},
    // kotib klipi boshqacha: 0–4 s tik o'tiradi, 5–9 s stolga engashadi (monitorga kirib ketadi)
    idleRange: [0, 4.2],
  },
  {
    role: 'prosecutor',
    model: 'prokuror',
    anchor: [0.207, 0.526, -0.33],
    desk: 'prosecutor',
    seatLocal: [-0.17, 0.6, -0.38],
    faceLocal: 0,
    arms: {},
    idleRange: [9.2, 11.8],
  },
  {
    role: 'defendant',
    model: 'sudlanuvchi',
    anchor: [0.209, 0.561, -0.351],
    desk: 'dock',
    seatLocal: [0, 0.64, -0.42],
    faceLocal: 0,
    arms: {},
    idleRange: [9.2, 11.8],
  },
]

export interface Placement {
  /** personaj ildizi (dunyo) */
  root: THREE.Vector3
  rotY: number
  /** son suyagi nishoni (dunyo) */
  hips: THREE.Vector3
  /** boshning taxminiy joyi (nigoh nishoni, kamera kadri, yorliq) */
  head: THREE.Vector3
}

/** three.js Y o'qi atrofida burish (x, z) */
function rotXZ(x: number, z: number, a: number): [number, number] {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [x * c + z * s, -x * s + z * c]
}

export function placement(spec: CastSpec): Placement {
  const d = DESK[spec.desk]
  const [lx, ly, lz] = spec.seatLocal
  const [hx, hz] = rotXZ(lx, lz, d.rotY)
  const hips = new THREE.Vector3(d.pos[0] + hx, d.pos[1] + ly, d.pos[2] + hz)
  const rotY = d.rotY + spec.faceLocal
  const [ax, az] = rotXZ(spec.anchor[0], spec.anchor[2], rotY)
  const root = new THREE.Vector3(hips.x - ax, hips.y - spec.anchor[1], hips.z - az)
  // o'tirgan odam boshi: sondan ~0,72 m yuqorida, biroz oldinda
  const head = hips.clone().add(new THREE.Vector3(Math.sin(rotY) * 0.08, 0.72, Math.cos(rotY) * 0.08))
  return { root, rotY, hips, head }
}

export const PLACEMENT: Record<SeatedRole, Placement> = Object.fromEntries(CAST.map((c) => [c.role, placement(c)])) as Record<SeatedRole, Placement>

/** Har gapiruvchining boshi (nigoh nishoni). Himoyachi — kamera (dinamik, shuning uchun bu yerda yo'q) */
export function headOf(s: Speaker): THREE.Vector3 {
  return s === 'witness' ? WITNESS_HEAD : PLACEMENT[s].head
}
