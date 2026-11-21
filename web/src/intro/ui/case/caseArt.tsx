// Ish papkasi uchun bezak elementlari (SVG / CSS). Hammasi dekorativ — aria-hidden.
import { useEffect, useId, useState } from 'react'
import { useIntro } from '../../state'
import { CASE_FILE } from './caseData'

/** Oltin tarozi + dafna gulchambari (muqova gerbi) */
export function Emblem({ className }: { className?: string }) {
  const leaves = Array.from({ length: 7 }, (_, i) => i)
  const gid = 'cbg' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const fill = `url(#${gid})`
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden focusable="false">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3dca0" />
          <stop offset="0.45" stopColor="#d4ad62" />
          <stop offset="1" stopColor="#9a7536" />
        </linearGradient>
      </defs>
      <g fill={fill} stroke="none">
        {/* dafna barglari: chap va o‘ng yoy */}
        <path d="M44 108A52 52 0 0 1 21 26M76 108A52 52 0 0 0 99 26" fill="none" stroke={fill} strokeWidth="1.4" />
        {leaves.flatMap((i) => {
          // yoy bo‘ylab pastdan yuqoriga: φ = 112°…214° (y pastga qaragan koordinatada)
          const phi = 112 + i * 17
          const rad = (phi * Math.PI) / 180
          return [-1, 1].map((side) => {
            const r = 52 + side * 4.5
            const x = 60 + Math.cos(rad) * r
            const y = 60 + Math.sin(rad) * r
            const rot = phi + side * 28
            return (
              <g key={`${i}${side}`}>
                <ellipse cx={x} cy={y} rx="2.8" ry="7" transform={`rotate(${rot} ${x} ${y})`} />
                <ellipse cx={120 - x} cy={y} rx="2.8" ry="7" transform={`rotate(${-rot} ${120 - x} ${y})`} />
              </g>
            )
          })
        })}
        {/* ustun va asos */}
        <rect x="58.4" y="30" width="3.2" height="58" rx="1.2" />
        <circle cx="60" cy="27" r="4" />
        <path d="M44 94h32l-4-6H48z" />
        {/* yelka (to‘sin) */}
        <rect x="30" y="38" width="60" height="3" rx="1.5" />
        {/* chap pallasi */}
        <path d="M33 41l-9 22h18z" fill="none" stroke={fill} strokeWidth="1.2" />
        <path d="M21 63h24a12 6 0 0 1-24 0z" />
        {/* o‘ng pallasi */}
        <path d="M87 41l-9 22h18z" fill="none" stroke={fill} strokeWidth="1.2" />
        <path d="M75 63h24a12 6 0 0 1-24 0z" />
      </g>
    </svg>
  )
}

/** Qog‘oz qisqich */
export function Paperclip({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 60" aria-hidden focusable="false">
      <path
        d="M8 18v28a6 6 0 0 0 12 0V12a9 9 0 0 0-18 0v34"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Yuzsiz siluet. v — kichik farqlar (tanib olish kartochkalarida har xil odam ko‘rinsin) */
export function Silhouette({ className, cap = true, v = 0 }: { className?: string; cap?: boolean; v?: number }) {
  const head = [11, 10, 11.6, 10.4][v % 4]
  const sh = [22, 24, 20, 23][v % 4]
  return (
    <svg className={className} viewBox="0 0 60 70" aria-hidden focusable="false">
      <circle cx="30" cy="24" r={head} fill="currentColor" />
      {cap && <path d="M18 22c0-9 6-13 12-13s12 4 12 13H18zM40 21h9v3H40z" fill="currentColor" />}
      <path d={`M${30 - sh} 70c0-16 ${sh * 0.45} -26 ${sh} -26s${sh} 10 ${sh} 26z`} fill="currentColor" />
    </svg>
  )
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Kamera soati: 19:41:02 dan 8 soniya sanab, yana 19:41:02 ga qaytadi (faqat jonli kadrda) */
function useCctvClock(live: boolean) {
  const lite = useIntro((st) => st.quality === 'low')
  const run = live && !lite && !prefersReducedMotion()
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!run) return
    const id = window.setInterval(() => setTick((v) => (v + 1) % 9), 1000)
    return () => window.clearInterval(id)
  }, [run])
  return `19:41:${String(2 + (run ? tick : 0)).padStart(2, '0')}`
}

