// Kirish qismi sozlamalari. Asosiy sahna manzili o'zgarsa — faqat SIM_URL ni almashtiring.

/** "Majlisni boshlash" dan keyin o'tiladigan sahna (asosiy chat yakuniy manzilni aytadi) */
export const SIM_URL = '/guvoh.html'

export const PRODUCT = {
  name: 'CaseCraft',
  slogan: 'Adolatni amalda o‘rganing.',
  logo: '/intro/casecraft-logo.png',
}

/** content/case.json bilan mos (id o'zgarmasin) */
export const CASE = {
  id: 'case-001-noutbuk',
  title: 'Elektron do‘konda noutbuk o‘g‘riligi',
  article: 'JK 169-modda (O‘g‘rilik)',
  difficulty: 'O‘rta',
  duration: '12–15 daqiqa',
  summary:
    '«Texnodunyo» do‘konidan 5 400 000 so‘mlik noutbuk yo‘qolgan. Sotuvchi sudlanuvchini fotosuratdan tanigan, ' +
    'sudlanuvchi esa aybini tan olmaydi. Siz himoyachi sifatida guvohni so‘roq qilasiz va muzokara nutqi so‘zlaysiz.',
}

/** Majlis rejimlari (asosiy sahna uchun yo'riqnoma: prompts/rejimlar-brief.md) */
export type ModeId = 'talim' | 'majlis' | 'dostlar'

export function simHref(mode: ModeId = 'talim') {
  return `${SIM_URL}?role=himoyachi&case=${encodeURIComponent(CASE.id)}&mode=${mode}`
}

export type RoleId = 'sudya' | 'prokuror' | 'himoyachi' | 'guvoh' | 'kotib'

export type Role = {
  id: RoleId
  name: string
  playable: boolean
  /** web/public/models/meshy/<model>.glb — bo'lmasa sahna zaxira (siluyet) ko'rsatadi */
  model: string
}

/** Sahnadagi tartib: chapdan o'ngga, himoyachi markazda */
export const ROLES: Role[] = [
  { id: 'sudya', name: 'Sudya', playable: false, model: 'sudya' },
  { id: 'prokuror', name: 'Prokuror', playable: false, model: 'prokuror' },
  { id: 'himoyachi', name: 'Himoyachi', playable: true, model: 'himoyachi' },
  { id: 'guvoh', name: 'Guvoh', playable: false, model: 'guvoh' },
  { id: 'kotib', name: 'Kotib', playable: false, model: 'kotib' },
]
