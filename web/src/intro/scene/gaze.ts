// Nigoh tizimi: personajlar "jonli" — kameraga, hover qilingan hamkasbiga yoki qo'shnisiga qisqa nazar tashlaydi.
// yaw/pitch -> 15% umurtqa, 35% bo'yin, 50% bosh; chegaralar ±35° / ±10°; damp λ=5.
// Nishon almashganda har personaj indeks×70 ms kechikib ergashadi (to'lqin). Keng fazalarda (title/mode/lobby) to'g'riga.
// Shu yerda yana: sekin og'irlik ko'chishi (ildiz x ±0,012 m, 5–7 s, rolga xos) — idle'lar sinxron bo'lmasin.
import * as THREE from 'three'
import { ROLES, type RoleId } from '../config'
import type { IntroState } from '../state'
import { applyLook, lookAngles, type PostureRig } from './posture'
import { BENCH_POS, DAIS } from './layout'
import { focusOf, isWidePhase, reducedMotion } from './live'

const DEG = Math.PI / 180

export const GAZE = {
  yawMax: 35,
  pitchMax: 10,
  damp: 5,
  /** umurtqa, bo'yin, bosh */
  shares: [0.15, 0.35, 0.5] as const,
  waveSec: 0.07,
  glanceMin: 6,
  glanceMax: 10,
  glanceDur: 1.2,
}

/** Personaj boshlarining dunyo pozitsiyasi (Figure har kadr yozadi; model bo'lmasa — ildiz + 1,6 m) */
export const heads = Object.fromEntries(ROLES.map((r) => [r.id, new THREE.Vector3(0, 1.6, 0)])) as Record<RoleId, THREE.Vector3>

type Key = 'fwd' | 'cam' | 'bench' | RoleId

/** Launch: sudya o'rindig'i (stol ortida, o'tirgan sudya boshi balandligi) */
export const BENCH_HEAD = new THREE.Vector3(BENCH_POS.x, DAIS.h + 1.3, BENCH_POS.z - 0.55)
/**
 * Stol figuralar ORQASIDA: qaysi yelka ustidan burilish — chapdagilar (x<0) o'ng tomonga (+X, markazga), o'ngdagilar
 * teskari; markazdagi himoyachi +X. Tana burilishi (Characters) va nigoh bir xil tomonga.
 */
export const benchSide = (x: number): 1 | -1 => (x > 0.05 ? -1 : 1)

export type GazeState = {
  id: RoleId
  index: number
  yaw: number
  pitch: number
  key: Key
  pending: Key
  pendingAt: number
  nextGlance: number
  glanceUntil: number
  glanceAt: RoleId | null
  flip: boolean
}

/** deterministik "tasodif" (har rolga boshqacha) */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function makeGaze(id: RoleId): GazeState {
  const index = Math.max(0, ROLES.findIndex((r) => r.id === id))
  return {
    id,
    index,
    yaw: 0,
    pitch: 0,
    key: 'fwd',
    pending: 'fwd',
    pendingAt: 0,
    nextGlance: 3 + hash(index + 1) * 6,
    glanceUntil: 0,
    glanceAt: null,
    flip: hash(index + 7) > 0.5,
  }
}

/** Holatdan nishon: o'zi fokusda -> kamera; boshqasi hover -> o'sha figura; aks holda kamera; keng fazada to'g'riga */
function wantKey(id: RoleId, s: IntroState): Key {
  if (s.phase === 'launch') return 'bench'
  if (isWidePhase(s.phase)) return 'fwd'
  if (focusOf(s) === id) return 'cam'
  if (s.phase === 'select' && s.hovered && s.hovered !== id) return s.hovered
  return 'cam'
}

const _t = new THREE.Vector3()
const _ang = { yaw: 0, pitch: 0 }

/** Har kadr: qomatdan KEYIN chaqiriladi (rig suyaklari klip+qomat pozasida) */
export function updateGaze(g: GazeState, rig: PostureRig, s: IntroState, camPos: THREE.Vector3, t: number, dt: number) {
  // to'lqin: yangi nishonga indeks×70 ms kechikib o'tish
  const k = wantKey(g.id, s)
  if (k !== g.pending) {
    g.pending = k
    g.pendingAt = t
  }
  if (g.key !== g.pending && t - g.pendingAt >= g.index * GAZE.waveSec) g.key = g.pending

  // qo'shniga qisqa nazar (faqat "kamera" holatida, o'zi fokusda emas)
  let target: THREE.Vector3 | null = null
  if (g.key === 'cam') {
    const self = focusOf(s) === g.id || s.hovered === g.id
    if (!reducedMotion && !self) {
      if (t >= g.nextGlance && t >= g.glanceUntil) {
        const left = g.index > 0 ? ROLES[g.index - 1].id : null
        const right = g.index < ROLES.length - 1 ? ROLES[g.index + 1].id : null
        g.flip = !g.flip
        g.glanceAt = (g.flip ? left : right) ?? left ?? right
        g.glanceUntil = t + GAZE.glanceDur
        g.nextGlance = t + GAZE.glanceDur + GAZE.glanceMin + hash(t * 3.1 + g.index) * (GAZE.glanceMax - GAZE.glanceMin)
      }
    } else g.glanceUntil = 0
    target = t < g.glanceUntil && g.glanceAt ? _t.copy(heads[g.glanceAt]) : _t.copy(camPos)
  } else if (g.key === 'bench') target = _t.copy(BENCH_HEAD)
  else if (g.key !== 'fwd') target = _t.copy(heads[g.key])

  let wy = 0
  let wp = 0
  if (target) {
    lookAngles(rig, target, _ang)
    // nishon orqada (stol): burilish tomoni qat'iy — markazdagi figura chap-o'ng orasida "sakramasin"
    if (g.key === 'bench' && Math.abs(_ang.yaw) > Math.PI / 2) _ang.yaw = benchSide(heads[g.id].x) * Math.PI
    wy = THREE.MathUtils.clamp(_ang.yaw, -GAZE.yawMax * DEG, GAZE.yawMax * DEG)
    wp = THREE.MathUtils.clamp(_ang.pitch, -GAZE.pitchMax * DEG, GAZE.pitchMax * DEG)
  }
  const l = reducedMotion ? 30 : GAZE.damp
  g.yaw = THREE.MathUtils.damp(g.yaw, wy, l, dt)
  g.pitch = THREE.MathUtils.damp(g.pitch, wp, l, dt)
  applyLook(rig, g.yaw, g.pitch, GAZE.shares)
}

/** Og'irlik ko'chishi: ildizning yon siljishi (m), rolga xos davr 5–7 s va faza */
const SHIFT: Record<RoleId, { period: number; phase: number }> = {
  sudya: { period: 6.6, phase: 0.2 },
  prokuror: { period: 5.4, phase: 2.1 },
  himoyachi: { period: 6.1, phase: 4.0 },
  guvoh: { period: 5.1, phase: 1.3 },
  kotib: { period: 7.0, phase: 3.2 },
}
export function weightShift(id: RoleId, t: number) {
  if (reducedMotion) return 0
  const p = SHIFT[id]
  return 0.012 * Math.sin((t / p.period) * Math.PI * 2 + p.phase)
}
