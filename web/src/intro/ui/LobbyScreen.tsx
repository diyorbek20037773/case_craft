import { useEffect, useState } from 'react'
import { LOBBY, type LobbySeat } from './content'
import { IconCheck, IconCopy, IconShield, Star8Frame } from './icons'
import { StageHeader } from './StageHeader'

const FLAP_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'

function prefersReduced() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Aeroport tablosidek: har belgi tasodifiy belgilar orqali aylanib, 60 ms oraliq bilan o‘z joyiga tushadi */
function SplitFlap({ text }: { text: string }) {
  const [reduced] = useState(prefersReduced)
  const [shown, setShown] = useState(() => (reduced ? text : text.replace(/[^-\s]/g, ' ')))

  useEffect(() => {
    if (reduced) return
    const start = performance.now()
    const id = window.setInterval(() => {
      const t = performance.now() - start
      let done = true
      const next = text
        .split('')
        .map((ch, i) => {
          if (ch === '-' || ch === ' ') return ch
          if (t >= 320 + i * 60) return ch
          done = false
          return t < i * 60 ? ' ' : FLAP_CHARS[Math.floor(Math.random() * FLAP_CHARS.length)]
        })
        .join('')
      setShown(next)
      if (done) window.clearInterval(id)
    }, 55)
    return () => window.clearInterval(id)
  }, [text, reduced])

  return (
    <span className="flap-row" aria-label={text} role="img">
      {shown.split('').map((ch, i) =>
        text[i] === '-' ? (
          <span key={i} className="flap-sep" aria-hidden>
            –
          </span>
        ) : (
          <span key={i} className="flap" aria-hidden>
            <span key={ch} className="flap-ch">
              {ch === ' ' ? ' ' : ch}
            </span>
          </span>
        ),
      )}
    </span>
  )
}

/* ---------- Zal rejasi (yuqoridan) ---------- */

type SeatPos = {
  x: number
  y: number
  desk: { x: number; y: number; w: number; h: number; rx?: number }
  /** yorliq (rol nomi) balandligi */
  label: number
  /** nazoratchidan keladigan chiziq egriligi (boshqaruv nuqtasi); bo‘lmasa — to‘g‘ri chiziq */
  ctrl?: [number, number]
}

/** Rejadagi joylar (viewBox 360×312). Kalit — LOBBY.seats[].role */
const POS: Record<string, SeatPos> = {
  Sudya: { x: 180, y: 44, desk: { x: 112, y: 30, w: 136, h: 28, rx: 4 }, label: 72, ctrl: [252, 150] },
  Kotib: { x: 56, y: 44, desk: { x: 26, y: 32, w: 60, h: 24, rx: 3 }, label: 72 },
  Guvoh: { x: 180, y: 122, desk: { x: 160, y: 108, w: 40, h: 28, rx: 8 }, label: 150 },
  Prokuror: { x: 80, y: 186, desk: { x: 28, y: 172, w: 104, h: 28, rx: 3 }, label: 214 },
  Himoyachi: { x: 280, y: 186, desk: { x: 228, y: 172, w: 104, h: 28, rx: 3 }, label: 214 },
  Sudlanuvchi: { x: 290, y: 248, desk: { x: 252, y: 236, w: 76, h: 24, rx: 3 }, label: 276 },
}
const MOD = { x: 180, y: 252 }

function seatWho(s: LobbySeat) {
  if (s.who === 'you') return 'Siz'
  if (s.who === 'friend') return s.label
  if (s.who === 'auto') return 'Avtomatik'
  return '✦ AI'
}

function SeatMark({ s, p, i }: { s: LobbySeat; p: SeatPos; i: number }) {
  if (s.who === 'you' || s.who === 'friend') {
    const you = s.who === 'you'
    return (
      <g>
        <circle cx={p.x} cy={p.y} r="14" className={you ? 'plan-seat-you' : 'plan-seat-friend'} />
        <text x={p.x} y={p.y + 3.6} textAnchor="middle" className={you ? 'plan-initial-you' : 'plan-initial'}>
          {you ? 'Siz' : (s.initials ?? '')}
        </text>
      </g>
    )
  }
  if (s.who === 'auto') {
    return (
      <g>
        <circle cx={p.x} cy={p.y} r="13" className="plan-seat-auto" />
        <path d={`M${p.x - 5} ${p.y - 4}h10M${p.x - 5} ${p.y}h10M${p.x - 5} ${p.y + 4}h6`} className="plan-auto-lines" />
      </g>
    )
  }
  return (
    <g>
      <circle cx={p.x} cy={p.y} r="14" className="plan-ai-pulse" style={{ animationDelay: `${i * 0.35}s` }} />
      <circle cx={p.x} cy={p.y} r="14" className="plan-seat-ai" />
      <text x={p.x} y={p.y + 3.4} textAnchor="middle" className="plan-ai-text">
        AI
      </text>
    </g>
  )
}

