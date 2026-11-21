// CaseCraft 8 qirrali yulduzi (ikki 45° burilgan kvadrat) — burchak bezaklari, rejim ikonkalari, o‘quv muhri.
// Davlat ramzi emas: o‘zimizning bezak shaklimiz.

/** Ikki kvadrat birlashmasining ichki burchak radiusi nisbati: cos45° / cos22.5° */
export const STAR8_SQUARES = Math.SQRT1_2 / Math.cos(Math.PI / 8)

/** 16 nuqtali ko‘pburchak (SVG `points`): R — uchlar radiusi, r — ichki burchaklar radiusi */
export function star8Points(cx: number, cy: number, R: number, r = R * STAR8_SQUARES) {
  return Array.from({ length: 16 }, (_, i) => {
    const a = (-90 + i * 22.5) * (Math.PI / 180)
    const rad = i % 2 === 0 ? R : r
    return `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`
  }).join(' ')
}
