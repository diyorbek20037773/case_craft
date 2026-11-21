import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as RPointerEvent } from 'react'
import { SPEAKER_LABEL, type CourtSession } from '../session'
import { chipsFor, PLACEHOLDER } from './chips'
import { ArrowRightIcon, BulbIcon, FlagIcon, MicIcon, MoreIcon, ObjectionIcon, RoleIcon, SendIcon, SkipIcon, XMarkSmall } from './icons'
import { MAX_REC_MS, micSupported, usePushToTalk } from './mic'
import { FloorChip, HandIcon } from './TopBar'
import { TutorCard } from './TutorCard'
import { useIsDesktop } from './useIsDesktop'

/** "Eshitildi" kartasi shuncha vaqtdan keyin o'zi yuboriladi */
const HEARD_AUTO_MS = 1500

/**
 * Pastki qism. Noutbuk: markazda kino-subtitr (caption), o'ngda harakat paneli (ustoz, chiplar, matn + mikrofon,
 * murojaat, "⋯"). Telefon: bitta ustun, dock <= 46dvh, ikkinchi darajali harakatlar "⋯" pastki varag'ida.
 * So'z navbati: so'z boshqada -> "So'z so'rash"; so'z talabada -> matn + chiplar + mikrofon.
 */
export function CourtDock({ s, insetLeft = false }: { s: CourtSession; insetLeft?: boolean }) {
  const [text, setText] = useState('')
  const [heard, setHeard] = useState<string | null>(null)
  const [micMsg, setMicMsg] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const desktop = useIsDesktop()
  const busy = s.status === 'starting' || s.status === 'sending' || s.status === 'finishing'
  const canAct = !!s.sessionId && !s.closed && !busy
  const canType = canAct && s.hasFloor
  const chips = s.closed || !s.hasFloor ? [] : chipsFor(s.stageKind, s.revealedLine)
  const talim = s.mode === 'talim'
  // majlis yopilgach ustoz kartasidagi tanlovlar bosib bo'lmaydi — ko'rsatilmaydi (faqat gap qoladi)
  const tutor = useMemo(() => (s.tutor && s.closed && s.tutor.choices.length ? { ...s.tutor, choices: [] } : s.tutor), [s.tutor, s.closed])
  const showMic = useMemo(() => micSupported(), [])

  const mic = usePushToTalk({
    onText: (t) => {
      setMicMsg(null)
      setHeard(t)
    },
    onError: (m) => {
      setMicMsg(m)
      inputRef.current?.focus()
    },
  })

  // Tuzoq savol taymeri: gapirayotganda / ovoz tanilayotganda va yuborsa bo'ladigan "Eshitildi" kartasi ochiq paytda
  // kutib turadi (bu holatlar o'zi cheklangan: 15 s yozuv, /stt timeout, 1,5 s avto-yuborish). Matn yozilayotganda —
  // faqat so'z talabada bo'lsa (forma ko'rinadi) va oxirgi tugma bosilishidan WINDOW_TYPING_IDLE_MS gacha: maydonda
  // yuborilmagan matn qolib ketsa ham sahna to'xtab qolmaydi
  const holdHard = mic.state === 'recording' || mic.state === 'transcribing' || (heard !== null && canType)
  const typing = s.hasFloor && !s.closed && text.trim().length > 0
  const { holdWindow } = s
  useEffect(() => {
    holdWindow(holdHard ? true : typing ? 'typing' : false)
    // text — har tugma bosilishi "yozilmoqda" vaqtini yangilaydi
  }, [holdHard, typing, text, holdWindow])
  useEffect(() => () => holdWindow(false), [holdWindow])

  // boshqa amal yuborildi (chip, murojaat, ustoz kartasi...) — ochiq "Eshitildi" kartasi eskirdi, u yuborilmaydi
  const sending = s.status === 'sending'
  const [wasSending, setWasSending] = useState(sending)
  if (sending !== wasSending) {
    setWasSending(sending)
    if (sending && heard !== null) setHeard(null)
  }

  const { send } = s
  const sendHeard = useCallback(
    (t: string) => {
      setHeard(null)
      send(t)
    },
    [send],
  )
  // avto-yuborish faqat yuborsa bo'ladigan paytda (so'z talabada, so'rov yo'lda emas); aks holda karta kutib turadi
  useEffect(() => {
    if (heard === null || !canType) return
    const id = window.setTimeout(() => sendHeard(heard), HEARD_AUTO_MS)
    return () => window.clearTimeout(id)
  }, [heard, canType, sendHeard])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!canType || !text.trim()) return
    s.send(text)
    setText('')
    setMicMsg(null)
  }

  const onMicDown = (e: RPointerEvent<HTMLButtonElement>) => {
    if (!canType || e.button > 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setMicMsg(null)
    void mic.start()
  }
  const onMicUp = () => mic.stop()

  // talimda tuzoq savol paytida murojaat tugmasi yengil oltin puls (majlisda hech qanday ko'rinadigan belgi yo'q)
  const cue = talim && s.opportunity?.hint_uz ? s.opportunity.hint_uz : null
  const hintLabel = s.hintsLeft === 0 ? 'Maslahat tugadi' : `Maslahat · ${s.hintsLeft ?? 3}`
  const live = !!s.sessionId && !s.closed
  // murojaat faqat guvoh so'rog'ida ma'noli (ochilish, muzokara, oxirgi so'zda — disabled + tooltip)
  const motionStage = s.stageKind === 'questioning'

  return (
    <footer
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] max-lg:max-h-[46dvh] max-lg:justify-end lg:flex-row lg:items-end lg:gap-4 ${insetLeft ? 'lg:pl-[21.5rem]' : ''}`}
    >
      {/* Subtitr: noutbukda pastki markaz, telefonda dock tepasida */}
      <div className="mx-auto flex min-h-[5.5rem] w-full max-w-2xl shrink flex-col lg:mx-0 lg:min-h-0 lg:max-w-none lg:flex-1 lg:items-center">
        <Subtitle s={s} />
      </div>

      <div className="pointer-events-auto mx-auto flex w-full max-w-2xl shrink-0 flex-col gap-2 lg:mx-0 lg:w-[24rem] lg:max-w-none xl:w-[26rem]">
        {s.error && (
          <div className="glass-strong flex items-center gap-2 border-rose-400/60! px-3 py-2" role="alert">
            <p className="flex-1 text-[14px] text-rose-50">{s.error.message}</p>
            <button
              type="button"
              onClick={s.error.kind === 'session' ? s.restart : s.error.retry}
              className="min-h-11 shrink-0 rounded-[10px] bg-rose-300 px-3 text-[14px] font-semibold text-navy-950 transition active:scale-95"
            >
              {s.error.kind === 'session' ? 'Qayta boshlash' : 'Qayta urinish'}
            </button>
          </div>
        )}

        {live && s.floor && (
          <div className="flex justify-center lg:hidden">
            <FloorChip floor={s.floor} requested={s.floorRequested} />
          </div>
        )}

        {talim && tutor && !s.paused && (!!tutor.say_uz || tutor.choices.length > 0) && (
          <TutorCard tutor={tutor} speaking={s.tutorSpeaking} disabled={!canAct} onChoose={s.choose} compact={!desktop} />
        )}

        {heard !== null && (
          <div className="glass-strong px-3.5 py-2.5" role="status" aria-live="polite">
            <p className="eyebrow">Eshitildi</p>
            <p className="mt-0.5 text-[15px] leading-snug text-ivory">«{heard}»</p>
            {canType ? (
              <HeardBar ms={HEARD_AUTO_MS} />
            ) : (
              <p className="mt-1 text-[13px] text-ivory/75">
                {s.hasFloor ? "Javob kutilmoqda — so'ng yuboriladi." : "So'z sizda emas: avval so'z so'rang yoki tahrirlang."}
              </p>
            )}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setText(heard)
                  setHeard(null)
                  inputRef.current?.focus()
                }}
                className="btn-secondary flex-1 px-2"
              >
                Tahrirlash
              </button>
              <button type="button" onClick={() => setHeard(null)} className="btn-secondary flex-1 px-2">
                Bekor
              </button>
              <button type="button" onClick={() => sendHeard(heard)} disabled={!canType} className="btn-primary min-h-11 flex-1 px-2 text-[14px]">
                Yuborish
              </button>
            </div>
          </div>
        )}

        {micMsg && heard === null && (
          <p className="glass-strong px-3 py-2 text-[14px] text-ivory" role="alert">
            {micMsg}
          </p>
        )}

        {chips.length > 0 && (
          <div>
            <p className="mb-1 hidden px-1 text-[12px] font-semibold tracking-[0.08em] text-ivory/75 uppercase sm:block">Tayyor javoblar</p>
            <div className="chip-row flex gap-1.5 overflow-x-auto pr-7 sm:flex-wrap sm:overflow-visible sm:pr-0" role="group" aria-label="Tayyor savollar">
              {chips.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  disabled={!canType}
                  onClick={() => {
                    // bir bosishda yuboriladi (avval faqat maydonni to'ldirardi va "Yuborish" ham kerak edi)
                    setText('')
                    setMicMsg(null)
                    s.send(c.text)
                  }}
                  title={c.wrong ? "Yo'naltiruvchi savol misoli — raislik qiluvchi to'xtatadi" : c.text}
                  className={`chip shrink-0 whitespace-nowrap ${c.wrong ? 'border-rose-300/60! text-rose-50!' : ''}`}
                >
                  {c.wrong && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/80 py-px pr-1.5 pl-1 text-[12px] font-bold text-white">
                      <XMarkSmall size={12} /> misol
                    </span>
                  )}
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {s.closed ? (
          <button type="button" onClick={s.finish} disabled={busy} className="btn-primary w-full">
            {s.status === 'finishing' && <span className="spin" aria-hidden="true" />}
            {s.status === 'finishing' ? 'Baholanmoqda…' : "Natijani ko'rish"}
          </button>
        ) : s.hasFloor ? (
          <form onSubmit={submit} className="flex items-end gap-2">
            <label className="sr-only" htmlFor="turn-text">
              Gapingiz
            </label>
            <textarea
              id="turn-text"
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) submit(e)
              }}
              rows={text.length > 70 ? 3 : 1}
              maxLength={2000}
              disabled={!s.sessionId || s.status === 'finishing'}
              placeholder={(s.stageKind && PLACEHOLDER[s.stageKind]) || 'Gapingizni yozing…'}
              className="field min-h-12 min-w-0 flex-1 resize-none px-3 py-3 text-[15px] leading-snug"
            />
            {showMic && (
              <button
                type="button"
                disabled={!canType || mic.state === 'transcribing' || heard !== null}
                onPointerDown={onMicDown}
                onPointerUp={onMicUp}
                onPointerCancel={onMicUp}
                onKeyDown={(e) => {
                  if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && canType) {
                    e.preventDefault()
                    setMicMsg(null)
                    void mic.start()
                  }
                }}
                onKeyUp={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') mic.stop()
                }}
                onContextMenu={(e) => e.preventDefault()}
                aria-label={mic.state === 'recording' ? "Yozilmoqda — qo'yib yuboring" : 'Bosib turib gapiring'}
                title="Bosib turib gapiring (maks. 15 s)"
                className={`relative grid min-h-12 w-12 shrink-0 touch-none place-items-center rounded-[10px] border transition select-none disabled:opacity-45 ${mic.state === 'recording' ? 'scale-105 border-rose-300 bg-rose-500 text-white shadow-[0_0_0_6px_rgb(244_63_94/0.25)]' : 'border-gold/70 bg-navy-900/70 text-gold-soft hover:border-gold-soft'}`}
              >
                {mic.state === 'transcribing' || mic.state === 'starting' ? <span className="spin" aria-hidden="true" /> : <MicIcon size={20} />}
                {mic.state === 'recording' && (
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 rounded-full bg-rose-500 px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap text-white">
                    {Math.ceil((MAX_REC_MS - mic.elapsed) / 1000)} s
                  </span>
                )}
              </button>
            )}
            <button type="submit" disabled={!canType || !text.trim()} className="btn-primary min-h-12 shrink-0 px-4">
              {s.status === 'sending' ? <span className="spin" aria-hidden="true" /> : <SendIcon size={17} />}
              <span>{s.status === 'sending' ? 'Yuborilmoqda' : 'Yuborish'}</span>
            </button>
          </form>
        ) : (
          live && (
            <div className="flex flex-col gap-1">
              <button type="button" onClick={s.requestFloor} disabled={!canAct || s.floorRequested} className="btn-primary w-full">
                {s.floorRequested ? <span className="spin" aria-hidden="true" /> : <HandIcon className="h-[18px] w-[18px]" />}
                {s.floorRequested ? 'Kutilmoqda…' : "So'z so'rash"}
              </button>
              <p className="hidden text-center text-[13px] text-ivory/75 lg:block">Gapirish uchun raislik qiluvchidan so'z so'rang.</p>
            </div>
          )
        )}

        {live && s.canAdvance && (
          <button type="button" onClick={s.advance} disabled={busy} className="btn-secondary w-full border-gold/80! text-gold-soft">
            Keyingi bosqich <ArrowRightIcon size={16} />
          </button>
        )}

        {live && (
          <div className="flex flex-col gap-1">
            {cue && <p className="text-center text-[13px] font-semibold text-gold-soft">{cue}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={s.motion}
                disabled={!canAct || !motionStage}
                title={motionStage ? "Savolni rad etishni so'rash: savol ishora qiluvchi (JPK 102-modda)" : "Guvoh so'rog'ida ishlatiladi"}
                className={`btn-secondary min-w-0 flex-1 px-3 ${cue && motionStage ? 'cue-pulse text-gold-soft' : ''}`}
              >
                <ObjectionIcon size={17} className="shrink-0 text-gold-soft" />
                <span className="truncate">Raislik qiluvchiga murojaat</span>
              </button>
              {talim && desktop && (
                <button type="button" onClick={s.hint} disabled={!canAct || s.hintsLeft === 0} title="Ustozdan ishora (bahoda ko'rsatiladi)" className="btn-secondary shrink-0 px-3">
                  <BulbIcon size={16} className="text-gold-soft" />
                  {hintLabel}
                </button>
              )}
              <MoreMenu s={s} busy={busy} canAct={canAct} talim={talim} desktop={desktop} hintLabel={hintLabel} />
            </div>
          </div>
        )}

        {s.silent && <p className="text-center text-[13px] text-ivory/80">Ovoz ochilmadi — subtitrni o'qing.</p>}
      </div>
    </footer>
  )
}

/** "⋯": ikkinchi darajali harakatlar. Noutbukda tugma ustida menyu, telefonda pastki varaq */
function MoreMenu({ s, busy, canAct, talim, desktop, hintLabel }: { s: CourtSession; busy: boolean; canAct: boolean; talim: boolean; desktop: boolean; hintLabel: string }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (desktop && box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, desktop])

  const act = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }
  const item = 'flex min-h-12 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[15px] font-medium text-ivory transition hover:bg-ivory/8 disabled:opacity-45'
  const items = (
    <>
      {talim && !desktop && (
        <button type="button" role="menuitem" onClick={act(s.hint)} disabled={!canAct || s.hintsLeft === 0} className={item}>
          <BulbIcon className="text-gold-soft" />
          <span className="flex-1">{hintLabel}</span>
          <span className="text-[12px] text-ivory/70">bahoda ko'rinadi</span>
        </button>
      )}
      {s.status === 'speaking' && (
        <button type="button" role="menuitem" onClick={act(s.skip)} className={item}>
          <SkipIcon className="text-gold-soft" />
          <span className="flex-1">Gapni o'tkazish</span>
        </button>
      )}
      <button type="button" role="menuitem" onClick={act(s.finish)} disabled={busy} className={item}>
        <FlagIcon className="text-rose-300" />
        <span className="flex-1">{s.status === 'finishing' ? 'Baholanmoqda…' : 'Majlisni yakunlash'}</span>
        <span className="text-[12px] text-ivory/70">natijaga o'tadi</span>
      </button>
    </>
  )

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Boshqa amallar"
        title="Boshqa amallar"
        className="btn-secondary w-11 px-0"
      >
        <MoreIcon size={20} />
      </button>
      {open && desktop && (
        <div role="menu" aria-label="Boshqa amallar" className="glass-strong absolute right-0 bottom-full z-10 mb-2 w-72 bg-[var(--solid-bg-strong)]! p-1.5">
          {items}
        </div>
      )}
      {open && !desktop && (
        <div className="fixed inset-0 z-40 flex items-end bg-navy-950/55" onClick={() => setOpen(false)}>
          <div
            role="menu"
            aria-label="Boshqa amallar"
            onClick={(e) => e.stopPropagation()}
            className="glass-strong w-full rounded-b-none! p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <div className="mx-auto mb-1.5 h-1 w-10 rounded-full bg-ivory/30" aria-hidden="true" />
            {items}
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary mt-1.5 w-full">
              Yopish
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Subtitle({ s }: { s: CourtSession }) {
  const box = 'glass-strong pointer-events-auto w-full max-w-[44rem] px-4 py-3 sm:px-5 sm:py-3.5'
  if (s.status === 'sending') {
    return (
      <div className={box} role="status">
        {s.lastStudent && (
          <p className="mb-1 line-clamp-2 text-[14px] text-ivory/75">
            <span className="font-semibold text-gold-soft">Siz:</span> {s.lastStudent}
          </p>
        )}
        <p className="flex items-center gap-2 text-[16px] text-ivory/85">
          <span className="flex gap-1" aria-hidden="true">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-soft" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-soft [animation-delay:200ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-soft [animation-delay:400ms]" />
          </span>
          Sud javob tayyorlamoqda…
        </p>
      </div>
    )
  }
  if (!s.line) {
    return (
      <div className={box}>
        <p className="eyebrow">{s.status === 'starting' ? 'Ulanmoqda' : 'Vazifa'}</p>
        <p className="mt-1 text-[16px] leading-snug text-ivory/90">
          {s.status === 'starting'
            ? 'Sud majlisi ochilmoqda…'
            : "Siz himoyachisiz. So'zni raislik qiluvchi beradi: guvohni ochiq savollar bilan so'roq qiling, prokurorni diqqat bilan tinglang."}
        </p>
      </div>
    )
  }
  const words = s.line.text.split(/\s+/)
  const shown = s.progress >= 1 ? words.length : Math.floor(s.progress * words.length + 0.5)
  const speaking = s.status === 'speaking'
  return (
    <div className={`${box} thin-scroll flex min-h-0 flex-col overflow-hidden`} aria-live="polite">
      {s.lastStudent && (
        <p className="mb-1 line-clamp-1 text-[14px] text-ivory/75 lg:line-clamp-2">
          <span className="font-semibold text-gold-soft">Siz:</span> {s.lastStudent}
        </p>
      )}
      <div className="flex items-center gap-2">
        <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px] font-bold tracking-[0.08em] text-gold-soft uppercase">
          <RoleIcon speaker={s.line.speaker} size={15} className="shrink-0" />
          <span className="truncate">{SPEAKER_LABEL[s.line.speaker] ?? s.line.speaker}</span>
          {s.speaker && <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-gold-soft" aria-hidden="true" />}
        </p>
        {speaking && (
          <button type="button" onClick={s.skip} title="Gapni o'tkazish" className="link-btn -my-2.5 -mr-2 shrink-0 text-[13px] no-underline">
            O'tkazish <SkipIcon size={14} />
          </button>
        )}
      </div>
      <p className="thin-scroll mt-1 min-h-0 overflow-y-auto text-[20px] leading-[1.35] font-medium lg:text-[22px]">
        {words.map((w, i) => (
          <span key={i} className={i < shown ? 'text-ivory' : 'text-ivory/50'}>
            {w}{' '}
          </span>
        ))}
      </p>
      <div className="mt-2 h-0.5 shrink-0 overflow-hidden rounded-full bg-ivory/10" aria-hidden="true">
        <div className="caption-progress h-full bg-[linear-gradient(90deg,#9c7b3c,#e2c88f)]" style={{ transform: `scaleX(${Math.min(1, Math.max(0, s.progress))})` }} />
      </div>
      {s.revealed && s.line.speaker === 'witness' && (
        <p className="mt-2 w-fit shrink-0 rounded-full bg-gold px-2.5 py-0.5 text-[13px] font-semibold text-navy-950">Yangi fakt ochildi — muzokarada foydalaning</p>
      )}
    </div>
  )
}

/** "Eshitildi" kartasidagi avtomatik yuborish chizig'i (bir marta, mount paytida) */
function HeardBar({ ms }: { ms: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const a = ref.current?.animate?.([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: ms, easing: 'linear', fill: 'forwards' })
    return () => a?.cancel()
  }, [ms])
  return (
    <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-ivory/10" aria-hidden="true">
      <div ref={ref} className="h-full origin-left scale-x-0 bg-gold-soft" />
    </div>
  )
}
