// Fayl mavjudligini tekshirish (HEAD + content-type) va avtomatik qayta tekshirish (faqat dev).
// Vite dev server yo'q fayl uchun 200 + text/html (index.html) qaytaradi — shuning uchun faqat status emas,
// content-type ham tekshiriladi. Yo'q deb topilgan fayllar har RECHECK_MS da qayta so'raladi: asosiy chat yangi
// personaj GLB sini qo'shsa, sahna sahifani qayta yuklamasdan uni ko'rsatadi.
import { useEffect, useSyncExternalStore } from 'react'

export type Avail = 'unknown' | 'yes' | 'no'

const RECHECK_MS = 20_000

const status = new Map<string, Avail>()
const inflight = new Set<string>()
const listeners = new Set<() => void>()
let timer: number | null = null

const isModelType = (ct: string) => {
  const c = ct.toLowerCase()
  return c.includes('gltf-binary') || c.includes('octet-stream') || c.includes('model/gltf')
}

async function check(url: string) {
  if (inflight.has(url)) return
  inflight.add(url)
  let ok = false
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store' })
    ok = r.ok && isModelType(r.headers.get('content-type') ?? '')
    // ba'zi statik xostinglar HEAD ni qo'llamaydi (405/501) — GET sarlavhalarini o'qib, tanani darhol to'xtatamiz
    if (!r.ok && (r.status === 405 || r.status === 501)) {
      const ac = new AbortController()
      const g = await fetch(url, { cache: 'no-store', signal: ac.signal })
      ok = g.ok && isModelType(g.headers.get('content-type') ?? '')
      ac.abort()
    }
  } catch {
    ok = false
  }
  inflight.delete(url)
  const next: Avail = ok ? 'yes' : 'no'
  if (status.get(url) !== next) {
    status.set(url, next)
    listeners.forEach((l) => l())
  }
}

function ensureTimer() {
  // production'da fayllar sahifa ochiq turganda paydo bo'lmaydi — qayta so'rash (va yo'q emblema uchun har 20 s da
  // konsoldagi 404) kerak emas. Avtomatik almashtirish faqat dev'da (asosiy chat GLB qo'shib boradi).
  if (!import.meta.env.DEV) return
  if (timer !== null) return
  timer = window.setInterval(() => {
    if (document.hidden) return
    let pending = false
    for (const [url, s] of status)
      if (s !== 'yes') {
        pending = true
        void check(url)
      }
    // hammasi topildi — taymer to'xtaydi (yangi URL kuzatilsa watch() qayta yoqadi)
    if (!pending && timer !== null) {
      window.clearInterval(timer)
      timer = null
    }
  }, RECHECK_MS)
}

function watch(url: string) {
  if (!status.has(url)) {
    status.set(url, 'unknown')
    void check(url)
  }
  ensureTimer()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** url null bo'lsa — 'no'. Birinchi chaqiruvda tekshiruv boshlanadi. */
export function useAvailable(url: string | null): Avail {
  useEffect(() => {
    if (url) watch(url)
  }, [url])
  return useSyncExternalStore(subscribe, () => (url ? (status.get(url) ?? 'unknown') : 'no'))
}

export const characterUrl = (model: string, mobile: boolean) => `/models/meshy/${model}${mobile ? '-mobile' : ''}.glb`
export const propUrl = (name: string, mobile: boolean) => `/models/meshy/props/${name}${mobile ? '-mobile' : ''}.glb`
export const texUrl = (name: string, mobile: boolean) => `/models/meshy/zal/${name}${mobile ? '-m' : ''}.webp`
export const EMBLEM_URL = '/intro/models/casecraft-emblem.glb'

/**
 * To'liq va mobil variantdan birini tanlaydi. lite bo'lsa mobil afzal, yo'q bo'lsa to'liq.
 * Hali aniqlanmagan bo'lsa null (ikki marta yuklamaslik uchun kutamiz).
 */
export function useModelUrl(full: string, mobile: string, lite: boolean): string | null {
  const f = useAvailable(full)
  const m = useAvailable(lite ? mobile : null)
  if (lite) {
    if (m === 'yes') return mobile
    if (m === 'unknown') return null
  }
  return f === 'yes' ? full : null
}
