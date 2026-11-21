import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CASE } from '../../config'
import { actions, getState } from '../../state'
import { playStamp, playWhoosh } from '../audio'
import { LOGO_EMBLEM } from '../content'
import { OrderSeal } from './OrderSeal'
import './order.css'

/** Vaqt jadvali (ms) — order.css dagi animatsiya kechikishlari bilan bir xil */
const T = {
  stampAt: 520, // muhr tusha boshlaydi (160 ms)
  impact: 680, // muhr qog‘ozga tegdi: tovush + 2px silkinish
  done: 1300, // ish papkasiga o‘tish
  reducedDone: 300,
}

function today() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`
}

function prefersReduced() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * "Himoyachi sifatida davom etish" → 1,3 s marosim: qog‘oz order pastdan chiqadi, CaseCraft o‘quv muhri
 * «TASDIQLANDI» bo‘lib tushadi, karta 2px silkinadi, so‘ng actions.chooseRole(). Reduced-motion: 300 ms, harakatsiz.
 * TopBar (z-40) ustida turishi uchun body ga portal qilinadi.
 */
export function OrderOverlay() {
  const [reduced] = useState(prefersReduced)
  const [stamped, setStamped] = useState(reduced)
  const cardRef = useRef<HTMLDivElement>(null)
  const [date] = useState(today)

  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true })
    const timers: number[] = []
    if (reduced) {
      playStamp()
      timers.push(window.setTimeout(finish, T.reducedDone))
    } else {
      playWhoosh()
      timers.push(
        window.setTimeout(() => {
          playStamp()
          setStamped(true)
        }, T.impact),
        window.setTimeout(finish, T.done),
      )
    }
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [reduced])

  return createPortal(
    <div
      className={'order-root ' + (reduced ? 'order-reduced' : '') + (getState().quality === 'low' ? ' order-low' : '')}
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-title"
    >
      <div className="order-lift">
        <div ref={cardRef} tabIndex={-1} className="order-card outline-none">
          <div className="order-head">
            <img src={LOGO_EMBLEM} alt="" width={40} height={40} className="order-emblem" />
            <p className="order-eyebrow">CaseCraft · AI o‘quv simulyatsiyasi</p>
          </div>
          <h2 id="order-title" className="order-title">
            Himoyachi orderi<span className="sr-only"> · </span>
            <span className="order-subtitle">O‘quv namunasi</span>
          </h2>
          <dl className="order-fields">
            <div>
              <dt>Ish</dt>
              <dd>Jinoyat ishi № 001</dd>
            </div>
            <div>
              <dt>Modda</dt>
              <dd>{CASE.article}</dd>
            </div>
            <div>
              <dt>Himoyachi</dt>
              <dd>Siz (talaba)</dd>
            </div>
            <div>
              <dt>Sana</dt>
              <dd>{date}</dd>
            </div>
          </dl>
          <div className="order-foot">
            <span className="order-sign">Imzo</span>
            <span className="order-note">O‘quv hujjati — rasmiy kuchga ega emas</span>
          </div>
          <div className="order-seal-wrap">
            <OrderSeal className="order-seal" />
            <span className="order-ink" aria-hidden />
          </div>
        </div>
      </div>
      <p className="sr-only" role="status">
        {stamped ? 'Himoyachi orderi tasdiqlandi. Ish papkasi ochilmoqda.' : ''}
      </p>
    </div>,
    document.body,
  )
}

function finish() {
  // marosim davomida foydalanuvchi Esc bilan chiqib ketgan bo‘lsa — o‘tmaymiz
  if (getState().phase === 'select') actions.chooseRole()
}
