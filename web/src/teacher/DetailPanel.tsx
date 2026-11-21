import { useEffect, useRef, useState } from 'react'
import { ApiError, approveSession, getSession, type SessionDetail, type SessionSummary } from './api'
import { fmtDateTime, fmtTime, MODE_UZ } from './format'
import { TrapBadge } from './TrapBadge'

const NAME_KEY = 'casecraft.teacher.name'

interface Props {
  pin: string
  summary: SessionSummary
  onClose: () => void
  onApproved: (s: SessionSummary) => void
  onPinError: () => void
}

/** Qatorni bosganda ochiladigan yon panel: mezonlar, qoidabuzarliklar, bayonnoma, tasdiq. */
export function DetailPanel({ pin, summary, onClose, onApproved, onPinError }: Props) {
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showDoc, setShowDoc] = useState(false)
  const [docKey, setDocKey] = useState(0)
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '')
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // ro'yxat yangilansa (ball, qoidabuzarlik, holat, tasdiq) — tafsilot ham qayta olinadi
  const sig = `${summary.id}|${summary.status}|${summary.score}|${summary.violations}|${summary.last_activity}|${summary.approval?.approved_at ?? ''}`
  useEffect(() => {
    let alive = true
    getSession(pin, summary.id)
      .then((d) => {
        if (!alive) return
        setDetail(d)
        setError(null)
      })
      .catch((e: unknown) => {
        if (!alive) return
        if (e instanceof ApiError && e.kind === 'pin') onPinError()
        setError(e instanceof Error ? e.message : 'Xatolik')
      })
    return () => {
      alive = false
    }
  }, [pin, sig, summary.id, onPinError])

  // boshqa talaba tanlansa komponent key={id} bilan qayta yaratiladi — holat o'z-o'zidan tozalanadi
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function approve(e: React.FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) {
      setSaveError('O‘qituvchi ismini kiriting.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const r = await approveSession(pin, summary.id, n, comment.trim())
      localStorage.setItem(NAME_KEY, n)
      setComment('')
      setDocKey((k) => k + 1) // iframe tasdiq qatori bilan qayta yuklansin
      onApproved(r.session)
    } catch (err) {
      if (err instanceof ApiError && err.kind === 'pin') onPinError()
      setSaveError(err instanceof Error ? err.message : 'Tasdiqlab bo‘lmadi.')
    } finally {
      setSaving(false)
    }
  }

  const s = detail ?? summary
  const approval = summary.approval ?? detail?.approval ?? null
  const rub = detail?.rubric

  return (
    <aside className="tp-panel glass-strong" role="dialog" aria-modal="false" aria-labelledby="tp-panel-title">
      <header className="tp-panel-head">
        <div>
          <p className="tp-eyebrow">
            {MODE_UZ[s.mode]} · {fmtDateTime(s.started_at)}
          </p>
          <h2 id="tp-panel-title">{s.student_name}</h2>
          <span className={`tp-status is-${s.status}`}>{s.status_uz}</span>
          {s.stage_uz && s.status === 'active' && <span className="tp-muted tp-stage"> · {s.stage_uz}</span>}
        </div>
        <button ref={closeRef} type="button" className="tp-icon-btn" onClick={onClose} aria-label="Panelni yopish">
          ×
        </button>
      </header>

      <div className="tp-panel-body">
        {error && !detail && <p className="tp-alert">{error}</p>}
        {!detail && !error && (
          <div className="tp-skel-block" aria-label="Yuklanmoqda">
            <span className="tp-skel" />
            <span className="tp-skel" />
            <span className="tp-skel" />
          </div>
        )}

        {rub && (
          <>
            <section className="tp-score">
              <div>
                <span className="tp-score-num">{rub.total}</span>
                <span className="tp-score-max">/ {rub.max}</span>
              </div>
              <div className="tp-score-meta">
                <span>{rub.percent}%</span>
                <span className="tp-muted">
                  {detail.rubric_final ? 'AI tavsiyasi — yakuniy bahoni siz tasdiqlaysiz' : 'Dastlabki baho (mashg‘ulot davom etmoqda)'}
                </span>
              </div>
            </section>

            <dl className="tp-facts">
              <div>
                <dt>Tuzoq savol</dt>
                <dd>
                  <TrapBadge v={s.trap_caught} />
                </dd>
              </div>
              <div>
                <dt>Yashirin fakt</dt>
                <dd>{s.revealed_hidden_fact ? <span className="tp-good">Ochildi</span> : <span className="tp-muted">Ochilmadi</span>}</dd>
              </div>
              <div>
                <dt>Maslahatlar</dt>
                <dd>{s.mode === 'talim' ? `${s.hints_used} / 3` : '—'}</dd>
              </div>
            </dl>

            <section>
              <h3>Mezonlar</h3>
              <ul className="tp-crit">
                {rub.criteria.map((c) => (
                  <li key={c.id}>
                    <div className="tp-crit-head">
                      <b>{c.name_uz}</b>
                      <span className={`tp-lvl lvl-${c.level}`}>
                        {c.level}/{c.max}
                      </span>
                    </div>
                    {c.evidence_quote ? (
                      <blockquote>«{c.evidence_quote}»</blockquote>
                    ) : (
                      <p className="tp-muted tp-small">Talaba gapidan iqtibos topilmadi</p>
                    )}
                    {c.comment_uz && <p className="tp-small">{c.comment_uz}</p>}
                    {c.article_ref && (
                      <p className="tp-small tp-art">
                        {c.article_ref}
                        {!c.article_verified && <span className="tp-warn"> (tekshirilmagan)</span>}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3>Qoidabuzarliklar ({rub.violations.length})</h3>
              {rub.violations.length === 0 ? (
                <p className="tp-muted tp-small">Qoidabuzarlik qayd etilmadi.</p>
              ) : (
                <ul className="tp-viol">
                  {rub.violations.map((v) => (
                    <li key={v.log_id}>
                      <b>{v.name_uz}</b>
                      {v.article_ref && <span className="tp-art"> · {v.article_ref}</span>}
                      {v.quote && <blockquote>«{v.quote}»</blockquote>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3>Bayonnoma</h3>
              <div className="tp-row">
                <button type="button" className="tp-btn tp-btn-ghost" onClick={() => setShowDoc((v) => !v)} aria-expanded={showDoc}>
                  {showDoc ? 'Yashirish' : 'Shu yerda ko‘rish'}
                </button>
                <a className="tp-btn tp-btn-ghost" href={detail.bayonnoma_url} target="_blank" rel="noreferrer">
                  Yangi oynada ochish
                </a>
              </div>
              {showDoc && (
                <iframe key={docKey} className="tp-doc" src={detail.bayonnoma_url} title={`Bayonnoma — ${s.student_name}`} />
              )}
            </section>
          </>
        )}

        <section className="tp-approve">
          <h3>O‘qituvchi tasdig‘i</h3>
          {approval ? (
            <div className="tp-approved" role="status">
              <span className="tp-check" aria-hidden="true">✓</span>
              <div>
                <b>
                  Tasdiqlandi · {approval.teacher_name} · {fmtTime(approval.approved_at)}
                </b>
                {approval.comment && <p className="tp-small">Izoh: {approval.comment}</p>}
              </div>
            </div>
          ) : (
            <form onSubmit={approve} className="tp-form">
              <p className="tp-small tp-muted">
                Yakuniy baho — o‘qituvchiniki. Tasdiq bayonnomaga «O‘qituvchi tasdiqladi» qatori bilan yoziladi.
                {s.status === 'active' && ' Mashg‘ulot hali tugamagan: tasdiq joriy holat bo‘yicha baholaydi.'}
              </p>
              <label>
                <span>Ismingiz</span>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Masalan: Karimova D." autoComplete="name" />
              </label>
              <label>
                <span>Izoh (ixtiyoriy)</span>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={2} placeholder="Talabaga qisqa izoh" />
              </label>
              {saveError && <p className="tp-alert">{saveError}</p>}
              <button type="submit" className="tp-btn tp-btn-gold tp-btn-wide" disabled={saving}>
                {saving ? 'Saqlanmoqda…' : 'Tasdiqlash'}
              </button>
            </form>
          )}
        </section>
      </div>
    </aside>
  )
}
