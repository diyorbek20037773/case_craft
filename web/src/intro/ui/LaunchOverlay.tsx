import { useEffect, useState } from 'react'
import { simHref, type ModeId } from '../config'
import { actions, getState } from '../state'
import { playStamp, setMusicPhase } from './audio'
import { LOGO_LARGE } from './content'
import { AiBadge } from './TopBar'

/**
 * "Sud kelmoqda" marosimi (phase === 'launch', ~3.3 s; reduced-motion 0.45 s):
 *   0 ms    musiqa jim
 *   300 ms  letterbox (9vh)
 *   600 ms  pastda yozilib chiqadigan subtitr «KOTIB: Sud kelmoqda, hamma o‘rnidan tursin!»
 *           (vaqtga bog‘liq: har 28 ms bir harf, 2100 ms gacha albatta to‘liq — kadr tezligiga bog‘liq emas)
 *   2400 ms markazda emblema + "Jinoyat ishi № 001 · {rejim}"
 *   2900 ms qora (#04060b) parda, 350 ms
 *   3300 ms simHref(mode) ga o‘tish
 * 3D kamera uchishi (scene/) ortda davom etadi — overlay shaffof, faqat chetlari va oxirida parda qora.
 */

const T_BARS = 300
const T_SUB = 600
const T_EMBLEM = 2400
const T_CURTAIN = 2900
const T_GO = 3300
const REDUCED_GO = 450

const WHO = 'KOTIB:'
const LINE = 'Sud kelmoqda, hamma o‘rnidan tursin!'
/** bir harf — 28 ms; sekin GPU da kadrlar siyrak bo‘lsa ham harflar soni vaqtdan hisoblanadi */
const TYPE_MS = 28
/** emblemadan (2400 ms) oldin subtitr baribir to‘liq bo‘ladi */
const T_TYPED = 2100

const MODE_LABEL: Record<ModeId, string> = {
  talim: 'Ta’lim rejimi',
  majlis: 'Sud majlisi',
  dostlar: 'Do‘stlar bilan',
}

const BG = '#04060b'

export function LaunchOverlay() {
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  // 0 — boshlang‘ich, 1 — letterbox, 2 — subtitr, 3 — emblema, 4 — qora parda
  const [stage, setStage] = useState(reduced ? 3 : 0)
  const [typed, setTyped] = useState(reduced ? LINE.length : 0)
  const [mode] = useState<ModeId>(() => getState().mode)
  // navigatsiya bekor qilinsa (Esc / Stop) — 4 s dan keyin qutqaruv kartasi
  const [stuck, setStuck] = useState(false)

  // Hech qachon oq kadr bo‘lmasin: o‘tish paytida sahifa foni ham qora
  useEffect(() => {
    const html = document.documentElement
    const prev = [html.style.backgroundColor, document.body.style.backgroundColor]
    html.style.backgroundColor = BG
    document.body.style.backgroundColor = BG
    return () => {
      html.style.backgroundColor = prev[0]
      document.body.style.backgroundColor = prev[1]
    }
  }, [])

  useEffect(() => {
    setMusicPhase('launch')
    const timers: number[] = []
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms))
    const go = () => {
      window.location.href = simHref(getState().mode)
    }

    if (reduced) {
      // ikki kadrdan keyin parda (transition 300 ms), 450 ms da o‘tish
      let raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => setStage(4))
      })
      at(REDUCED_GO, go)
      at(REDUCED_GO + 4000, () => setStuck(true))
      return () => {
        cancelAnimationFrame(raf)
        timers.forEach((t) => window.clearTimeout(t))
      }
    }

    // Subtitr: bitta rAF sikli, performance.now() bo‘yicha. Kadr 300 ms cho‘zilsa ham harflar "yetib oladi".
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const el = now - t0
      if (el >= T_SUB) {
        const n = el >= T_TYPED ? LINE.length : Math.min(LINE.length, Math.floor((el - T_SUB) / TYPE_MS))
        setTyped(n) // qiymat o‘zgarmasa React qayta chizmaydi
        if (n >= LINE.length) return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    at(T_BARS, () => setStage(1))
    at(T_SUB, () => setStage(2))
    // zaxira: rAF to‘xtab qolsa (yashirin vkladka, juda band GPU) — matn baribir 2100 ms da to‘liq
    at(T_TYPED, () => setTyped(LINE.length))
    at(T_EMBLEM, () => {
      setStage(3)
      playStamp()
    })
    at(T_CURTAIN, () => setStage(4))
    at(T_GO, go)
    at(T_GO + 4000, () => setStuck(true))
    return () => {
      cancelAnimationFrame(raf)
      timers.forEach((t) => window.clearTimeout(t))
    }
  }, [reduced])

  const subVisible = stage >= 2
  // emblema chiqqanda subtitr albatta to‘liq (taymer/rAF qanchalik kechikmasin)
  const shownTyped = stage >= 3 ? LINE.length : typed
  const typing = subVisible && shownTyped < LINE.length

  return (
    <div className="lc-root" data-s={stage} role="status" aria-live="assertive">
      <p className="sr-only">
        {WHO} {LINE} Jinoyat ishi № 001, {MODE_LABEL[mode]}. Majlis boshlanmoqda.
      </p>

      <div className="lc-scrim" aria-hidden />
      <div className="lc-center" aria-hidden>
        <div className="lc-emblem">
          <img src={LOGO_LARGE} alt="" width={900} height={747} />
        </div>
        <p className="lc-case">
          <span>
            Jinoyat ishi № 001 · <b>{MODE_LABEL[mode]}</b>
          </span>
        </p>
      </div>

      <div className="lc-bar lc-bar-top" aria-hidden>
        <AiBadge />
      </div>
      <div className="lc-bar lc-bar-bot" aria-hidden>
        {subVisible && (
          <p className="lc-sub">
            <span className="lc-sub-who">{WHO}</span> {LINE.slice(0, shownTyped)}
            {typing && <span className="lc-caret" />}
            {/* qolgan qism joyni egallab turadi — markazlangan matn yozilayotganda siljimaydi */}
            <span className="invisible">{LINE.slice(shownTyped)}</span>
          </p>
        )}
      </div>

      <div className="lc-curtain" aria-hidden />

      {stuck && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 5, display: 'grid', placeItems: 'center', padding: 16 }}
        >
          <div className="glass-strong" style={{ padding: '24px 28px', borderRadius: 16, textAlign: 'center', maxWidth: 420 }}>
            <p style={{ margin: '0 0 16px', color: '#efe6d2' }}>Majlis sahifasi ochilmadi.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a className="btn-primary" href={simHref(mode)}>
                Majlisni ochish
              </a>
              <button type="button" className="btn-secondary" onClick={() => actions.restoreFromLaunch()}>
                Ish papkasiga qaytish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
