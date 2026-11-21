import { useEffect, useState } from 'react'
import { api, ApiError, type Approval, type Criterion, type FinishRes } from '../api'
import { CheckIcon } from './icons'

const VIOLATION_LABEL: Record<string, string> = {
  yonaltiruvchi_savol: "Yo'naltiruvchi savol",
  bosim_haqorat: 'Guvohga bosim / haqorat',
  bosqichdan_tashqari: 'Bosqichdan tashqari gap',
  aloqasiz_savol: 'Ishga aloqasiz savol',
  ruxsatsiz_gapirish: "Ruxsatsiz so'z olish",
  sudga_hurmatsizlik: 'Sudga hurmatsizlik',
  tergovdan_keyin_savol: 'Sud tergovidan keyin guvohga savol',
}

function hhmm(d: Date) {
  return d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })
}

/** Server ISO vaqti -> "21.11 14:05" (bugun bo'lsa faqat soat) */
function fmtIso(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date().toDateString() === d.toDateString()
  const dd = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
  return today ? hhmm(d) : `${dd} ${hhmm(d)}`
}

const POLL_MS = 5000

/**
 * "O'qituvchiga yuborish" bosilgach o'qituvchi tasdig'ini har 5 s tekshiradi. Sessiya baribir server xotirasida va
 * panelda ko'rinadi — bu faqat holatni ko'rsatadi. 404 da kuzatish to'xtaydi va sababi qaytadi (spinner abadiy qolmasin):
 * session_not_found — server qayta ishga tushgan; boshqa 404 — server bu yo'lni bilmaydi.
 */
function useApproval(sessionId: string, active: boolean) {
  const [approval, setApproval] = useState<Approval | null>(null)
  const [stopped, setStopped] = useState<string | null>(null)
  useEffect(() => {
    if (!active || approval || stopped) return
    let stop = false
    let timer = 0
    const tick = () => {
      api
        .approval(sessionId)
        .then((a) => {
          if (stop) return
          if (a) setApproval(a)
          else timer = window.setTimeout(tick, POLL_MS)
        })
        .catch((e) => {
          if (stop) return
          if (e instanceof ApiError && (e.kind === 'session' || e.status === 404)) {
            setStopped(
              e.kind === 'session'
                ? "Sessiya serverda topilmadi (server qayta ishga tushgan bo'lishi mumkin). Tasdiqni o'qituvchidan so'rang; bayonnoma yuqorida."
                : "Bu server tasdiq holatini ko'rsatmaydi. Tasdiqni o'qituvchi panelidan so'rang.",
            )
            return
          }
          timer = window.setTimeout(tick, POLL_MS)
        })
    }
    tick()
    return () => {
      stop = true
      window.clearTimeout(timer)
    }
  }, [sessionId, active, approval, stopped])
  return { approval, stopped }
}

/** Bir gaplik xulosa (ulushga qarab) — baho tavsiya, o'qituvchi tasdiqlaydi */
function verdict(pct: number) {
  if (pct >= 0.85) return 'puxta himoya'
  if (pct >= 0.65) return 'ishonchli himoya'
  if (pct >= 0.4) return "yaxshi boshlanish — mashqni davom ettiring"
  return 'asosiy qoidalarni takrorlash kerak'
}

