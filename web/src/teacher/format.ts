import type { Mode } from './api'

export const MODE_UZ: Record<Mode, string> = { majlis: 'Sud majlisi', talim: 'Ta’lim' }

function d(iso: string): Date | null {
  const t = new Date(iso)
  return Number.isNaN(t.getTime()) ? null : t
}

export function fmtTime(iso: string): string {
  const t = d(iso)
  return t ? t.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', hour12: false }) : iso
}

export function fmtDateTime(iso: string): string {
  const t = d(iso)
  if (!t) return iso
  const dd = String(t.getDate()).padStart(2, '0')
  const mm = String(t.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm} ${fmtTime(iso)}`
}

export function fmtAgo(iso: string, now: number): string {
  const t = d(iso)
  if (!t) return ''
  const s = Math.max(0, Math.round((now - t.getTime()) / 1000))
  if (s < 60) return 'hozirgina'
  if (s < 3600) return `${Math.floor(s / 60)} daq oldin`
  return `${Math.floor(s / 3600)} soat oldin`
}