/** E1 kadri (oq-qora, donador; o‘ng past burchak bo‘sh — soat shu yerda) */
const CCTV_SRC = '/intro/art/dalil-cctv.webp'
const CCTV_IMG_STYLE = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  objectPosition: '40% 50%',
} as const

/**
 * E1: kuzatuv kamerasi kadri (rasm + CSS qatlamlar). live — dalil sahifasidagi katta kadr:
 * skanlayn, 2 fps shovqin, miltillovchi REC, yuruvchi soat. Muqova ichidagi kichik nusxa — statik.
 */
export function CctvStill({ live = false }: { live?: boolean }) {
  const time = useCctvClock(live)
  return (
    <div className={'cb-cctv' + (live ? ' is-live' : '')} aria-hidden>
      <img
        src={CCTV_SRC}
        alt=""
        width={1200}
        height={800}
        loading="lazy"
        decoding="async"
        draggable={false}
        style={CCTV_IMG_STYLE}
      />
      <span className="cb-cctv__noise" />
      <span className="cb-cctv__scan" />
      <span className="cb-cctv__rec">
        <i />
        REC
      </span>
      <span className="cb-cctv__ts">14.03.2026 {time}</span>
    </div>
  )
}

/** E4: kassa cheki */
export function Receipt() {
  return (
    <div className="cb-receipt" aria-hidden>
      <b>«TEXNODUNYO»</b>
      <span>KASSA CHEKI</span>
      <i />
      <span>14.03.2026&nbsp;&nbsp;19:15</span>
      <span>Zaryadka kabeli</span>
      <i />
      <span className="cb-receipt__bars" />
    </div>
  )
}

/**
 * E3: 4 ta yuzsiz fotosurat (tanib olish). Raqamsiz — case.json da qaysi raqam ekani yozilmagan.
 * marked — qizil marker doirasi va «o‘xshaydi» qo‘lyozmasi tushadigan kartochka (faqat guvoh sahifasida).
 */