function CourtPlan() {
  const seats = LOBBY.seats.filter((s) => POS[s.role])
  return (
    <svg viewBox="0 0 360 312" className="court-plan" role="img" aria-labelledby="plan-title plan-desc">
      <title id="plan-title">Sud zali rejasi (yuqoridan)</title>
      <desc id="plan-desc">
        {seats.map((s) => `${s.role}: ${s.who === 'ai' ? 'AI agent' : s.label}`).join('; ')}. Nazoratchi agent har bir o‘ringa
        ulangan.
      </desc>
      {/* zal va o‘rta yo‘lak */}
      <rect x="4" y="4" width="352" height="304" rx="12" className="plan-room" />
      <rect x="96" y="20" width="168" height="46" rx="6" className="plan-platform" />
      <rect x="166" y="170" width="28" height="138" className="plan-aisle" />
      <line x1="166" y1="170" x2="166" y2="308" className="plan-aisle-edge" />
      <line x1="194" y1="170" x2="194" y2="308" className="plan-aisle-edge" />

      {/* nazoratchi agentdan har o‘ringa harakatlanuvchi punktir */}
      {seats.map((s) => {
        const p = POS[s.role]
        const [cx, cy] = p.ctrl ?? [(MOD.x + p.x) / 2, (MOD.y + p.y) / 2]
        return <path key={`l-${s.role}`} d={`M${MOD.x} ${MOD.y}Q${cx} ${cy} ${p.x} ${p.y}`} className="plan-link" />
      })}

      {/* stollar */}
      {seats.map((s) => {
        const d = POS[s.role].desk
        return <rect key={`d-${s.role}`} x={d.x} y={d.y} width={d.w} height={d.h} rx={d.rx ?? 3} className="plan-desk" />
      })}

      {/* o‘rinlar */}
      {seats.map((s, i) => (
        <SeatMark key={`s-${s.role}`} s={s} p={POS[s.role]} i={i} />
      ))}

      {/* yorliqlar */}
      {seats.map((s) => {
        const p = POS[s.role]
        return (
          <g key={`t-${s.role}`}>
            <text x={p.x} y={p.label} textAnchor="middle" className="plan-role">
              {s.role.toUpperCase()}
            </text>
            <text
              x={p.x}
              y={p.label + 12}
              textAnchor="middle"
              className={s.who === 'ai' ? 'plan-who-ai' : s.who === 'auto' ? 'plan-who-auto' : 'plan-who'}
            >
              {seatWho(s)}
            </text>
          </g>
        )
      })}

      {/* nazoratchi agent */}
      <g>
        <circle cx={MOD.x} cy={MOD.y} r="17" className="plan-mod" />
        <path
          d={`M${MOD.x} ${MOD.y - 9}l7 2.8v5.2c0 4.3-3 7.7-7 8.8-4-1.1-7-4.5-7-8.8v-5.2z`}
          className="plan-mod-icon"
        />
        <text x={MOD.x} y={MOD.y + 32} textAnchor="middle" className="plan-mod-label">
          NAZORATCHI AGENT
        </text>
      </g>
    </svg>
  )
}

/**
 * phase 'lobby': "Do‘stlar bilan" rejimining NAMUNAVIY lobbisi. Hech narsa tarmoqqa ulanmaydi —
 * xona ochish va nusxalash tugmalari ataylab o‘chirilgan ("Tez orada").
 * Desktop: panellar ikki chetda, markazda 3D personajlar ko‘rinadi.
 */
