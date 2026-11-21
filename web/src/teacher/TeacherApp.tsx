import { useCallback, useEffect, useState } from 'react'
import { ApiError, API_URL, listSessions, type SessionSummary } from './api'
import { DetailPanel } from './DetailPanel'
import { fmtAgo, fmtTime, MODE_UZ } from './format'
import { TrapBadge } from './TrapBadge'
import { StudentLink } from './StudentLink'

const PIN_KEY = 'casecraft.teacher.pin'
const POLL_MS = 5000

export function TeacherApp() {
  const [pin, setPin] = useState<string | null>(() => sessionStorage.getItem(PIN_KEY))
  const logout = useCallback(() => {
    sessionStorage.removeItem(PIN_KEY)
    setPin(null)
  }, [])

  return (
    <div className="tp-app">
      <header className="tp-top">
        <a className="tp-brand" href="/intro.html" aria-label="CaseCraft bosh sahifa">
          <img src="/intro/casecraft-emblem-64.png" alt="" width={32} height={32} />
          <span>
            <b>CaseCraft</b>
            <small>O‘qituvchi paneli</small>
          </span>
        </a>
        <span className="tp-ai">AI o‘quv simulyatsiyasi</span>
        {pin && (
          <button type="button" className="tp-btn tp-btn-ghost tp-btn-sm" onClick={logout}>
            Chiqish
          </button>
        )}
      </header>
      {pin ? (
        <Dashboard pin={pin} onPinError={logout} />
      ) : (
        <PinGate
          onOk={(p) => {
            sessionStorage.setItem(PIN_KEY, p)
            setPin(p)
          }}
        />
      )}
    </div>
  )
}