export function Lineup({ marked }: { marked?: number }) {
  const tilt = [-2.4, 1.8, -1.2, 2.6]
  return (
    <div className={'cb-lineup' + (marked !== undefined ? ' cb-lineup--marked' : '')} aria-hidden>
      {[0, 1, 2, 3].map((n) => (
        <div key={n} className="cb-lineup__ph" style={{ ['--r' as string]: `${tilt[n]}deg` }}>
          <Silhouette className="cb-lineup__s" cap={false} v={n} />
          {marked === n && (
            <>
              <svg className="cb-lineup__ring cb-fx" viewBox="0 0 100 120" preserveAspectRatio="none" focusable="false">
                <path
                  pathLength={1}
                  d="M52 6C24 4 6 26 7 58c1 34 20 56 45 55 27-1 42-26 41-57C92 26 76 7 46 9c-8 1-15 4-20 8"
                />
              </svg>
              <span className="cb-lineup__note cb-fx">«o‘xshaydi»</span>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

/** E2 / E5: hujjat varag‘i */
export function DocSheet({ kind }: { kind: 'E2' | 'E5' }) {
  return (
    <div className="cb-docsheet" aria-hidden>
      {kind === 'E2' ? (
        <>
          <b>DALOLATNOMA</b>
          <span>«ProBook 15» — yo‘q</span>
          <span>5 400 000 so‘m</span>
        </>
      ) : (
        <>
          <b>KO‘RSATUV</b>
          <span>{CASE_FILE.defendant.name}</span>
          <span>14.03.2026</span>
        </>
      )}
      <i />
      <i />
      <i className="cb-docsheet__short" />
    </div>
  )
}

/** Muzlatilgan (sepia) rasm — qisqich bilan */
export function ClippedPhoto({
  src,
  caption,
  tilt = -3,
  className,
}: {
  src: string
  caption: string
  tilt?: number
  className?: string
}) {
  // SVG siluet (to‘qima shaxs) — sepiya filtrsiz, o‘z ranglarida
  const plain = /\.svg($|\?)/i.test(src)
  return (
    <figure
      className={'cb-photo' + (plain ? ' cb-photo--plain' : '') + (className ? ' ' + className : '')}
      style={{ ['--tilt' as string]: `${tilt}deg` }}
    >
      <Paperclip className="cb-photo__clip" />
      <div className="cb-photo__img">
        <img src={src} alt={caption} width={480} height={640} loading="lazy" decoding="async" draggable={false} />
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  )
}

/** Mum muhr qirrasi: notekis, lekin har safar bir xil (deterministik) */
const SEAL_EDGE = (() => {
  const n = 30
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    const r = 91 + 3.6 * Math.sin(i * 2.7) + 2.4 * Math.cos(i * 5.3)
    return [100 + Math.cos(a) * r, 100 + Math.sin(a) * r] as const
  })
  const mid = (p: readonly number[], q: readonly number[]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
  const f = (v: number) => v.toFixed(1)
  const m0 = mid(pts[n - 1], pts[0])
  let d = `M${f(m0[0])} ${f(m0[1])}`
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n])
    d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f(m[0])} ${f(m[1])}`
  }
  return d + 'Z'
})()

/** CaseCraft 8 qirrali yulduzi: ikki kvadrat (96×96), biri 45° burilgan — birlashmasi (davlat muhri emas) */
const STAR = (() => {
  const outer = 48 * Math.SQRT2
  const inner = 48 / Math.cos(Math.PI / 8)
  const pts = Array.from({ length: 16 }, (_, i) => {
    const a = (i * Math.PI) / 8
    const r = i % 2 ? inner : outer
    return `${(100 + Math.cos(a) * r).toFixed(1)} ${(100 + Math.sin(a) * r).toFixed(1)}`
  })
  return 'M' + pts.join('L') + 'Z'
})()

/** To‘q qizil mum muhr (SVG). Matn ustidan HTML bilan qo‘yiladi. */
export function WaxSeal({ className }: { className?: string }) {
  const id = 'cbs' + useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <svg className={className} viewBox="0 0 200 200" aria-hidden focusable="false">
      <defs>
        <radialGradient id={`${id}w`} cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#b8392b" />
          <stop offset="0.55" stopColor="#841f17" />
          <stop offset="1" stopColor="#4f0d09" />
        </radialGradient>
        <radialGradient id={`${id}g`} cx="0.32" cy="0.26" r="0.4">
          <stop offset="0" stopColor="#ffd9cc" stopOpacity="0.38" />
          <stop offset="1" stopColor="#ffd9cc" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={SEAL_EDGE} fill={`url(#${id}w)`} />
      {/* bosilgan chuqurcha va halqa */}
      <circle cx="100" cy="100" r="76" fill="rgb(40 4 2 / 0.2)" />
      <circle cx="100" cy="101.5" r="77" fill="none" stroke="rgb(255 170 150 / 0.22)" strokeWidth="2" />
      <circle cx="100" cy="100" r="77" fill="none" stroke="rgb(30 2 0 / 0.45)" strokeWidth="2.4" />
      {/* 8 qirrali yulduz — bosma (deboss) */}
      <g fill="rgb(30 2 0 / 0.2)" stroke="rgb(255 175 155 / 0.3)" strokeWidth="1.4" strokeLinejoin="round">
        <path d={STAR} />
      </g>
      <circle cx="100" cy="100" r="4" fill="rgb(255 190 170 / 0.35)" />
      <path d={SEAL_EDGE} fill={`url(#${id}g)`} />
    </svg>
  )
}
