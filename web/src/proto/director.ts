// Sahna "rejissyori": UI (React) va 3D kadr tsikli o'rtasidagi umumiy holat.
// Kadrlar orasida React qayta chizilmasin deb oddiy o'zgaruvchan obyekt ishlatiladi.

export type WitnessPhase = 'idle' | 'listen' | 'think' | 'answer' | 'return'

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
  /** Guvoh og'zi uchun joriy ovoz darajalari (har kadrda o'qiladi) */
  mouth: () => MouthLevels | null
}

const SILENT: MouthLevels = { vol: 0, low: 0, mid: 0, high: 0 }

export const director: Director = {
  phase: 'idle',
  phaseStart: 0,
  shakeAt: null,
  mouth: () => null,
}

export function now() {
  return performance.now() / 1000
}

export function setPhase(phase: WitnessPhase) {
  director.phase = phase
  director.phaseStart = now()
}

export function silentMouth(): MouthLevels {
  return SILENT
}
