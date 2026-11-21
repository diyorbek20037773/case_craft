// Zal holati (UI <-> 3D kadr tsikli): tanlangan kamera kadri va oxirgi gapirgan. Oddiy o'zgaruvchan obyekt —
// kadrlar orasida React qayta chizilmasin (director.ts bilan bir xil yondashuv).
import type * as THREE from 'three'
import type { Speaker } from '../session'

/** Kamera kadri: null — avtomatik (gapirganga o'tadi) yoki TopBar rejimi (director.camera) */
export type Focus = 'wide' | Speaker

export const FOCUS_LABEL: Record<Focus, string> = {
  wide: 'Umumiy',
  judge: 'Sudya',
  witness: 'Guvoh',
  prosecutor: 'Prokuror',
  defendant: 'Sudlanuvchi',
  clerk: 'Kotib',
}

export const court = {
  /** Qo'lda tanlangan kadr (director.camera === 'close' bo'lganda ishlatiladi), null — gapirayotgan/guvoh */
  focus: null as Speaker | null,
  /** Oxirgi gapirgan va qachon (s) — gap tugagach kamera darhol qaytib ketmasin */
  lastSpeaker: null as Speaker | null,
  lastSpeakerAt: 0,
  /**
   * Avto kamera uchun sahna subyekti (GuvohApp hisoblaydi): gap navbatdagi gapiruvchisi — ovozi yuklanmasdan oldin ham,
   * qoidabuzarlik/qaror va majlis yopilganda — raislik qiluvchi. null — kamera o'zi tanlaydi (gapirayotgan/guvoh/umumiy)
   */
  cue: null as Speaker | null,
  /** O'tirgan personajlarning haqiqiy bosh joyi (Head suyagidan, har kadrda Character.tsx yozadi) — kamera nishoni */
  heads: {} as Partial<Record<Speaker, THREE.Vector3>>,
}
