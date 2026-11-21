import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, PointerEvent, ReactNode, RefObject } from 'react'
import { useIntro } from '../state'
import { playTick } from './audio'
import {
  AGENT_ORDER,
  AI_LABEL,
  BUILT,
  FOOTER,
  LOGO_EMBLEM,
  NIZOM_NOTE,
  PEOPLE,
  PIPE_NOTES,
  PIPE_REJECT,
  PIPE_TAG_LABEL,
  PIPELINE,
  ROLE_BADGE,
  TEAM,
  TOOLS,
  WHY,
} from './content'
import type { PipeNode, PipeTag, WhyFact } from './content'
import { IconArrowRight, IconShield, IconSpark } from './icons'
import { portraitCaption, portraitOf } from './portraits'
import { openSlides } from './slidesStore'
import { RuleHeading } from './StageHeader'
import './slides/infoSections.css'

// ---------------------------------------------------------------- yordamchi hook'lar

const RM_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia?.(RM_QUERY)
  mq?.addEventListener?.('change', cb)
  return () => mq?.removeEventListener?.('change', cb)
}

/** Harakat ruxsat etilganmi: prefers-reduced-motion yo‘q va sifat 'low' emas */
function useMotionOk() {
  const quality = useIntro((s) => s.quality)
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    () => !!window.matchMedia?.(RM_QUERY).matches,
    () => false,
  )
  return quality !== 'low' && !reduced
}

/** Element ko‘rinishdami (IntersectionObserver). once — bir marta ko‘ringach true bo‘lib qoladi. */
function useInView<T extends Element>(ref: RefObject<T | null>, { once = false, threshold = 0.3 } = {}) {
  // IntersectionObserver yo‘q eski brauzerda — darhol "ko‘rinib turibdi"
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (once) io.disconnect()
        } else if (!once) setInView(false)
      },
      { threshold },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref, once, threshold])
  return inView
}

