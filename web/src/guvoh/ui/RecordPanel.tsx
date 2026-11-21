// Jonli bayonnoma (kotib paneli): /session/start va har /turn dagi record_delta ketma-ket qo'shiladi — /finish dagi
// bayonnoma bilan aynan bir xil manba. Noutbukda chap yon panel (kontent balandligida), telefonda pastdan chiqadigan varaq.
// Subtitrda turgan oddiy yozuv takrorlanmaydi (hideText) — gap tugagach paydo bo'ladi.
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { RecordItem, RecordType } from '../api'
import { SPEAKER_LABEL } from '../session'
import { CloseIcon, RoleIcon, ScrollIcon } from './icons'
import { useIsDesktop } from './useIsDesktop'

const TYPE_STYLE: Record<RecordType, { row: string; tag: string | null; tagCls: string }> = {
  normal: { row: 'border-transparent', tag: null, tagCls: '' },
  violation: { row: 'border-rose-400 bg-rose-500/12', tag: 'Qoidabuzarlik', tagCls: 'bg-rose-500 text-white' },
  fact: { row: 'border-gold-soft bg-gold/12', tag: 'Muhim fakt', tagCls: 'bg-gold text-navy-950' },
  motion: { row: 'border-gold/70 bg-ivory/5', tag: 'Murojaat', tagCls: 'border border-gold/70 text-gold-soft' },
  ruling: { row: 'border-ivory/50 bg-ivory/6', tag: 'Qaror', tagCls: 'bg-ivory/85 text-navy-950' },
}

function Entries({ items }: { items: RecordItem[] }) {
  const list = useRef<HTMLOListElement>(null)
  const seen = useRef(0)
  useLayoutEffect(() => {
    const el = list.current
    if (!el) {
      // ro'yxat bo'shadi (qayta boshlash): keyingi yozuvlar yana animatsiya va avtoskrol bilan chiqsin
      seen.current = 0
      return
    }
    const rows = Array.from(el.children) as HTMLElement[]
    // birinchi chizishda animatsiyasiz, keyin faqat yangi yozuvlar: paydo bo'lish + 1,2 s oltin chap chiziq chaqnashi
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (seen.current > 0 && !calm) {
      rows.slice(seen.current).forEach((r, i) => {
        r.animate?.([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], {
          duration: 380,
          delay: i * 70,
          easing: 'ease-out',
          fill: 'backwards',
        })
        r.animate?.(
          [
            { boxShadow: 'inset 3px 0 0 #e2c88f', backgroundColor: 'rgb(201 164 92 / 0.16)' },
            { boxShadow: 'inset 3px 0 0 rgb(226 200 143 / 0)', backgroundColor: 'rgb(201 164 92 / 0)' },
          ],
          { duration: 1200, delay: i * 70, easing: 'ease-out' },
        )
      })
    }
    if (rows.length > seen.current) el.parentElement?.scrollTo({ top: el.parentElement.scrollHeight, behavior: seen.current ? 'smooth' : 'auto' })
    seen.current = rows.length
  }, [items.length])

  if (!items.length) return <p className="px-3.5 py-4 text-[15px] leading-snug text-ivory/75">Kotib hali hech narsa yozmadi. Majlis boshlangach yozuvlar shu yerda paydo bo'ladi.</p>
  return (
    <ol ref={list} className="flex flex-col gap-1 px-2 py-2">
      {items.map((it, i) => {
        const st = TYPE_STYLE[it.type] ?? TYPE_STYLE.normal
        const aside = /^\(.*\)$/.test(it.text_uz.trim())
        return (
          <li key={it.log_id ?? i} className={`rounded-[10px] border-l-2 px-2.5 py-2 ${st.row}`}>
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px]">
              <span className="font-mono text-[13px] text-ivory/70">{it.t}</span>
              <span className="inline-flex items-center gap-1 font-semibold tracking-[0.04em] text-gold-soft">
                <RoleIcon speaker={it.speaker} size={13} />
                {SPEAKER_LABEL[it.speaker] ?? it.speaker}
              </span>
              {st.tag && <span className={`rounded-full px-2 py-px text-[12px] font-bold ${st.tagCls}`}>{st.tag}</span>}
              {it.article_ref && <span className="text-[12px] font-semibold text-gold-soft">{it.article_ref}</span>}
            </p>
            <p className={`mt-0.5 text-[15px] leading-snug ${aside ? 'text-ivory/70 italic' : 'text-ivory/92'}`}>{it.text_uz}</p>
          </li>
        )
      })}
    </ol>
  )
}

interface Props {
  items: RecordItem[]
  open: boolean
  onClose: () => void
  /** subtitrda hozir ko'rinib turgan gap — bayonnomada takrorlanmaydi */
  hideText?: string | null
}

export function RecordPanel({ items, open, onClose, hideText = null }: Props) {
  const desktop = useIsDesktop()
  useEffect(() => {
    if (!open || desktop) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, desktop, onClose])
  if (!open) return null

  const last = items[items.length - 1]
  const shown = hideText && last && last.type === 'normal' && last.text_uz.trim() === hideText.trim() ? items.slice(0, -1) : items

  const header = (
    <div className="flex items-center justify-between gap-2 border-b border-gold-soft/20 py-1.5 pr-1.5 pl-3.5">
      <div className="flex items-center gap-2.5">
        <ScrollIcon size={20} className="text-gold-soft" />
        <div>
          <h2 id="record-title" className="font-display text-[22px] leading-tight font-semibold text-gold-soft">
            Jonli bayonnoma
          </h2>
          <p className="text-[12px] text-ivory/75">Kotib yozmoqda · {items.length} ta yozuv</p>
        </div>
      </div>
      <button type="button" onClick={onClose} aria-label="Bayonnomani yig'ish" title="Yig'ish" className="icon-btn">
        <CloseIcon />
      </button>
    </div>
  )

  if (desktop) {
    return (
      <aside
        aria-labelledby="record-title"
        className="glass-strong record-open absolute top-[10.5rem] left-3 z-10 flex max-h-[calc(100dvh-14rem)] w-80 flex-col overflow-hidden"
      >
        {header}
        <div className="thin-scroll min-h-0 overflow-y-auto">
          <Entries items={shown} />
        </div>
      </aside>
    )
  }
  return (
    <div className="absolute inset-0 z-30 flex items-end bg-navy-950/50" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-title"
        onClick={(e) => e.stopPropagation()}
        className="glass-strong flex max-h-[72dvh] w-full flex-col overflow-hidden rounded-b-none! bg-[var(--solid-bg-strong)]! pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-ivory/30" aria-hidden="true" />
        {header}
        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
          <Entries items={shown} />
        </div>
      </aside>
    </div>
  )
}