function PinGate({ onOk }: { onOk: (pin: string) => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!value.trim()) {
      setError('PIN kiriting.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await listSessions(value.trim())
      onOk(value.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="tp-gate">
      <form className="tp-gate-card glass-strong" onSubmit={submit}>
        <p className="tp-eyebrow">O‘qituvchi uchun</p>
        <h1>Mashg‘ulotlar paneli</h1>
        <p className="tp-muted">
          Talabalarning sud majlisi mashg‘ulotlarini kuzating, AI tavsiya qilgan bahoni ko‘ring va yakuniy bahoni tasdiqlang.
        </p>
        <label>
          <span>PIN</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={32}
            placeholder="••••"
          />
        </label>
        {error && <p className="tp-alert">{error}</p>}
        <button type="submit" className="tp-btn tp-btn-gold tp-btn-wide" disabled={busy}>
          {busy ? 'Tekshirilmoqda…' : 'Kirish'}
        </button>
      </form>
    </main>
  )
}

function Dashboard({ pin, onPinError }: { pin: string; onPinError: () => void }) {
  const [rows, setRows] = useState<SessionSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updated, setUpdated] = useState<number | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [showLink, setShowLink] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      const r = await listSessions(pin)
      setRows(r.sessions)
      setError(null)
      setUpdated(Date.now())
    } catch (err) {
      if (err instanceof ApiError && err.kind === 'pin') return onPinError()
      setError(err instanceof Error ? err.message : 'Xatolik')
    }
  }, [pin, onPinError])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => {
      if (!document.hidden) void load()
      setNow(Date.now())
    }, POLL_MS)
    return () => window.clearInterval(t)
  }, [load])

  const sel = rows?.find((r) => r.id === selected) ?? null
  const onApproved = useCallback((s: SessionSummary) => {
    setRows((rs) => rs?.map((r) => (r.id === s.id ? s : r)) ?? rs)
  }, [])
  const close = useCallback(() => setSelected(null), [])

  const active = rows?.filter((r) => r.status === 'active').length ?? 0
  const finished = rows?.filter((r) => r.status === 'finished').length ?? 0
  const approved = rows?.filter((r) => r.approval).length ?? 0

  return (
    <main className={`tp-main ${sel ? 'has-panel' : ''}`}>
      <section className="tp-head">
        <div>
          <h1>Mashg‘ulotlar</h1>
          <p className="tp-muted tp-small" aria-live="polite">
            {updated ? `Har 5 soniyada yangilanadi · oxirgi: ${fmtTime(new Date(updated).toISOString())}` : 'Yuklanmoqda…'}
          </p>
        </div>
        <button type="button" className="tp-btn tp-btn-ghost" onClick={() => setShowLink(true)}>
          Talabalar havolasi
        </button>
      </section>

      {error && (
        <div className="tp-alert tp-alert-row" role="alert">
          <span>{error}</span>
          <span className="tp-small tp-muted">API: {API_URL}</span>
          <button type="button" className="tp-btn tp-btn-ghost tp-btn-sm" onClick={() => void load()}>
            Qayta urinish
          </button>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="tp-stats">
          <Stat label="Jami" value={rows.length} />
          <Stat label="Davom etmoqda" value={active} />
          <Stat label="Yakunlangan" value={finished} />
          <Stat label="Tasdiqlangan" value={approved} />
        </div>
      )}

      {rows === null && !error && (
        <div className="tp-card glass tp-skel-block" aria-label="Yuklanmoqda">
          <span className="tp-skel" />
          <span className="tp-skel" />
          <span className="tp-skel" />
        </div>
      )}

      {rows && rows.length === 0 && (
        <section className="tp-empty glass">
          <h2>Hali mashg‘ulot yo‘q — talabalar havola orqali kiradi</h2>
          <p className="tp-muted">Talaba mashg‘ulotni boshlashi bilan u shu jadvalda paydo bo‘ladi.</p>
          <StudentLink />
        </section>
      )}

      {rows && rows.length > 0 && (
        <div className="tp-table-wrap glass">
          <table className="tp-table">
            <thead>
              <tr>
                <th>Talaba</th>
                <th>Rejim</th>
                <th>Ball</th>
                <th>Qoidabuzarlik</th>
                <th>Tuzoq</th>
                <th>Holat</th>
                <th>Vaqt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={r.id === selected ? 'is-selected' : ''}
                  tabIndex={0}
                  onClick={() => setSelected(r.id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelected(r.id))}
                  aria-label={`${r.student_name} — tafsilotlarni ochish`}
                >
                  <td data-l="Talaba" className="tp-td-name">
                    <b>{r.student_name}</b>
                    {r.approval && <span className="tp-pill is-good tp-pill-sm">Tasdiqlandi</span>}
                  </td>
                  <td data-l="Rejim">{MODE_UZ[r.mode]}</td>
                  <td data-l="Ball" className="tp-td-score">
                    {r.score !== null ? (
                      <>
                        <b>{r.score}</b>
                        <span className="tp-muted">/{r.max}</span>
                      </>
                    ) : (
                      <span className="tp-muted">—</span>
                    )}
                  </td>
                  <td data-l="Qoidabuzarlik">
                    {r.violations > 0 ? <span className="tp-bad">{r.violations}</span> : <span className="tp-muted">0</span>}
                  </td>
                  <td data-l="Tuzoq">
                    <TrapBadge v={r.trap_caught} />
                  </td>
                  <td data-l="Holat">
                    <span className={`tp-status is-${r.status}`}>{r.status_uz}</span>
                  </td>
                  <td data-l="Vaqt" title={r.started_at}>
                    {fmtTime(r.started_at)} <span className="tp-muted tp-small">· {fmtAgo(r.last_activity, now)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="tp-foot tp-small tp-muted">
        AI o‘quv simulyatsiyasi, real sud qarori emas. Baho — AI tavsiyasi; yakuniy bahoni o‘qituvchi tasdiqlaydi.
      </p>

      {sel && <DetailPanel key={sel.id} pin={pin} summary={sel} onClose={close} onApproved={onApproved} onPinError={onPinError} />}

      {showLink && (
        <div className="tp-modal" role="dialog" aria-modal="true" aria-label="Talabalar havolasi" onClick={() => setShowLink(false)}>
          <div className="tp-modal-card glass-strong" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="tp-icon-btn tp-modal-x" onClick={() => setShowLink(false)} aria-label="Yopish">
              ×
            </button>
            <StudentLink compact />
          </div>
        </div>
      )}
    </main>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="tp-stat glass">
      <span className="tp-stat-num">{value}</span>
      <span className="tp-stat-l">{label}</span>
    </div>
  )
}
