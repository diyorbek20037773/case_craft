import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type CaseRes } from '../api'

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; data: CaseRes }

/** Ish materiali (GET /case — yashirin faktsiz): ayblov, faktlar, dalillar */
export function CasePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const closeRef = useRef<HTMLButtonElement>(null)

  const fetchCase = useCallback(() => {
    api
      .getCase()
      .then((data) => setLoad({ state: 'ok', data }))
      .catch((e: Error) => setLoad({ state: 'error', message: e.message }))
  }, [])
  const retry = () => {
    setLoad({ state: 'loading' })
    fetchCase()
  }

  const loaded = load.state === 'ok'
  useEffect(() => {
    if (open && !loaded) fetchCase()
  }, [open, loaded, fetchCase])

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="absolute inset-0 z-30 flex justify-end bg-navy-950/55 backdrop-blur-[2px]" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="case-title"
        onClick={(e) => e.stopPropagation()}
        className="glass-strong flex h-full w-full max-w-md flex-col rounded-none! border-y-0! border-r-0! bg-[var(--solid-bg-strong)]!"
      >
        <div className="flex items-center justify-between gap-2 border-b border-gold-soft/20 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <h2 id="case-title" className="font-display text-[26px] leading-tight font-semibold text-gold-soft">Ish materiali</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="btn-secondary rounded-full"
          >
            Yopish
          </button>
        </div>
        <div className="thin-scroll flex-1 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-[15px] leading-relaxed text-ivory/90">
          {load.state === 'loading' && <p className="flex items-center gap-2 text-ivory/80" role="status"><span className="spin text-gold-soft" aria-hidden="true" />Yuklanmoqda…</p>}
          {load.state === 'error' && (
            <div className="rounded-[10px] border border-rose-400/50 border-l-4 bg-rose-500/12 p-3" role="alert">
              <p className="text-rose-100">{load.message}</p>
              <button type="button" onClick={retry} className="btn-primary mt-2 min-h-11 text-[14px]">
                Qayta urinish
              </button>
            </div>
          )}
          {load.state === 'ok' && <CaseBody data={load.data} />}
        </div>
      </aside>
    </div>
  )
}

function CaseBody({ data }: { data: CaseRes }) {
  const c = data.case
  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="font-display text-[24px] leading-tight font-semibold text-ivory">{c.title_uz}</h3>
        <p className="mt-1 text-ivory/80">{c.summary_uz}</p>
      </section>
      <section>
        <h4 className="eyebrow">Ayblov</h4>
        <p className="mt-1 font-medium text-ivory">{c.charge.article}</p>
        <p className="mt-1 text-ivory/80">{c.charge.text_uz}</p>
      </section>
      <section>
        <h4 className="eyebrow">Sudlanuvchi</h4>
        <p className="mt-1"><span className="font-medium text-ivory">{c.defendant.name}</span> — {c.defendant.about_uz}</p>
      </section>
      {c.witness && (
        <section>
          <h4 className="eyebrow">Guvoh</h4>
          <p className="mt-1"><span className="font-medium text-ivory">{c.witness.name}</span> — {c.witness.role_uz}</p>
        </section>
      )}
      <section>
        <h4 className="eyebrow">Faktlar</h4>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {c.facts_uz.map((f) => <li key={f}>{f}</li>)}
        </ul>
      </section>
      <section>
        <h4 className="eyebrow">Dalillar</h4>
        <ul className="mt-1 space-y-2">
          {c.evidence.map((e) => (
            <li key={e.id} className="rounded-[10px] border border-gold-soft/20 bg-ivory/5 p-2.5">
              <p className="font-medium text-ivory"><span className="text-gold-soft">{e.id}</span> · {e.name_uz}</p>
              <p className="mt-0.5 text-ivory/80">{e.about_uz}</p>
            </li>
          ))}
        </ul>
      </section>
      <p className="text-[13px] text-ivory/70">{data.disclaimer_uz} To'qima o'quv ishi.</p>
    </div>
  )
}
