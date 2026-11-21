// Ish papkasi sahifalari mazmuni. Har bo‘lim: chap va o‘ng sahifa (ikki betlik ko‘rinish) yoki bitta sahifa (mobil).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { playSealCrack } from '../audio'
import { portraitOf } from '../portraits'
import { CASE_FILE as C, SECTIONS } from './caseData'
import { CctvStill, ClippedPhoto, DocSheet, Emblem, Lineup, Receipt, WaxSeal } from './caseArt'

export type Side = 'left' | 'right' | 'single'

export type PageCtx = {
  exhibit: number
  setExhibit: (n: number) => void
  /** CaseBook ichida bir martalik himoyalangan start */
  onStart: () => void
  onNext: () => void
  /** CaseBook sessiyasi (bfcache bilan qaytilganda +1) — muhr shu bilan qayta "butun" bo‘ladi */
  session: number
}

const AI_LABEL = 'AI o‘quv simulyatsiyasi'

function Paper({
  index,
  side,
  actions,
  children,
}: {
  index: number
  side: Side
  /** sahifa pastida, scroll'dan tashqarida — doim ko‘rinadigan tugmalar */
  actions?: ReactNode
  children: ReactNode
}) {
  const pageNo = side === 'single' ? index + 1 : side === 'left' ? index * 2 : index * 2 + 1
  return (
    <div className={`cb-paper cb-paper--${side}`} data-page={index}>
      <header className="cb-runhead" aria-hidden>
        <span>Jinoyat ishi № {C.number}</span>
        <span>{SECTIONS[index].title}</span>
      </header>
      <div className="cb-paper__body">{children}</div>
      {actions && <div className="cb-paper__actions">{actions}</div>}
      <footer className="cb-runfoot">
        <span>To‘qima o‘quv ishi · {AI_LABEL}</span>
        <span aria-hidden>— {pageNo} —</span>
      </footer>
    </div>
  )
}

function Title({ kicker, children }: { kicker?: string; children: ReactNode }) {
  return (
    <div className="cb-title">
      {kicker && <p className="cb-kicker">{kicker}</p>}
      <h3>{children}</h3>
    </div>
  )
}

function StartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="cb-ico" aria-hidden focusable="false">
      <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
    </svg>
  )
}

/* ---------------- 1. Ish varaqasi ---------------- */

/** Muqovaning ichki tomoni: charm cho‘ntak, ichida kadr va chek (faqat ikki betlik ko‘rinishda) */
export function InsideCover() {
  return (
    <div className="cb-inside" aria-hidden>
      <div className="cb-inside__label">
        <Emblem className="cb-inside__emblem" />
        <span>Ish materiallari</span>
        <b>№ {C.number}</b>
      </div>
      <div className="cb-inside__items">
        <div className="cb-inside__still">
          <CctvStill />
          <span className="cb-tag">E1</span>
        </div>
        <div className="cb-inside__receipt">
          <Receipt />
          <span className="cb-tag">E4</span>
        </div>
      </div>
      <div className="cb-pocket">
        <span>Dalillar nusxasi</span>
      </div>
    </div>
  )
}

function Pills() {
  return (
    <ul className="cb-pills" aria-label="Ish ma’lumotlari">
      <li>
        <svg viewBox="0 0 24 24" className="cb-ico" aria-hidden focusable="false">
          <path
            d="M12 3v17M5 20h14M4 7h16M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
        {C.articleShort}
      </li>
      <li>
        <svg viewBox="0 0 24 24" className="cb-ico" aria-hidden focusable="false">
          <path d="M5 19v-4M10 19v-8M15 19V7M20 19V4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        <span className="cb-sr">Qiyinlik: </span>
        {C.difficulty}
      </li>
      <li>
        <svg viewBox="0 0 24 24" className="cb-ico" aria-hidden focusable="false">
          <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <path d="M12 7v5l3 2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        <span className="cb-sr">Davomiyligi: </span>
        {C.duration}
      </li>
    </ul>
  )
}

