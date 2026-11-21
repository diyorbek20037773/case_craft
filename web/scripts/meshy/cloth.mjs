// Qorong'i kiyim tozalash (dilate.mjs chaqiradi, padTexture dan oldin, asl 4096 o'lchamda).
//
// Muammo: sudya mantiyasi / prokuror formasi uzoqdan "dog'li" (to'q sariq/mis nuqtalar, och dog'lar). Tekshiruv natijasi:
// baseColor mantiya qismi deyarli toza (bir tekis ~(12,14,18)), dog'larning asosiy manbai yoritish — mato roughness'i
// 0.6–0.7 (Meshy MR xaritasi) va normal xaritada orolcha chetlarida keskin og'ishlar. Uzoqda mip'da normal o'rtachalanadi,
// lekin specular o'chmaydi -> burma/chok bo'ylab zalning iliq (yong'oq) rangidagi yaltiroq nuqtalar (specular aliasing).
//
// Shu modul faqat "mato" texellarida (rangi rolning asosiy kiyim rangiga yaqin) ishlaydi:
//  - baseColor: xromani mato rangiga tortadi (yorqinlik o'zgarmaydi) + atrofi to'liq mato bo'lgan
//    mayda chetlangan nuqtalar (1–3 px) mato rangiga qaytariladi;
//  - metallicRoughness: G (roughness) >= ~0.92, B (metal) = 0 — matoviy mato;
//  - normal: og'ish (XY) 0.45 ga kamaytiriladi — burmalar geometriyada bor, Meshy normal shovqini va chok sakrashlari yo'qoladi.
// Teri, yuz, soch, oq yoqa, galstuk, oltin nishon: rangi mato rangidan uzoq -> vazn 0 (tegilmaydi). Maydon (bir necha
// px dan katta) bo'lsa ham tegilmaydi — "nuqta" tozalash faqat atrofi 9x9 da >= 85% mato bo'lgan texelga.

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Rol -> sozlama. color: null — avtomatik (eng ko'p uchraydigan qorong'i rang). */
export const CLOTH_ROLES = {
  sudya: { maxLum: 60 },
  prokuror: { maxLum: 70 },
}

/** Separable box blur (radius r), Float32 */
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  const pre = new Float64Array(Math.max(w, h) + 1)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) pre[x + 1] = pre[x] + src[y * w + x]
    for (let x = 0; x < w; x++) {
      const a = Math.max(0, x - r), b = Math.min(w, x + r + 1)
      tmp[y * w + x] = (pre[b] - pre[a]) / (b - a)
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) pre[y + 1] = pre[y] + tmp[y * w + x]
    for (let y = 0; y < h; y++) {
      const a = Math.max(0, y - r), b = Math.min(h, y + r + 1)
      out[y * w + x] = (pre[b] - pre[a]) / (b - a)
    }
  }
  return out
}

/**
 * baseColor (asl o'lchamdagi RGB raw) + UV niqob -> mato vaznlari.
 * Natija: { color: [r,g,b], wide: Float32 (MR/normal uchun), tight: Float32 (baseColor xroma), speck: Uint8 (nuqta) , pct }
 */