export function LobbyScreen() {
  const friends = LOBBY.seats.filter((s) => s.who === 'friend').length
  const ai = LOBBY.seats.filter((s) => s.who === 'ai').length
  // kod yuritadigan o‘rinlar (AI agent emas): kotib, sudlanuvchi
  const autos = LOBBY.seats.filter((s) => s.who === 'auto').map((s) => s.role.toLowerCase())
  const summary = [`${friends} do‘st`, `${ai} o‘rin AI da`, autos.length ? `${autos.join(' va ')} avtomatik` : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <StageHeader title="Do‘stlar bilan" hint="Namunaviy lobbi — rejim tez orada ishga tushadi" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[calc(var(--stage-top)+5.5rem)] overflow-y-auto px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] [scrollbar-width:none] sm:top-[calc(var(--stage-top)+7rem)] sm:px-6 lg:pb-12">
        <div className="mx-auto grid max-w-[640px] gap-3 sm:gap-4 lg:max-w-[1440px] lg:grid-cols-[min(380px,29vw)_1fr_min(410px,31vw)] lg:grid-rows-[auto_1fr] lg:gap-x-6 lg:gap-y-4">
          {/* xona kodi */}
          <section
            className="glass-strong intro-rise pointer-events-auto p-4 sm:p-5 lg:col-start-1 lg:row-start-1"
            aria-labelledby="lobby-code"
          >
            <p id="lobby-code" className="eyebrow m-0">
              Xona kodi
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              <SplitFlap text={LOBBY.code} />
              <button type="button" className="btn-secondary ml-auto" disabled title="Tez orada">
                <IconCopy className="size-5" />
                Nusxalash
              </button>
            </div>
            <p className="m-0 mt-2.5 text-sm text-ivory/75">Do‘stlaringiz shu kod bilan xonaga kiradi va bo‘sh rolni oladi.</p>
          </section>

          {/* zal rejasi */}
          <section
            className="glass-strong intro-rise intro-rise-d1 pointer-events-auto relative flex flex-col overflow-hidden p-4 sm:p-5 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:self-start"
            aria-labelledby="lobby-plan"
          >
            <span className="lobby-ribbon" aria-hidden>
              Namuna · Tez orada
            </span>
            <h3 id="lobby-plan" className="m-0 pr-16 font-display text-[1.7rem] font-semibold leading-none text-ivory">
              Zal rejasi
            </h3>
            <p className="m-0 mt-1.5 pr-14 text-sm text-ivory/75">{summary}</p>
            <div className="mt-3">
              <CourtPlan />
            </div>
            <ul className="m-0 mt-2.5 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0 text-xs text-ivory/75">
              <li className="flex items-center gap-1.5">
                <span className="legend-dot legend-friend" aria-hidden /> Do‘st / Siz
              </li>
              <li className="flex items-center gap-1.5">
                <span className="legend-dot legend-ai" aria-hidden /> AI agent
              </li>
              <li className="flex items-center gap-1.5">
                <span className="legend-dot legend-auto" aria-hidden /> Avtomatik (kod)
              </li>
            </ul>
            <div className="mt-4 flex flex-col items-stretch gap-2">
              <button type="button" className="btn-primary btn-gold" disabled aria-describedby="lobby-soon">
                Xonani ochish
              </button>
              <p id="lobby-soon" className="m-0 text-center text-sm text-ivory/75">
                <span className="font-semibold text-gold-soft">Tez orada.</span> Hozircha Ta’lim yoki Sud majlisi rejimini
                tanlang.
              </p>
            </div>
          </section>

          {/* nazoratchi agent */}
          <section
            className="glass-strong intro-rise intro-rise-d2 pointer-events-auto relative overflow-hidden p-4 sm:p-5 lg:col-start-1 lg:row-start-2 lg:self-start"
            aria-labelledby="lobby-mod"
          >
            <div className="flex items-center gap-3">
              <span className="mode-icon size-14" aria-hidden>
                <Star8Frame className="mode-icon-star" />
                <IconShield className="relative size-6" />
              </span>
              <div className="min-w-0">
                <h3 id="lobby-mod" className="m-0 font-display text-[1.7rem] font-semibold leading-none text-ivory">
                  {LOBBY.moderator.title}
                </h3>
                <p className="m-0 mt-1 text-xs font-bold uppercase tracking-[0.14em] text-gold">Moderator · AI agent</p>
              </div>
            </div>
            <p className="m-0 mt-3 text-[0.95rem] text-ivory/85">{LOBBY.moderator.lead}</p>
            <ul className="m-0 mt-3 grid list-none gap-2 p-0">
              {LOBBY.moderator.duties.map((d) => (
                <li key={d} className="flex items-start gap-2 text-[0.95rem] text-ivory/90">
                  <IconCheck className="mt-0.5 size-5 shrink-0 text-gold" />
                  {d}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  )
}