/** Ball 0 dan sanaladi (900 ms, ease-out); reduced-motion da darhol */
function useCountUp(target: number, ms = 900) {
  const [reduced] = useState(() => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  const [v, setV] = useState(reduced ? target : 0)
  useEffect(() => {
    if (reduced) return
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms, reduced])
  return reduced ? target : v
}

function barColor(c: Criterion) {
  if (c.level >= c.max) return 'bg-emerald-400'
  if (c.level > 0) return 'bg-[linear-gradient(90deg,#9c7b3c,#e2c88f)]'
  return 'bg-rose-400'
}

/** Mezon tasmasi: bar + ball; bosilganda iqtibos, izoh va asos ochiladi */
function CriterionRow({ c, i }: { c: Criterion; i: number }) {
  const [open, setOpen] = useState(false)
  const pct = c.max ? Math.max(0.04, c.level / c.max) : 0
  return (
    <li className="stagger-in" style={{ animationDelay: `${300 + i * 60}ms` }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group w-full rounded-[10px] px-2 py-2 text-left transition hover:bg-ivory/5"
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-semibold text-ivory">{c.name_uz}</span>
          <span className={`shrink-0 text-[15px] font-bold ${c.level >= c.max ? 'text-emerald-300' : c.level > 0 ? 'text-gold-soft' : 'text-rose-300'}`}>
            {c.level}/{c.max}
          </span>
        </span>
        <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-ivory/10">
          <span className={`block h-full rounded-full ${barColor(c)}`} style={{ width: `${pct * 100}%` }} />
        </span>
        <span className="mt-1 block text-[12px] font-medium text-ivory/70 group-hover:text-gold-soft">{open ? 'Yashirish' : "Iqtibos va izohni ko'rish"}</span>
      </button>
      {open && (
        <div className="mx-2 mb-2 border-l-2 border-gold/60 pl-3">
          {c.evidence_quote ? (
            <blockquote className="text-[15px] text-ivory/90 italic">«{c.evidence_quote}»</blockquote>
          ) : (
            <p className="text-[14px] text-ivory/70">Talaba gapidan iqtibos yo'q</p>
          )}
          {c.comment_uz && <p className="mt-1.5 text-[14px] text-ivory/80">{c.comment_uz}</p>}
          {c.article_ref && (
            <p className="mt-1.5 text-[13px] text-ivory/75">
              Asos: <span className="font-semibold text-gold-soft">{c.article_ref}</span>
              {!c.article_verified && ' (matn yurist tomonidan tekshirilmagan)'}
            </p>
          )}
        </div>
      )}
    </li>
  )
}

/** Rejimni almashtirib qayta yuklash (role, case, api va boshqa parametrlar saqlanadi) */
function reloadWithMode(mode: 'talim' | 'majlis') {
  const url = new URL(window.location.href)
  url.searchParams.set('mode', mode)
  window.location.assign(url.toString())
}

/**
 * Natija: hero ball (sanaladi) + bir gaplik xulosa, mezon tasmasi (majlisda 5 ta, talimda 4 ta + maslahatlar va
 * to'xtashlar soni), qoidabuzarliklar, bayonnoma, o'qituvchi tasdig'i, qayta boshlash
 */
export function ResultScreen({ result, onRestart }: { result: FinishRes; onRestart: () => void }) {
  const [sentAt, setSentAt] = useState<Date | null>(null)
  const { approval, stopped: approvalLost } = useApproval(result.session_id, !!sentAt)
  const [showDoc, setShowDoc] = useState(false)
  const r = result.rubric
  const pct = r.max ? r.total / r.max : 0
  const talim = r.mode === 'talim'
  const shownTotal = useCountUp(r.total)
  const ringPct = r.max ? shownTotal / r.max : 0
  return (
    <div className="thin-scroll absolute inset-0 z-40 overflow-y-auto bg-[rgb(8_17_31/0.88)] backdrop-blur-sm">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <header className="flex items-center gap-2.5">
          <img src="/intro/casecraft-emblem-128.webp" alt="" width={32} height={32} className="h-8 w-8" />
          <div>
            <p className="font-display text-[22px] leading-none font-semibold text-gold-soft">CaseCraft · Natija</p>
            <p className="mt-1 text-[13px] text-ivory/80">AI o'quv simulyatsiyasi · real sud qarori emas</p>
          </div>
        </header>

        {/* Hero: halqa + Cormorant ball + bir gap */}
        <section className="glass-strong flex flex-col items-center gap-4 p-5 text-center sm:flex-row sm:text-left">
          <div
            className="relative grid h-[120px] w-[120px] shrink-0 place-items-center rounded-full shadow-[0_0_40px_-8px_rgb(201_164_92/0.55)]"
            style={{ background: `conic-gradient(#e2c88f 0deg, #c9a45c ${ringPct * 360}deg, rgb(241 234 217 / 0.1) 0)` }}
            role="img"
            aria-label={`Umumiy ball ${r.total} / ${r.max}`}
          >
            <div className="grid h-[104px] w-[104px] place-items-center rounded-full bg-navy-900">
              <span className="font-display text-[56px] leading-none font-semibold text-ivory tabular-nums">
                {shownTotal}
                <span className="text-[22px] text-ivory/70">/{r.max}</span>
              </span>
            </div>
          </div>
          <div className="min-w-0">
            <p className="eyebrow">Tavsiya etilgan ball</p>
            <h1 className="mt-1 font-display text-[30px] leading-tight font-semibold text-ivory sm:text-[34px]">
              Siz {r.total}/{r.max} — {verdict(pct)}
            </h1>
            <p className="mt-1.5 text-[14px] text-ivory/80">
              Qoidabuzarliklar: <span className={r.violations.length ? 'font-semibold text-rose-300' : 'font-semibold text-emerald-300'}>{r.violations.length}</span> · Yashirin fakt:{' '}
              <span className={r.revealed_hidden_fact ? 'font-semibold text-emerald-300' : 'font-semibold text-ivory'}>{r.revealed_hidden_fact ? 'ochildi' : 'ochilmadi'}</span>
            </p>
            <p className="mt-0.5 text-[13px] text-ivory/75">
              {talim ? "Ta'lim rejimi (ustoz bilan)" : 'Sud majlisi rejimi (imtihon)'} · {r.criteria.length} mezon · baho o'qituvchi tasdig'idan keyin kuchga kiradi
            </p>
          </div>
        </section>

        {talim && (
          <section className="grid grid-cols-2 gap-2.5" aria-label="Ta'lim ko'rsatkichlari">
            <div className="glass p-3.5">
              <p className="eyebrow">Maslahatlar</p>
              <p className="mt-1 font-display text-[32px] leading-none font-semibold text-ivory">
                {r.hints_used ?? 0}
                <span className="text-[18px] text-ivory/70"> / {(r.hints_used ?? 0) + (r.hints_left ?? 0)}</span>
              </p>
              <p className="mt-1 text-[13px] text-ivory/75">{(r.hints_used ?? 0) === 0 ? 'Mustaqil: maslahatsiz' : 'Bahoda hisobga olinadi'}</p>
            </div>
            <div className="glass p-3.5">
              <p className="eyebrow">«Vaqt to'xtadi»</p>
              <p className="mt-1 font-display text-[32px] leading-none font-semibold text-ivory">{r.pauses ?? 0}</p>
              <p className="mt-1 text-[13px] text-ivory/75">ustoz to'xtatib tushuntirgan joylar</p>
            </div>
          </section>
        )}

        {r.trap && r.trap.state && r.trap.state !== 'pending' && (
          <section className={`glass border-l-4! p-3.5 text-[15px] ${r.trap.state === 'caught' ? 'border-l-emerald-400!' : 'border-l-rose-400!'}`}>
            <p className={`font-semibold ${r.trap.state === 'caught' ? 'text-emerald-100' : 'text-rose-100'}`}>
              {r.trap.state === 'caught'
                ? 'Prokurorning ishora qiluvchi savolini payqadingiz va raislik qiluvchiga murojaat qildingiz.'
                : "Prokurorning ishora qiluvchi savoli e'tibordan chetda qoldi."}
            </p>
            {r.trap.question_uz && <p className="mt-1 text-ivory/80 italic">«{r.trap.question_uz}»</p>}
          </section>
        )}

        <section className="glass p-3" aria-label="Mezonlar">
          <h2 className="px-2 pt-1 font-display text-[24px] font-semibold text-gold-soft">Mezonlar</h2>
          <ol className="mt-1 flex flex-col">
            {r.criteria.map((c, i) => (
              <CriterionRow key={c.id} c={c} i={i} />
            ))}
          </ol>
        </section>

        {r.violations.length > 0 && (
          <section className="glass border-l-4! border-l-rose-400! p-3.5">
            <h3 className="text-[15px] font-semibold text-rose-100">Raislik qiluvchi to'xtatgan joylar</h3>
            <ul className="mt-1.5 space-y-1.5 text-[15px] text-ivory/85">
              {r.violations.map((v) => (
                <li key={v.log_id}>
                  <span className="font-semibold text-rose-300">{v.article_ref ?? '—'}</span> · {VIOLATION_LABEL[v.id] ?? v.id}: «{v.quote}»
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="glass p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-[24px] font-semibold text-gold-soft">Bayonnoma</h3>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowDoc((v) => !v)} aria-expanded={showDoc} className="btn-secondary">
                {showDoc ? 'Yashirish' : "Ko'rish"}
              </button>
              <a href={api.bayonnomaUrl(result.session_id)} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                Yangi oynada
              </a>
            </div>
          </div>
          {showDoc && <iframe title="Bayonnoma" srcDoc={result.bayonnoma_html} sandbox="" className="mt-3 h-[60dvh] w-full rounded-[10px] border border-gold-soft/30 bg-white" />}
        </section>

        {/* O'qituvchi tasdig'i: talaba o'zi tasdiqlay olmaydi. Sessiya o'qituvchi panelida baribir ko'rinadi (server
            xotirasi); yuborish tugmasi tasdiq holatini kuzatishni yoqadi (taqiqlar.md 3-band) */}
        <section className="glass p-3.5 text-[14px]" role="status" aria-live="polite">
          {approval ? (
            <p className="flex items-start gap-2 font-semibold text-emerald-200">
              <CheckIcon className="mt-0.5 shrink-0" />
              <span>
                O'qituvchi tasdiqladi · {approval.teacher_name}
                {(fmtIso(approval.approved_at) || approval.at_uz) && ` · ${fmtIso(approval.approved_at) || approval.at_uz}`}
                {approval.comment && <span className="mt-0.5 block text-[13px] font-normal text-ivory/85">Izoh: {approval.comment}</span>}
              </span>
            </p>
          ) : sentAt && approvalLost ? (
            <>
              <p className="font-semibold text-ivory">Natija o'qituvchi paneliga yuborildi · {hhmm(sentAt)}</p>
              <p className="mt-0.5 text-[13px] text-amber-100" role="alert">
                {approvalLost}
              </p>
            </>
          ) : sentAt ? (
            <>
              <p className="font-semibold text-ivory">Natija o'qituvchi paneliga yuborildi · {hhmm(sentAt)}</p>
              <p className="mt-0.5 flex items-center gap-2 text-[13px] text-ivory/75">
                <span className="spin h-3.5! w-3.5!" aria-hidden="true" />
                O'qituvchi tasdig'i kutilmoqda — tasdiqlansa shu yerda ko'rinadi.
              </p>
            </>
          ) : (
            <p className="text-[13px] text-ivory/80">
              Natija o'qituvchi panelida ko'rinadi. Yuborsangiz, o'qituvchi tasdig'i shu yerda chiqadi.
            </p>
          )}
        </section>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => setSentAt((d) => d ?? new Date())}
            disabled={!!sentAt}
            className={sentAt ? 'btn-secondary min-h-12 flex-1 text-emerald-200 opacity-100!' : 'btn-primary flex-1'}
          >
            {sentAt && <CheckIcon size={17} />}
            {approval ? 'Tasdiqlandi' : sentAt ? "O'qituvchiga yuborildi" : "O'qituvchiga yuborish"}
          </button>
          <button type="button" onClick={onRestart} className="btn-secondary min-h-12 flex-1">
            Qayta boshlash
          </button>
        </div>
        <button type="button" onClick={() => reloadWithMode(talim ? 'majlis' : 'talim')} className="btn-secondary min-h-12 w-full">
          {talim ? "Imtihon rejimida sinab ko'rish" : "Ta'lim rejimida qayta o'tish"}
        </button>

        <p className="text-center text-[12px] text-ivory/70">
          {result.disclaimer_uz} · Baholovchi: {r.provider === 'kod' ? 'qoidalar (kod)' : `AI (${r.provider}) + kod tekshiruvi`}
        </p>
      </div>
    </div>
  )
}