export function clothWeights(rgb, mask, w, h, { maxLum = 60 } = {}) {
  const N = w * h
  // 1) asosiy kiyim rangi: qorong'i (L < maxLum) qamrovdagi texellar 8 px qadamli RGB to'rida — eng ko'p bin, keyin o'rtacha
  const bins = new Map()
  for (let i = 0; i < N; i += 3) {
    if (!mask[i]) continue
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2]
    if (lum(r, g, b) >= maxLum) continue
    const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    bins.set(k, (bins.get(k) ?? 0) + 1)
  }
  let best = -1, bestN = 0
  for (const [k, n] of bins) if (n > bestN) [best, bestN] = [k, n]
  if (best < 0) return null
  const c0 = [((best >> 10) & 31) * 8 + 4, ((best >> 5) & 31) * 8 + 4, (best & 31) * 8 + 4]
  let sr = 0, sg = 0, sb = 0, sn = 0
  for (let i = 0; i < N; i += 3) {
    if (!mask[i]) continue
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2]
    if (Math.abs(r - c0[0]) + Math.abs(g - c0[1]) + Math.abs(b - c0[2]) > 24) continue
    sr += r; sg += g; sb += b; sn++
  }
  const color = [sr / sn, sg / sn, sb / sn]
  const cL = Math.max(1, lum(...color))
  // 2) vaznlar: rang masofasi (yorqinlik farqi kamroq og'irlikda — mato soyasi/burmasi ham mato)
  const wide = new Float32Array(N)
  const tight = new Float32Array(N)
  let cnt = 0
  for (let i = 0; i < N; i++) {
    if (!mask[i]) continue
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2]
    const L = lum(r, g, b)
    const k = L / cL
    // xroma farqi: texel rangi mato rangining shu yorqinlikka keltirilganidan qanchalik uzoq
    const dc = Math.hypot(r - color[0] * k, g - color[1] * k, b - color[2] * k)
    // matodan ochroq (soch, yoritilgan kulrang orol) — mato emas: L > 1.45·cL dan keskin tushadi; juda qora ham emas
    const dl = Math.max(0, L - cL * 1.45) * 3 + Math.max(0, cL * 0.35 - L) * 2
    const d = dc + dl
    wide[i] = 1 - smooth(14, 34, d)
    tight[i] = 1 - smooth(8, 24, d)
    if (wide[i] > 0.5) cnt++
  }
  // 3) nuqta: atrofi (9x9) >= 85% mato, o'zi mato emas, va juda och emas (oq/oltin maydon emas — u katta bo'ladi)
  const around = boxBlur(wide, w, h, 4)
  const speck = new Uint8Array(N)
  for (let i = 0; i < N; i++) if (mask[i] && wide[i] < 0.5 && around[i] >= 0.85) speck[i] = 1
  return { color, cL, wide, tight, speck, pct: +((cnt / N) * 100).toFixed(1) }
}

/** In-place: slot bo'yicha asl o'lchamdagi raw RGB ni tozalaydi. Natija: o'zgargan texellar soni. */
export function applyCloth(slot, rgb, cw) {
  const { color, cL, wide, tight, speck } = cw
  const N = wide.length
  let changed = 0
  if (slot === 'baseColor') {
    for (let i = 0; i < N; i++) {
      let t = tight[i]
      if (speck[i]) t = 1
      if (t <= 0.001) continue
      const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2]
      // nuqta — mato rangining o'zi; mato — yorqinligi aynan saqlanadi (burma soyasi qoladi), faqat xroma mato rangidan
      const k = speck[i] ? 1 : lum(r, g, b) / cL
      rgb[i * 3] = Math.round(r + (color[0] * k - r) * t)
      rgb[i * 3 + 1] = Math.round(g + (color[1] * k - g) * t)
      rgb[i * 3 + 2] = Math.round(b + (color[2] * k - b) * t)
      changed++
    }
  } else if (slot === 'metallicRoughness') {
    for (let i = 0; i < N; i++) {
      const t = Math.max(wide[i], speck[i])
      if (t <= 0.001) continue
      const g = rgb[i * 3 + 1]
      rgb[i * 3 + 1] = Math.round(g + (Math.max(g, 235) - g) * t) // roughness >= 0.92
      rgb[i * 3 + 2] = Math.round(rgb[i * 3 + 2] * (1 - t)) // metal 0
      changed++
    }
  } else if (slot === 'normal') {
    for (let i = 0; i < N; i++) {
      const t = Math.max(wide[i], speck[i])
      if (t <= 0.001) continue
      const s = 1 - 0.55 * t // og'ish 0.45 gacha
      let x = (rgb[i * 3] / 127.5 - 1) * s
      let y = (rgb[i * 3 + 1] / 127.5 - 1) * s
      const z = Math.sqrt(Math.max(0, 1 - x * x - y * y))
      rgb[i * 3] = Math.round((x + 1) * 127.5)
      rgb[i * 3 + 1] = Math.round((y + 1) * 127.5)
      rgb[i * 3 + 2] = Math.round((z + 1) * 127.5)
      changed++
    }
  }
  return changed
}