/** "Jinoyat ishi № 001" — sahifa boshida (runhead) bor; bu yerda takrorlanmaydi */
function CoverSheet() {
  return (
    <>
      <div className="cb-sheet-head">
        <span className="cb-kicker">Ish varaqasi</span>
        <span className="cb-rule" aria-hidden />
        <span className="cb-stamp cb-stamp--inline" aria-hidden>
          O‘quv
        </span>
      </div>
      <h3 className="cb-case-title">{C.title}</h3>
      <Pills />
      <p className="cb-fiction">
        <span aria-hidden>i</span>
        {C.fictionalNote}
      </p>
      <p className="cb-text">{C.summary}</p>
    </>
  )
}

/** 1-sahifa tugmalari: asosiy — oltin "Majlisni boshlash", ikkinchi darajali — "Ishni o‘qish" */
function CoverActions({ ctx }: { ctx: PageCtx }) {
  return (
    <div className="cb-sheet-actions">
      <button type="button" className="cb-btn cb-btn--paper" onClick={ctx.onNext}>
        Ishni o‘qish
        <span aria-hidden>›</span>
      </button>
      <button type="button" className="cb-btn cb-btn--gold" onClick={ctx.onStart}>
        <StartIcon />
        Majlisni boshlash
      </button>
    </div>
  )
}

/* ---------------- 2. Ayblov va sudlanuvchi ---------------- */

function ChargePart() {
  return (
    <>
      <Title kicker="Ayblov">{C.charge.article}</Title>
      <blockquote className="cb-typed">
        <span className="cb-typed__label">Ayblovdan ko‘chirma</span>
        {C.charge.text}
      </blockquote>
      <h4 className="cb-h4">Davlat ayblovchisining pozitsiyasi</h4>
      <p className="cb-text cb-text--sm">{C.prosecutor}</p>
    </>
  )
}

function DefendantPart() {
  return (
    <>
      <Title kicker="Sudlanuvchi">{C.defendant.name}</Title>
      <div className="cb-person">
        <ClippedPhoto src={portraitOf('sudlanuvchi')} caption={`Sudlanuvchi ${C.defendant.name}`} tilt={-3} />
        <dl className="cb-facts-dl">
          <div>
            <dt>Yoshi</dt>
            <dd>29 yosh</dd>
          </div>
          <div>
            <dt>Kasbi</dt>
            <dd>kuryer</dd>
          </div>
          <div>
            <dt>Sudlanganligi</dt>
            <dd>ilgari sudlanmagan</dd>
          </div>
          <div>
            <dt>Pozitsiyasi</dt>
            <dd>aybiga iqror emas</dd>
          </div>
        </dl>
      </div>
      <p className="cb-text">{C.defendant.about}</p>
      <p className="cb-note">Siz uning himoyachisisiz.</p>
    </>
  )
}

/* ---------------- 3. Voqea faktlari ---------------- */

const RULER_FROM = 19 * 60
const RULER_TO = 20 * 60

