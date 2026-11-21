import { useEffect, useState } from 'react'
import { actions, useIntro } from '../state'
import { setSoundEnabled } from './audio'
import { AI_LABEL, LOGO_EMBLEM } from './content'
import { IconSpeakerOff, IconSpeakerOn } from './icons'
import { LoadingLine } from './loading/LoadingLine'

/** Ovozga taklif: splash yo‘qolgandan keyin ko‘rinadi, sahifa ochilganidan 8 s gacha (faqat titulda, ovoz o‘chiq bo‘lsa) */
const INVITE_FROM_MS = 900
const INVITE_UNTIL_MS = 8000

function useSoundInvite() {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const now = performance.now()
    if (now >= INVITE_UNTIL_MS) return
    const a = window.setTimeout(() => setOn(true), Math.max(0, INVITE_FROM_MS - now))
    const b = window.setTimeout(() => setOn(false), INVITE_UNTIL_MS - now)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
    }
  }, [])
  return on
}

/** Sahifa pastga aylantirilganmi — panel tepasidagi bo‘shliq ostidan kontent ko‘rinmasin (yumshoq soya yoqiladi) */
function useScrolled() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return scrolled
}

/** Har ekranda ko‘rinadigan "AI o‘quv simulyatsiyasi" yorlig‘i */
export function AiBadge({ className = '' }: { className?: string }) {
  return (
    <span className={'pill-gold text-[11px] sm:text-[0.875rem] ' + className}>
      <span className="size-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
      {AI_LABEL}
    </span>
  )
}

/** Konsept rasmidagi yuqori panel: logotip — markazda yorliq oltin chiziqlar orasida — "Ovoz" */
export function TopBar() {
  const soundOn = useIntro((s) => s.soundOn)
  const phase = useIntro((s) => s.phase)
  const inviteTime = useSoundInvite()
  const scrolled = useScrolled()
  const invite = inviteTime && !soundOn && phase === 'title'

  const toggle = () => {
    // AudioContext va musiqa shu click ichida boshlanishi kerak (autoplay qoidasi)
    setSoundEnabled(!soundOn)
    actions.toggleSound()
  }

  return (
    // position:fixed, top:0 — panel o‘zi --bar-top padding bilan pastroqda "suzadi"; hech qanday skrol uni surmaydi
    <header
      className={
        'topbar-host pointer-events-none fixed inset-x-0 top-0 z-40 px-2 pt-[var(--bar-top)] sm:px-4 lg:px-6 ' +
        (phase === 'launch' ? 'ld-topbar-out' : '')
      }
      data-scrolled={scrolled || undefined}
      inert={phase === 'launch' || undefined}
    >
      <div className="topbar pointer-events-auto relative mx-auto flex h-[var(--bar-h)] max-w-[1600px] items-center gap-2 px-2 sm:gap-4 sm:px-4 lg:px-5">
        <a
          href="#top"
          className="flex shrink-0 items-center gap-2 rounded-md sm:gap-2.5"
          aria-label="CaseCraft — sahifa boshiga"
          onClick={(e) => {
            e.preventDefault()
            window.scrollTo({ top: 0 })
          }}
        >
          <img src={LOGO_EMBLEM} alt="" width={40} height={40} className="size-8 sm:size-10" />
          <span className="wordmark hidden text-[1.35rem] min-[430px]:inline sm:text-[1.7rem]" aria-hidden>
            CaseCraft
          </span>
        </a>

        {/* markaz: chiziq — yorliq — chiziq */}
        <div className="flex min-w-0 flex-1 items-center justify-center gap-3 lg:gap-5">
          <span className="hair-l hidden md:block" aria-hidden />
          <AiBadge className="min-w-0" />
          <span className="hair-r hidden md:block" aria-hidden />
        </div>

        <div className="relative flex shrink-0">
          {invite && <span className="ld-sound-ring" aria-hidden />}
          <button
            type="button"
            onClick={toggle}
            aria-pressed={soundOn}
            aria-label={soundOn ? 'Ovozni o‘chirish' : 'Ovozni yoqish'}
            title={soundOn ? 'Ovozni o‘chirish' : 'Ovozni yoqish'}
            className={
              'inline-flex size-10 shrink-0 items-center justify-center gap-2 rounded-lg border text-[0.95rem] font-semibold transition-colors sm:size-auto sm:min-h-11 sm:px-3.5 ' +
              (soundOn
                ? 'border-gold bg-gold text-navy-950 hover:bg-gold-soft'
                : 'border-transparent text-ivory/90 hover:border-gold/50 hover:text-ivory')
            }
          >
            {soundOn ? <IconSpeakerOn className="size-5" /> : <IconSpeakerOff className="size-5" />}
            <span className="hidden sm:inline" aria-hidden>
              Ovoz
            </span>
          </button>
          {invite && (
            <p className="ld-sound-hint" aria-hidden>
              Ovozni yoqing
            </p>
          )}
        </div>

        {/* tor ekranda taklif yozuvi bilan to‘qnashmasin — matn 8 s dan keyin chiqadi, chiziq doim ko‘rinadi */}
        <LoadingLine yieldText={invite} />
      </div>
    </header>
  )
}
