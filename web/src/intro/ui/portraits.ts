// Rol -> portret manzili. YAGONA joy: InfoSections, RoleSlides, ish papkasi va boshqalar shu yerdan o‘qiydi.
// Portretlar — 3D modellarimiz renderlari; faqat shu faylni o‘zgartiring.
import type { RoleId } from '../config'

export type PortraitRole = RoleId | 'sudlanuvchi'

const BASE = '/intro/portraits'
/** 3D modellarimiz renderlari (scene/dev/portraits.tsx, 900x1200) — sahnadagi personaj bilan bir xil odam */
const BASE_3D = `${BASE}/3d`

/**
 * Sudlanuvchi: yangi Meshy modeli kelguncha — yuzsiz navy siluet + oltin kontur (900x1200, boshqa portretlar kadrida).
 * Model kelganda: `${BASE_3D}/sudlanuvchi.webp` qiling va SILHOUETTE_ROLES dan olib tashlang.
 */
export const PORTRAITS: Record<PortraitRole, string> = {
  sudya: `${BASE_3D}/sudya.webp`,
  prokuror: `${BASE_3D}/prokuror.webp`,
  himoyachi: `${BASE_3D}/himoyachi.webp`,
  guvoh: `${BASE_3D}/guvoh.webp`,
  kotib: `${BASE_3D}/kotib.webp`,
  sudlanuvchi: `${BASE}/sudlanuvchi-silhouette.svg`,
}

/** Portreti hali siluet bo‘lgan rollar — ularning yonida "to‘qima shaxs" izohi ko‘rsatiladi */
const SILHOUETTE_ROLES: ReadonlySet<PortraitRole> = new Set<PortraitRole>(['sudlanuvchi'])

export function portraitOf(role: PortraitRole) {
  return PORTRAITS[role]
}

/** Portret siluetmi (real yuz emas)? */
export function isSilhouette(role: PortraitRole) {
  return SILHOUETTE_ROLES.has(role)
}

/** Portret ostidagi izoh: siluet bo‘lsa "to‘qima shaxs", aks holda null */
export function portraitCaption(role: PortraitRole): string | null {
  return isSilhouette(role) ? 'to‘qima shaxs' : null
}
