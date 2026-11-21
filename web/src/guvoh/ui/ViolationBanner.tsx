// Qoidabuzarlik banneri: tepa-markazda (so'z chipi ostida), 300 ms slide-down + 240 ms qizil vinyetka chaqnashi,
// ~4,5 s dan keyin o'zi yig'iladi (yozuv bayonnomada qoladi). Har yangi violation obyekti — yangi banner.
import { useEffect, useState } from 'react'
import type { Violation } from '../api'
import { WarnIcon } from './icons'

const SHOW_MS = 4500

export function ViolationBanner({ violation }: { violation: Violation | null }) {
  const [last, setLast] = useState<Violation | null>(null)
  const [phase, setPhase] = useState<'in' | 'out' | 'gone'>('gone')
  // yangi violation obyekti — render paytida holatni yangilash (oldingi prop naqshi)
  if (violation && violation !== last) {
    setLast(violation)
    setPhase('in')
  }

  // s.violation keyingi navbatda null bo'lsa ham banner o'z vaqtini tugatadi
  useEffect(() => {
    if (!last) return
    const a = window.setTimeout(() => setPhase('out'), SHOW_MS)
    const b = window.setTimeout(() => setPhase('gone'), SHOW_MS + 280)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
    }
  }, [last])

  const shown = phase === 'gone' ? null : last
  const leaving = phase === 'out'
  if (!shown) return null
  return (
    <>
      {!leaving && <div key={`v-${shown.id}-${shown.warning_uz}`} className="violation-vignette pointer-events-none absolute inset-0 z-[9]" aria-hidden="true" />}
      <div className="pointer-events-none absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[25] flex justify-center lg:top-[7.25rem] xl:top-[4.5rem]">
        <div
          role="alert"
          data-leaving={leaving}
          className="violation-banner glass-strong pointer-events-auto flex w-full max-w-xl items-start gap-3 border-l-4! border-l-rose-400! py-3 pr-4 pl-3.5"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose-500/90 text-white shadow-[0_0_20px_rgb(244_63_94/0.5)]">
            <WarnIcon size={20} />
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-display text-[24px] leading-none font-semibold text-rose-200">{shown.article_ref ?? 'Qoidabuzarlik'}</span>
              <span className="text-[12px] font-bold tracking-[0.08em] text-rose-200/90 uppercase">Raislik qiluvchi to'xtatdi</span>
            </p>
            <p className="mt-1 text-[16px] leading-snug text-ivory">{shown.name_uz || 'protsessual qoidabuzarlik'}</p>
          </div>
        </div>
      </div>
    </>
  )
}