function toMin(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function rulerPct(t: string) {
  return ((toMin(t) - RULER_FROM) / (RULER_TO - RULER_FROM)) * 100
}

/** Vaqt chizig‘idan dalil bo‘yicha yozuv (E4, E5, E1 — caseData.timeline, ochiq faktlar) */
function timeOf(id: string) {
  return C.timeline.find((t) => t.src.startsWith(id))
}

const fxDelay = (i: number) => ({ ['--i' as string]: i }) as CSSProperties

/**
 * 19:00–20:00 chizg‘ich: kassa cheki (E4) va videoyozuv (E1) orasidagi farq oltin qavs bilan.
 * Hamma vaqtlar caseData.timeline dan olinadi; farq hisoblanadi (qo‘lda yozilmaydi).
 */
function TimeRuler() {
  const receipt = timeOf('E4')
  const claim = timeOf('E5')
  const video = timeOf('E1')
  if (!receipt || !video) return null
  const gap = toMin(video.time) - toMin(receipt.time)
  const a = rulerPct(receipt.time)
  const b = rulerPct(video.time)
  const ticks = Array.from({ length: 13 }, (_, i) => i * 5)
  const marks = [
    { t: receipt, pos: a, label: 'E4 · kassa cheki', i: 0 },
    { t: video, pos: b, label: 'E1 · videoyozuv', i: 2 },
  ]
  return (
    <figure className="cb-ruler">
      <div
        className="cb-ruler__track"
        role="img"
        aria-label={`Vaqt chizg‘ichi 19:00 dan 20:00 gacha: kassa cheki ${receipt.time}, videoyozuv ${video.time}, oradagi farq ${gap} daqiqa`}
      >
        <span className="cb-ruler__line cb-fx" />
        {ticks.map((m) => (
          <span
            key={m}
            className={'cb-ruler__tick cb-fx' + (m % 15 === 0 ? ' is-major' : '')}
            style={{ left: `${(m / 60) * 100}%` }}
          />
        ))}
        <span className="cb-ruler__axis cb-ruler__axis--start">19:00</span>
        <span className="cb-ruler__axis cb-ruler__axis--end">20:00</span>
        {claim && (
          <span
            className="cb-ruler__mark cb-ruler__mark--claim cb-fx"
            style={{ left: `${rulerPct(claim.time)}%`, ...fxDelay(1) }}
          >
            <span className="cb-ruler__dot" />
            <span className="cb-ruler__under">{claim.time} · E5</span>
          </span>
        )}
        {marks.map((m) => (
          <span key={m.label} className="cb-ruler__mark cb-fx" style={{ left: `${m.pos}%`, ...fxDelay(m.i) }}>
            <span className="cb-ruler__label">
              <b>{m.t.time}</b>
              <small>{m.label}</small>
            </span>
            <span className="cb-ruler__dot" />
            <span className="cb-ruler__guide" />
          </span>
        ))}
        <span className="cb-ruler__bracket cb-fx" style={{ left: `${a}%`, width: `${b - a}%`, ...fxDelay(3) }}>
          <span className="cb-ruler__gap">{gap} daqiqa</span>
        </span>
      </div>
      {claim && (
        <figcaption className="cb-ruler__cap">
          Vaqtlarni solishtiring: sudlanuvchi {claim.time} da chiqib ketganini aytadi, videoyozuv esa {video.time} ni
          ko‘rsatadi.
        </figcaption>
      )}
    </figure>
  )
}

function TimelinePart() {
  return (
    <>
      <Title kicker="Voqea faktlari">14-mart, «Texnodunyo» do‘koni</Title>
      <TimeRuler />
      <ol className="cb-timeline">
        {C.timeline.map((t) => (
          <li key={t.time}>
            <time>{t.time}</time>
            <div>
              <p>{t.text}</p>
              <small>{t.src}</small>
            </div>
          </li>
        ))}
      </ol>
    </>
  )
}

function FactsPart() {
  return (
    <>
      <h4 className="cb-h4 cb-h4--first">Ish holatlari</h4>
      <ol className="cb-factlist">
        {C.facts.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ol>
    </>
  )
}

/* ---------------- 4. Dalillar ---------------- */

function EvidenceList({ ctx, compact }: { ctx: PageCtx; compact?: boolean }) {
  return (
    <>
      <Title kicker="Dalillar">Ish materiallaridagi 5 ta dalil</Title>
      {!compact && <p className="cb-text cb-text--sm cb-muted">Batafsil ko‘rish uchun dalilni tanlang.</p>}
      <div className={'cb-exhibits' + (compact ? ' cb-exhibits--compact' : '')} role="group" aria-label="Dalillar">
        {C.evidence.map((e, i) => (
          <button
            key={e.id}
            type="button"
            className="cb-exhibit"
            aria-pressed={ctx.exhibit === i}
            onClick={() => ctx.setExhibit(i)}
          >
            <span className="cb-exhibit__id">{e.id}</span>
            <span className="cb-exhibit__name">{compact ? shortName(e.name) : e.name}</span>
          </button>
        ))}
      </div>
    </>
  )
}

function shortName(name: string) {
  return name.split(' ')[0]
}

function ExhibitVisual({ id }: { id: string }) {
  if (id === 'E1') return <CctvStill live />
  if (id === 'E3') return <Lineup />
  if (id === 'E4') return <Receipt />
  return <DocSheet kind={id === 'E2' ? 'E2' : 'E5'} />
}

function EvidenceDetail({ ctx }: { ctx: PageCtx }) {
  const e = C.evidence[ctx.exhibit] ?? C.evidence[0]
  return (
    <div className="cb-exdetail" key={e.id}>
      <span className="cb-stamp cb-stamp--big" aria-hidden>
        Dalil {e.id}
      </span>
      <div className="cb-exdetail__visual">
        <ExhibitVisual id={e.id} />
      </div>
      <p className="cb-kicker">Dalil {e.id}</p>
      <h4 className="cb-exdetail__name">{e.name}</h4>
      <p className="cb-text">{e.about}</p>
    </div>
  )
}

/* ---------------- 5. Guvoh ---------------- */

function WitnessPart() {
  return (
    <>
      <Title kicker="Guvoh">{C.witness.name}</Title>
      <div className="cb-person cb-person--witness">
        <ClippedPhoto src={portraitOf('guvoh')} caption={`Guvoh ${C.witness.name}`} tilt={2.5} />
        <div>
          <p className="cb-text">{C.witness.role}.</p>
          <p className="cb-note">Majlisda siz uni so‘roq qilasiz. Savollaringiz ochiq bo‘lsin.</p>
        </div>
      </div>
      {/* E3 va guvohning ochiq ko‘rsatuvi: 4 ta fotosurat, «o‘xshaydi». Raqam ko‘rsatilmaydi — ochiq ma’lumotda yo‘q. */}
      <figure className="cb-idfig">
        <h4 className="cb-h4">Fotosuratdan tanib olish · E3</h4>
        <Lineup marked={2} />
        <figcaption className="cb-text cb-text--sm cb-muted">
          Ertasi kuni tergovchi 4 ta fotosurat ko‘rsatgan; guvoh Sodiqovni «o‘xshaydi» deb ko‘rsatgan. Tanib olish
          sharoiti bayonnomada batafsil yozilmagan.
        </figcaption>
      </figure>
    </>
  )
}

function TestimonyPart() {
  return (
    <>
      <h4 className="cb-h4 cb-h4--first">Tergovdagi ko‘rsatuvidan</h4>
      <ul className="cb-testimony">
        {C.witness.publicFacts.map((f, i) => (
          <li key={i}>«{f}»</li>
        ))}
      </ul>
    </>
  )
}

/* ---------------- 6. Vazifa ---------------- */

function BriefPart() {
  return (
    <>
      <Title kicker="Sizning vazifangiz">Himoyachi sifatida</Title>
      <p className="cb-text">{C.studentTask}</p>
      <div className="cb-memo">
        <span className="cb-memo__pin" aria-hidden />
        <h4>Himoya yo‘nalishi</h4>
        <p>{C.defense}</p>
      </div>
    </>
  )
}

const CRACK_MS = 250

/** Mum muhr ustidagi "Majlisni boshlash": bosilganda ikki bo‘lakka ±12° sinadi, keyin majlis boshlanadi */
function SealStart({ onStart }: { onStart: () => void }) {
  const [cracked, setCracked] = useState(false)
  // takroriy bosish himoyasi (state yangilanguncha ikkinchi click ham kelishi mumkin) + unmount'da taymer tozalanadi:
  // muhr bosilib darhol "Orqaga" bosilsa, majlis baribir boshlanib ketmasin
  const fired = useRef(false)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const crack = () => {
    if (fired.current) return
    fired.current = true
    setCracked(true)
    playSealCrack()
    const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    timer.current = window.setTimeout(onStart, reduced ? 0 : CRACK_MS + 30)
  }
  const half = (s: 'l' | 'r') => (
    <span className={`cb-seal__half cb-seal__half--${s}`}>
      <WaxSeal className="cb-seal__art" />
      <span className="cb-seal__label">
        <StartIcon />
        <span>
          Majlisni
          <br />
          boshlash
        </span>
      </span>
    </span>
  )
  return (
    <div className="cb-seal-wrap">
      <button
        type="button"
        className={'cb-seal' + (cracked ? ' is-cracked' : '')}
        onClick={crack}
        aria-disabled={cracked || undefined}
      >
        <span className="cb-seal__ribbon cb-seal__ribbon--l" aria-hidden />
        <span className="cb-seal__ribbon cb-seal__ribbon--r" aria-hidden />
        <span className="cb-seal__body" aria-hidden>
          {half('l')}
          {half('r')}
        </span>
        <span className="cb-sr">Majlisni boshlash</span>
      </button>
      <p className="cb-seal__hint" aria-hidden>
        Muhrni sindiring — majlis boshlanadi
      </p>
    </div>
  )
}

function LaunchPart({ ctx }: { ctx: PageCtx }) {
  return (
    <>
      <h4 className="cb-h4 cb-h4--first">Majlis bosqichlari</h4>
      <ol className="cb-stages">
        {C.stages.map((s) => (
          <li key={s.id}>{s.label}</li>
        ))}
      </ol>
      <div className="cb-launch">
        <div className="cb-launch__text">
          <p className="cb-text cb-text--sm">
            Sudya, prokuror va guvoh — AI agentlar; sudlanuvchining oxirgi so‘zi va bayonnoma — kod.
          </p>
          <p className="cb-text cb-text--sm cb-muted">
            {AI_LABEL}, real sud qarori emas. Davomiyligi: {C.duration}.
          </p>
        </div>
        <SealStart key={ctx.session} onStart={ctx.onStart} />
      </div>
    </>
  )
}

/* ---------------- Yig‘ish ---------------- */

export function SectionPage({ index, side, ctx }: { index: number; side: Side; ctx: PageCtx }) {
  if (index === 0 && side === 'left') return <InsideCover />

  const parts: Record<number, { left: ReactNode; right: ReactNode; single?: ReactNode; actions?: ReactNode }> = {
    0: { left: null, right: <CoverSheet />, actions: <CoverActions ctx={ctx} /> },
    1: { left: <ChargePart />, right: <DefendantPart /> },
    2: { left: <TimelinePart />, right: <FactsPart /> },
    3: {
      left: <EvidenceList ctx={ctx} />,
      right: <EvidenceDetail ctx={ctx} />,
      single: (
        <>
          <EvidenceList ctx={ctx} compact />
          <EvidenceDetail ctx={ctx} />
        </>
      ),
    },
    4: { left: <WitnessPart />, right: <TestimonyPart /> },
    5: { left: <BriefPart />, right: <LaunchPart ctx={ctx} /> },
  }
  const p = parts[index]
  const content =
    side === 'single'
      ? (p.single ?? (
          <>
            {p.left}
            {p.left && <hr className="cb-sep" aria-hidden />}
            {p.right}
          </>
        ))
      : side === 'left'
        ? p.left
        : p.right

  return (
    <Paper index={index} side={side} actions={side === 'left' ? undefined : p.actions}>
      {content}
    </Paper>
  )
}

/** Varaqning orqa tomoni (mobil varaqlashda) */
export function BlankPaper() {
  return <div className="cb-paper cb-paper--blank" aria-hidden />
}
