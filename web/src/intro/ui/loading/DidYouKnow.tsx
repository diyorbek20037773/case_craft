import { useEffect, useState } from 'react'
import { TIPS } from './tips'

const EVERY_MS = 6000

/**
 * Titul ostidagi "Bilasizmi?" — har 6 s almashadi (ekran o‘quvchiga har safar e’lon qilinmaydi).
 * Matn hech qachon shaffof holatda qolib ketmaydi: birinchi maslahat animatsiyasiz, almashganda esa yengil
 * siljish (opacity 0.55 dan, 0 dan emas; fill-mode yo‘q). Ilgari har almashishda <p> key bilan qayta
 * yaratilib 0 dan so‘nib chiqardi — sekin GPU da (har kadr soniyalab chizilsa) animatsiya boshlanmay turib,
 * matn ko‘p vaqt ko‘rinmas edi.
 */
export function DidYouKnow({ className = '' }: { className?: string }) {
  const [i, setI] = useState(() => Math.floor(Math.random() * Math.max(1, TIPS.length)))
  // 0 — birinchi maslahat (animatsiyasiz); keyin har almashishda 1/2 navbatma-navbat — animatsiya qayta boshlanadi
  const [swap, setSwap] = useState(0)

  useEffect(() => {
    if (TIPS.length < 2) return
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      setSwap((v) => (v === 1 ? 2 : 1))
      setI((v) => (v + 1) % TIPS.length)
    }, EVERY_MS)
    return () => window.clearInterval(id)
  }, [])

  // maslahat yo‘q bo‘lsa — "Bilasizmi?" yorlig‘i ham chiqmaydi
  if (TIPS.length === 0) return null
  const tip = TIPS[i % TIPS.length]
  if (!tip) return null

  return (
    <aside className={'ld-tip ' + className} aria-label="Bilasizmi?">
      <span className="ld-tip-k" aria-hidden>
        <svg viewBox="-10 -10 20 20" className="ld-tip-star" aria-hidden>
          <rect x="-5.5" y="-5.5" width="11" height="11" />
          <rect x="-5.5" y="-5.5" width="11" height="11" transform="rotate(45)" />
        </svg>
        Bilasizmi?
      </span>
      <p className={'ld-tip-t m-0' + (swap ? ` ld-tip-swap${swap}` : '')}>
        <b className="ld-tip-lead">{tip.lead}:</b> {tip.text}
      </p>
    </aside>
  )
}
