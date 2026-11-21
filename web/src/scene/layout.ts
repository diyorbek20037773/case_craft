// Zal ichidagi joylashuv: personaj o'rinlari va kamera nuqtalari (metr, Y — yuqoriga, -Z — raislik qiluvchi tomoni).
// GLB zal modeli kelganda shu koordinatalar modelga moslab o'zgartiriladi.

export type Vec3 = [number, number, number]

export type SpeakerId = 'judge' | 'prosecutor' | 'witness' | 'clerk' | 'defendant'
export type ViewId = 'defense' | 'judge' | 'witness' | 'prosecutor' | 'overview'

export interface SpeakerConfig {
  label: string
  /** Personaj turgan/o'tirgan joyning pol nuqtasi */
  position: Vec3
  rotationY: number
  seated: boolean
  /** Placeholder kiyim ranglari */
  body: string
  accent: string
}

/** Raislik qiluvchi kursisi turadigan minbar balandligi */
export const BENCH_HEIGHT = 0.6

export const SPEAKERS: Record<SpeakerId, SpeakerConfig> = {
  judge: {
    label: 'Raislik qiluvchi',
    position: [0, BENCH_HEIGHT, -6.55],
    rotationY: 0,
    seated: true,
    body: '#15171d',
    accent: '#f1ede4',
  },
  prosecutor: {
    label: 'Prokuror',
    position: [-5.05, 0, -0.5],
    rotationY: Math.PI / 2,
    seated: true,
    body: '#1f3b6f',
    accent: '#d4a640',
  },
  witness: {
    label: 'Guvoh',
    position: [0, 0, -1.3],
    rotationY: Math.PI - 0.5,
    seated: false,
    body: '#7b5b3c',
    accent: '#d9cbb3',
  },
  clerk: {
    label: 'Kotib',
    position: [-5.05, 0, -4.4],
    rotationY: Math.PI / 2,
    seated: true,
    body: '#58616f',
    accent: '#e6e2da',
  },
  defendant: {
    label: 'Sudlanuvchi',
    position: [5.7, 0, 3.6],
    rotationY: -Math.PI / 2,
    seated: true,
    body: '#4d5b48',
    accent: '#c9c4b8',
  },
}

export const SPEAKER_ORDER: SpeakerId[] = ['judge', 'prosecutor', 'witness', 'clerk', 'defendant']

export interface ViewConfig {
  label: string
  position: Vec3
  target: Vec3
}

export const VIEWS: Record<ViewId, ViewConfig> = {
  defense: {
    label: "Mening o'rnim",
    position: [5.6, 1.5, 0.65],
    target: [-1.0, 1.15, -2.6],
  },
  judge: {
    label: 'Raislik qiluvchi',
    position: [0.85, 1.72, -2.7],
    target: [0, 1.72, -6.55],
  },
  witness: {
    label: 'Guvoh',
    position: [2.1, 1.7, -4.55],
    target: [0, 1.35, -1.3],
  },
  prosecutor: {
    label: 'Prokuror',
    position: [-1.7, 1.45, -0.1],
    target: [-5.05, 1.15, -0.5],
  },
  overview: {
    label: 'Umumiy',
    position: [6.3, 3.95, 8.5],
    target: [-0.8, 0.6, -3.0],
  },
}

export const VIEW_ORDER: ViewId[] = ['defense', 'judge', 'witness', 'prosecutor', 'overview']

/** Talabaning boshlang'ich ko'rinishi — himoyachi o'rni */
export const INITIAL_VIEW: ViewId = 'defense'
