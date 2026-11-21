import { useEffect, useState, type ReactNode } from 'react'
import { CREDITS_URL } from './scene'

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; text: string }

/** public/models/CREDITS.md ni oddiy ko'rinishda chiqaradi (sarlavha, matn, jadval, havolalar). */
export function Credits({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    fetch(CREDITS_URL)
      .then((r) => {
        const type = r.headers.get('content-type') ?? ''
        if (!r.ok || type.includes('text/html')) throw new Error(String(r.status))
        return r.text()
      })
      .then((text) => !cancelled && setState({ status: 'ready', text }))
      .catch(() => !cancelled && setState({ status: 'error' }))
    return () => {
      cancelled = true
    }
  }, [attempt])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="credits-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-t-2xl border border-white/10 bg-slate-900 text-slate-100 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 id="credits-title" className="text-base font-semibold">
            Mualliflar va litsenziyalar
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            Yopish
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4 text-sm leading-relaxed">
          {state.status === 'loading' && <p className="text-slate-400">Yuklanmoqda…</p>}
          {state.status === 'error' && (
            <div className="space-y-3">
              <p className="text-slate-300">Mualliflar ro'yxatini yuklab bo'lmadi.</p>
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15"
              >
                Qayta urinish
              </button>
            </div>
          )}
          {state.status === 'ready' && <Markdown text={state.text} />}
          <p className="mt-6 text-xs text-slate-400">
            Dvigatel: three.js, React Three Fiber, drei (MIT). Sud zali sahnasi, kamera nuqtalari va gapirish
            ko'rsatkichi — jamoa kodi.
          </p>
        </div>
      </div>
    </div>
  )
}

function inline(text: string): ReactNode[] {
  // havolalar va **qalin** matn
  const parts = text.split(/(https?:\/\/[^\s)]+|\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => {
    if (/^https?:\/\//.test(p))
      return (
        <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all text-amber-300 underline underline-offset-2">
          {p}
        </a>
      )
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
    return p
  })
}

function Markdown({ text }: { text: string }) {
  const lines = text.split(/\r?\n/)
  const out: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) {
      i++
      continue
    }
    if (line.startsWith('|')) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i]
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim())
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells)
        i++
      }
      const [head, ...body] = rows
      out.push(
        <div key={`t${i}`} className="space-y-3">
          {body.map((r, ri) => (
            <dl key={ri} className="rounded-xl border border-white/10 bg-white/5 p-3">
              {r.map((c, ci) => (
                <div key={ci} className="flex flex-col gap-0.5 py-0.5 sm:flex-row sm:gap-2">
                  <dt className="shrink-0 text-xs text-slate-400 sm:w-24">{head?.[ci]}</dt>
                  <dd className="min-w-0">{inline(c)}</dd>
                </div>
              ))}
            </dl>
          ))}
        </div>,
      )
      continue
    }
    if (line.startsWith('#')) {
      out.push(
        <h3 key={`h${i}`} className="mb-2 mt-1 font-semibold text-slate-200">
          {line.replace(/^#+\s*/, '')}
        </h3>,
      )
    } else {
      out.push(
        <p key={`p${i}`} className="mb-3 text-slate-300">
          {inline(line)}
        </p>,
      )
    }
    i++
  }
  return <>{out}</>
}
