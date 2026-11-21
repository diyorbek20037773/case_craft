import { useEffect, useState } from 'react'
import { ROLES } from '../../config'
import { useIntro } from '../../state'
import { useSceneProgress } from './progressStore'

const TOTAL = ROLES.length
const SLOW_MS = 15000
/** personajlar hisobi kelmasa (masalan, model zaxira siluyet bo‘lib qolsa) — yuklovchi shuncha tinch tursa, tayyor */
const SETTLE_MS = 4000
/** 5/5 personaj tayyor, lekin drei hali mayda fayl (tekstura) olayotgan bo‘lsa — shuncha kutib, baribir "tayyor" */
const FIGS_GRACE_MS = 2500
/** xavfsizlik: drei 100% ga yetgandan shuncha keyin — hisob noto‘g‘ri bo‘lsa ham — chiziq tugaydi */
const FULL_SAFETY_MS = 8000
/** mutlaq chegara: sahifa ochilgandan shuncha keyin chiziq hech qachon qolmaydi ("Boshlash" baribir ishlaydi) */
const HARD_CAP_MS = 120000
const HOLD_MS = 600
const FADE_MS = 400

/**
 * TopBar pastki chetidagi 2px oltin chiziq + "Sud zali tayyorlanmoqda · N/5 personaj".
 * Manba: drei useProgress (LazyScene orqali) + personajlar soni (state.loadedFigures yoki progressStore.figures —
 * kattasi; ikkinchisi globalThis da, dev HMR modul nusxalaridan himoyalangan). 100% dan 600 ms keyin yo‘qoladi.
 * Hech qachon abadiy qolmaydi: drei 100% dan 8 s keyin yoki ochilgandan 120 s keyin baribir tugaydi.
 * Matn: figs < 5 — "… · N/5 personaj" (15 s dan keyin "Birinchi yuklash biroz vaqt oladi");
 * figs = 5, hali tugamagan — "Sud zali tayyorlanmoqda…" (hisobsiz); tugaganda — "Sud zali tayyor".
 * "Boshlash" bunga bog‘liq emas — doim ishlaydi.
 */
export function LoadingLine({ yieldText = false }: { yieldText?: boolean }) {
  const sp = useSceneProgress()
  const stateFigs = useIntro((s) => s.loadedFigures)
  const figs = Math.min(TOTAL, Math.max(stateFigs, sp.figures))
  const [slow, setSlow] = useState(false)
  const [done, setDone] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [removed, setRemoved] = useState(false)
  const [shown, setShown] = useState(0.04)

  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), SLOW_MS)
    const cap = window.setTimeout(() => setDone(true), HARD_CAP_MS)
    return () => {
      window.clearTimeout(t)
      window.clearTimeout(cap)
    }
  }, [])

  const allFigs = figs >= TOTAL
  const complete = sp.mounted && !sp.active && allFigs
  const settled = sp.mounted && !sp.active && (sp.total === 0 || sp.progress >= 100)
  // drei 100% (active bayrog‘i osilib qolsa ham) — xavfsizlik taymeri uchun
  const full = sp.mounted && sp.total > 0 && sp.progress >= 100

  useEffect(() => {
    if (done || !full) return
    const t = window.setTimeout(() => setDone(true), FULL_SAFETY_MS)
    return () => window.clearTimeout(t)
  }, [full, done])

  useEffect(() => {
    if (done) return
    let wait: number
    if (complete) wait = 0
    else if (allFigs) wait = FIGS_GRACE_MS
    else if (settled) wait = SETTLE_MS
    else return
    const t = window.setTimeout(() => setDone(true), wait)
    return () => window.clearTimeout(t)
  }, [complete, allFigs, settled, done])

  useEffect(() => {
    if (!done) return
    const t1 = window.setTimeout(() => setLeaving(true), HOLD_MS)
    const t2 = window.setTimeout(() => setRemoved(true), HOLD_MS + FADE_MS)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [done])

  // chiziq orqaga yurmasin (yangi fayllar qo‘shilganda drei foizi pasayishi mumkin).
  // 5/5 gacha 96% dan oshmaydi; 5/5 da 99% gacha; 100% — faqat tayyor bo‘lganda.
  const base = (sp.mounted ? 0.1 : 0.04) + 0.45 * (sp.progress / 100) + 0.45 * (figs / TOTAL)
  const raw = done ? 1 : allFigs ? Math.min(0.99, Math.max(0.97, base)) : Math.min(0.96, base)
  if (raw > shown) setShown(raw) // render paytidagi hosila holat (React tavsiya qilgan naqsh)

  if (removed || sp.gone) return null

  const pct = Math.round(Math.max(shown, raw) * 100)
  const label = done
    ? 'Sud zali tayyor'
    : allFigs
      ? 'Sud zali tayyorlanmoqda…'
      : `${slow ? 'Birinchi yuklash biroz vaqt oladi' : 'Sud zali tayyorlanmoqda'} · ${figs}/${TOTAL} personaj`

  return (
    <div className="ld-line" data-out={leaving || undefined}>
      <div
        className="ld-line-track"
        role="progressbar"
        aria-label="3D sud zali yuklanmoqda"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={label}
      >
        <span className="ld-line-fill" style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      <p className={'ld-line-text' + (yieldText ? ' ld-line-text--yield' : '')} aria-hidden>
        <span className="ld-line-dot" />
        {label}
      </p>
    </div>
  )
}
