// Sahna "rejissyori": UI (React) va 3D kadr tsikli o'rtasidagi umumiy holat.
// Kadrlar orasida React qayta chizilmasin deb oddiy o'zgaruvchan obyekt ishlatiladi.

export type WitnessPhase = 'idle' | 'listen' | 'think' | 'answer' | 'return'
/** free — ?debug=1 da kamerani qo'lda boshqarish (window.__director, window.__three) */
export type CameraMode = 'auto' | 'wide' | 'close' | 'free'

export interface MouthLevels {
  /** Umumiy ovoz balandligi 0..1 */
  vol: number
  /** Chastota bo'linmalari ulushi (yig'indisi ~1) */
  low: number
  mid: number
  high: number
}

export interface Director {
  phase: WitnessPhase
  /** performance.now() / 1000 — holat boshlangan vaqt */
  phaseStart: number
  /** Bosh chayqash boshlanishi (s), null — chayqamaydi */
  shakeAt: number | null
  /** Javobda qaysi gapirish klipi */
  talkClip: 'talk_both' | 'talk_right'
  /** Guvoh og'zi uchun joriy ovoz darajalari (har kadrda o'qiladi) */
  mouth: () => MouthLevels | null
  /** Kamera rejimi: auto — holatga qarab kadr tanlanadi */
  camera: CameraMode
  /** ?debug=1: og'izni qo'lda ochish (0..1), null — ovozdan */
  debugOpen: number | null
  /** Hisobot uchun: joriy FPS (kadr tsiklida yangilanadi) */
  fps: number
}

export const director: Director = {
  phase: 'idle',
  phaseStart: 0,
  shakeAt: null,
  talkClip: 'talk_both',
  mouth: () => null,
  camera: 'auto',
  debugOpen: null,
  fps: 0,
}

export function now() {
  return performance.now() / 1000
}

export function setPhase(phase: WitnessPhase) {
  director.phase = phase
  director.phaseStart = now()
}