function Section({
  id,
  eyebrow,
  title,
  lead,
  wide = false,
  children,
}: {
  id: string
  eyebrow: string
  title: string
  lead?: string
  wide?: boolean
  children: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-[88px] px-4 py-16 sm:px-8 sm:py-20">
      <div className={'mx-auto ' + (wide ? 'max-w-[1400px]' : 'max-w-[1280px]')}>
        <p className="eyebrow m-0 text-center">{eyebrow}</p>
        <RuleHeading id={`${id}-h`} className="mt-2 text-[2rem] sm:text-[2.8rem] lg:text-[3.2rem]">
          {title}
        </RuleHeading>
        {lead && <p className="m-0 mx-auto mt-4 max-w-[48rem] text-center text-lg text-ivory/80">{lead}</p>}
        <div className="mt-8 sm:mt-10">{children}</div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- Qanday ishlaydi: jonli quvur

/** Impuls vaqtlari (infoSections.css bilan bir xil): har bog‘lovchi 0,55 s kechikadi, yo‘l ≈0,63 s */
const PL_STEP = 0.55
const PL_TRAVEL = 0.63
/** rad etiladigan impuls 2-bog‘lovchida (agentlar -> darvoza) shu soniyada chiqadi */
const PL_REJECT_AT = 4.0

/** desktop'dagi yo‘nalish: 1-qator o‘ngga, darvozadan pastga, 2-qator chapga (mobil — hammasi pastga) */
const LINK_DIR = ['right', 'right', 'right', 'down', 'left', 'left'] as const

type VarStyle = CSSProperties & Record<'--d', string>
const delay = (sec: number): VarStyle => ({ '--d': `${sec.toFixed(2)}s` })

/**
 * Qisqa misol qatori (monospace) — matni kam tugunlar uchun. Backendga mos:
 *  siz    — talabaning ochiq savoli (yo‘naltiruvchi emas);
 *  agents — server/app/engine.py turn_schema() kalitlari (speaker, utterance_uz, rule_ids, … advance_stage).
 */
const PIPE_EXAMPLE: Partial<Record<PipeNode['id'], { k: string; t: string }>> = {
  siz: { k: 'Misol', t: '“Guvoh, siz qayerda turgan edingiz?”' },
  agents: { k: 'JSON javob', t: '{ speaker, utterance_uz, rule_ids, … }' },
}

function TagChip({ tag }: { tag: PipeTag }) {
  return <span className={`pl-tag pl-tag--${tag}`}>{PIPE_TAG_LABEL[tag]}</span>
}

function PipeNodeCard({ node, index }: { node: PipeNode; index: number }) {
  const isGate = node.id === 'gate'
  const example = PIPE_EXAMPLE[node.id]
  // tugun impulsni oldingi bog‘lovchidan oladi: (index-1)*STEP + TRAVEL. Darvoza (index 3): 1,73 s —
  // infoSections.css dagi pl-gate/pl-stamp kadrlari shunga (va PL_REJECT_AT ga) moslangan; --d .pl-stamp ga meros o‘tadi.
  const arrive = index === 0 ? 0.05 : (index - 1) * PL_STEP + PL_TRAVEL
  return (
    <article className={`pl-node pl-node--${node.id} glass`} style={delay(arrive)} aria-labelledby={`pl-${node.id}`}>
      <div className="pl-node-top">
        <span className="pl-num" aria-hidden>
          {index + 1}
        </span>
        <TagChip tag={node.tag} />
      </div>
      <h3 id={`pl-${node.id}`} className="pl-title">
        <span className="sr-only">{index + 1}-qadam: </span>
        {isGate && <IconShield />}
        {node.title}
      </h3>
      {node.sub && <p className="pl-sub">{node.sub}</p>}
      {example && (
        <p className="pl-example">
          <span className="pl-example-k">{example.k}:</span> <code>{example.t}</code>
        </p>
      )}
      {node.points && (
        <ul className="pl-points">
          {node.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {isGate && (
        <>
          <p className="pl-reject-static">Masalan: ro‘yxatda yo‘q modda bo‘lgan gap rad etiladi.</p>
          <span className="pl-stamp" aria-hidden>
            {PIPE_REJECT}
          </span>
          <span className="sr-only">Ro‘yxatda yo‘q modda bo‘lgan gap rad etiladi va javobdan olib tashlanadi.</span>
        </>
      )}
    </article>
  )
}

function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null)
  const motion = useMotionOk()
  const live = useInView(ref, { threshold: 0.25 })
  return (
    <Section
      id="loyiha"
      eyebrow="Loyiha haqida"
      title="Qanday ishlaydi"
      lead="Til modeli faqat gapiradi — tartibni kod saqlaydi. Har bir javob kod darvozasidan o‘tadi, bahoni esa inson tasdiqlaydi."
      wide
    >
      <div ref={ref} className={'pl ' + (motion ? (live ? 'is-live' : '') : 'is-static')}>
        <div className="pl-flow">
          {PIPELINE.map((n, i) => (
            <Fragment key={n.id}>
              {i > 0 && (
                <div className="pl-link" data-n={i - 1} data-dir={LINK_DIR[i - 1]} aria-hidden>
                  <span className="pl-line" />
                  <span className="pl-pulse" style={delay((i - 1) * PL_STEP)} />
                  {n.id === 'gate' && <span className="pl-pulse pl-pulse--reject" style={delay(PL_REJECT_AT)} />}
                </div>
              )}
              <PipeNodeCard node={n} index={i} />
            </Fragment>
          ))}
          <div className="pl-legend">
            <p className="m-0 text-[0.72rem] font-bold uppercase tracking-[0.16em] text-gold-soft">Belgilar</p>
            <p className="pl-legend-row m-0">
              <TagChip tag="kod" />
              <span>deterministik qoida — natija har safar bir xil</span>
            </p>
            <p className="pl-legend-row m-0">
              <TagChip tag="llm" />
              <span>til modeli — Google Gemini Flash-Lite</span>
            </p>
            <p className="pl-legend-row m-0">
              <TagChip tag="inson" />
              <span>o‘qituvchi — yakuniy qaror</span>
            </p>
          </div>
        </div>
        <ul className="pl-notes">
          {PIPE_NOTES.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------- Agent kartochkalari

const FINE_POINTER = '(hover: hover) and (pointer: fine)'
const TILT_DEG = 6

function AgentCard({ id, motion }: { id: (typeof AGENT_ORDER)[number]; motion: boolean }) {
  const p = PEOPLE[id]
  // kod yuritadigan rollar (AI agent emas): kotib — bayonnoma, sudlanuvchi — oxirgi so‘z shabloni
  const auto = id === 'kotib' || id === 'sudlanuvchi'
  const caption = portraitCaption(id)

  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!motion || e.pointerType !== 'mouse' || !window.matchMedia?.(FINE_POINTER).matches) return
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    const nx = (e.clientX - r.left) / r.width
    const ny = (e.clientY - r.top) / r.height
    const ry = (nx - 0.5) * 2 * TILT_DEG
    const rx = -(ny - 0.5) * 2 * TILT_DEG
    el.style.transition = 'transform 90ms linear, border-color 180ms ease'
    el.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-4px)`
    el.style.setProperty('--ia-mx', `${(nx * 100).toFixed(1)}%`)
    el.style.setProperty('--ia-my', `${(ny * 100).toFixed(1)}%`)
  }
  const onLeave = (e: PointerEvent<HTMLButtonElement>) => {
    const el = e.currentTarget
    el.style.transition = ''
    el.style.transform = ''
    el.style.removeProperty('--ia-mx')
    el.style.removeProperty('--ia-my')
  }

  return (
    <li>
      <button
        type="button"
        className="glass agent-card h-full w-full p-0 pb-5"
        onClick={() => openSlides(id)}
        onPointerEnter={() => playTick()}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        aria-haspopup="dialog"
        aria-label={`${p.name} — batafsil`}
      >
        <img
          src={portraitOf(id)}
          alt=""
          width={480}
          height={640}
          loading="lazy"
          decoding="async"
          className="agent-portrait"
        />
        {caption && (
          <span className="ia-caption" aria-hidden>
            {caption}
          </span>
        )}
        <span className="ia-sheen" aria-hidden />
        <span className="-mt-8 block px-3 sm:px-4">
          <span className="block font-display text-[1.6rem] font-bold leading-none text-ivory sm:text-[1.9rem]">
            {p.name}
          </span>
          <span
            className={
              'mt-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] ' +
              (auto ? 'text-ivory/60' : 'text-gold-soft')
            }
          >
            {!auto && <IconSpark className="size-3.5" />}
            {auto ? ROLE_BADGE[id] : 'AI agent'}
          </span>
          <span className="mx-auto mt-2 block border-t border-gold/25 pt-2 text-[0.88rem] leading-snug text-ivory/85 sm:text-[0.95rem]">
            {p.card}
          </span>
          <span className="mt-3 flex flex-col items-center gap-1.5">
            <span className="pill-gold pill-gold-sm font-display text-[0.9rem] text-gold-soft">Qoida</span>
            <span className="block text-[0.8rem] leading-snug text-ivory/65 sm:text-[0.85rem]">{p.ruleShort}</span>
          </span>
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-gold-soft" aria-hidden>
            Batafsil
            <IconArrowRight className="size-4" />
          </span>
        </span>
      </button>
    </li>
  )
}

function Agents() {
  const motion = useMotionOk()
  return (
    <Section id="agentlar" eyebrow="AI darajasi" title="Har bir personaj — alohida agent">
      <p className="m-0 mx-auto -mt-2 mb-8 max-w-[48rem] text-center text-lg text-ivory/80">
        Siz himoyachisiz. Sudya, prokuror va guvoh — alohida AI agentlar (til modeli + kod qoidalari). Kotib bayonnomasi
        va sudlanuvchining oxirgi so‘zi — kod. Kartani bosing — rol haqida slaydlar ochiladi.
      </p>
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:gap-4 md:grid-cols-3 lg:grid-cols-5 [&>li:last-child]:max-md:col-span-2">
        {AGENT_ORDER.map((id) => (
          <AgentCard key={id} id={id} motion={motion} />
        ))}
      </ul>
    </Section>
  )
}

// ---------------------------------------------------------------- Nega kerak: faktlar

const COUNT_MS = 900

/** Minglar orasida bo‘linmaydigan bo‘shliq: 7732 -> "7 732" */
function fmtInt(n: number) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function CountUp({ from, to, run, motion }: { from: number; to: number; run: boolean; motion: boolean }) {
  const [n, setN] = useState(from)
  useEffect(() => {
    if (!run || !motion) return
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / COUNT_MS)
      const e = 1 - Math.pow(1 - k, 3)
      setN(Math.round(from + (to - from) * e))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [run, motion, from, to])
  const shown = motion ? n : to
  return (
    <span aria-label={`${fmtInt(from)} dan ${fmtInt(to)} gacha`}>
      <span aria-hidden className="ia-num">
        {fmtInt(from)} → {fmtInt(shown)}
      </span>
    </span>
  )
}

const RING_R = 23
const RING_C = 2 * Math.PI * RING_R

function Ring({ percent, run }: { percent: number; run: boolean }) {
  const offset = run ? RING_C * (1 - percent / 100) : RING_C
  return (
    <svg className="ia-ring" viewBox="0 0 54 54" aria-hidden focusable="false">
      <circle className="ia-ring-bg" cx="27" cy="27" r={RING_R} />
      <circle
        className="ia-ring-fg"
        cx="27"
        cy="27"
        r={RING_R}
        strokeDasharray={RING_C.toFixed(2)}
        strokeDashoffset={offset.toFixed(2)}
      />
    </svg>
  )
}

function FactValue({ f, run, motion }: { f: WhyFact; run: boolean; motion: boolean }) {
  const cls = 'm-0 font-display text-[2rem] font-bold leading-none text-gold-soft sm:text-[2.4rem]'
  if (f.count) {
    return (
      <p className={cls}>
        <CountUp from={f.count.from} to={f.count.to} run={run} motion={motion} />
      </p>
    )
  }
  if (typeof f.ring === 'number') {
    return (
      <p className={cls + ' flex items-center gap-3'}>
        <Ring percent={f.ring} run={run || !motion} />
        {f.value}
      </p>
    )
  }
  return <p className={cls}>{f.value}</p>
}

function Why() {
  const ref = useRef<HTMLUListElement>(null)
  const motion = useMotionOk()
  const seen = useInView(ref, { once: true, threshold: 0.3 })
  return (
    <Section id="nega" eyebrow="Dolzarblik" title="Nega kerak">
      <p className="m-0 mx-auto -mt-2 mb-8 max-w-[46rem] text-center text-lg text-ivory/80">{WHY.lead}</p>
      <ul
        ref={ref}
        className={'ia-facts m-0 grid list-none gap-4 p-0 md:grid-cols-2 ' + (motion ? (seen ? 'is-in' : '') : 'is-static')}
      >
        {WHY.facts.map((f) => (
          <li key={f.value} className="glass flex flex-col p-6">
            <FactValue f={f} run={seen} motion={motion} />
            <p className="m-0 mt-3 text-ivory/90">{f.text}</p>
            <p className="ia-src m-0 mt-auto pt-4 text-sm text-ivory/60">Manba: {f.source}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}

// ---------------------------------------------------------------- Shaffoflik (Nizom 6.5)

function Tech() {
  return (
    <Section id="texnologiyalar" eyebrow="Ochiqlik" title="Texnologiyalar va mualliflar">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-5">
        <div className="glass-strong p-6 sm:p-7">
          <h3 className="m-0 flex items-center gap-2 font-display text-[1.7rem] font-bold leading-none text-gold-soft">
            <IconShield className="size-5 text-gold" />
            O‘zimiz qurdik
          </h3>
          <p className="m-0 mt-2 text-[0.95rem] text-ivory/70">Jamoa yozgan kod — har biri omborda ko‘rsatilgan faylda.</p>
          <ul className="m-0 mt-4 grid list-none gap-3.5 p-0">
            {BUILT.map((b) => (
              <li key={b.name} className="border-t border-gold/15 pt-3 text-[0.98rem] leading-snug first:border-t-0 first:pt-0">
                <span className="font-semibold text-ivory">{b.name}</span>
                <span className="block text-ivory/72">{b.what}</span>
                <span className="tr-where">{b.where}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="glass p-6 sm:p-7">
          <h3 className="m-0 font-display text-[1.7rem] font-bold leading-none text-ivory">Tayyor vositalar</h3>
          <p className="m-0 mt-2 text-[0.95rem] text-ivory/70">Foydalangan xizmatlar, kutubxonalar va resurslar.</p>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {TOOLS.map((g) => (
              <div key={g.group}>
                <h4 className="m-0 text-[0.75rem] font-bold uppercase tracking-[0.16em] text-gold-soft">{g.group}</h4>
                <ul className="m-0 mt-2 grid list-none gap-2.5 p-0">
                  {g.items.map((it) => (
                    <li key={it.name} className="text-[0.95rem] leading-snug">
                      <span className="font-semibold text-ivory">{it.name}</span>
                      {it.license && (
                        <span className="ml-2 rounded border border-ivory/20 px-1.5 py-px align-middle text-[11px] font-semibold text-ivory/70">
                          {it.license}
                        </span>
                      )}
                      <span className="block text-ivory/70">{it.what}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="glass-tint m-0 mt-6 max-w-[60rem] px-4 py-3 text-ivory/80">{NIZOM_NOTE}</p>
      <p className="m-0 mt-3 text-sm text-ivory/60">
        Logotip — jamoa ishi. Barcha litsenziyalar loyiha omboridagi CREDITS.md fayllarida ko‘rsatilgan.
      </p>
    </Section>
  )
}

// ---------------------------------------------------------------- Jamoa (TEAM bo‘sh — yashirin), pastki qism

function Team() {
  if (TEAM.length === 0) return null
  return (
    <Section id="jamoa" eyebrow="Mualliflar" title="Jamoa">
      <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {TEAM.map((m) => (
          <li key={m.name} className="glass p-5">
            <p className="m-0 text-lg font-bold text-ivory">{m.name}</p>
            <p className="m-0 mt-1 text-ivory/70">{m.role}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-gold/20 px-4 py-10 sm:px-8">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-5 sm:flex-row sm:items-start">
        <img src={LOGO_EMBLEM} alt="" width={56} height={56} className="size-14 shrink-0" />
        <div className="grid gap-2 text-[0.95rem] text-ivory/75">
          <p className="m-0 font-semibold text-gold-soft">CaseCraft · {AI_LABEL}</p>
          <p className="m-0">{FOOTER.disclaimer}</p>
          <p className="m-0">{FOOTER.law}</p>
          <p className="m-0 text-sm text-ivory/55">{FOOTER.event}</p>
        </div>
      </div>
    </footer>
  )
}

/** Birinchi ekrandan pastdagi sahifa: 3D fon orqada qoladi, bo‘limlar to‘q yarim shaffof fonda. */
export function InfoSections() {
  return (
    <div className="pointer-events-auto relative z-10 bg-[linear-gradient(180deg,rgb(8_17_31/0.72),rgb(8_17_31/0.86)_30%,rgb(8_17_31/0.92))]">
      <HowItWorks />
      <Agents />
      <Why />
      <Tech />
      <Team />
      <Footer />
    </div>
  )
}
