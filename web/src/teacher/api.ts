// O'qituvchi paneli — backend /teacher/* (server/README.md). PIN header: x-teacher-pin.

/** ?api=http://localhost:8012 — faqat lokal sinov uchun (guvoh/api.ts dagi kabi) */
function apiOverride(): string | null {
  const v = new URLSearchParams(window.location.search).get('api')
  if (!v) return null
  try {
    const u = new URL(v)
    return /^(localhost|127\.0\.0\.1)$/.test(u.hostname) ? u.origin : null
  } catch {
    return null
  }
}

export const API_URL: string =
  apiOverride() ?? (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

export type Mode = 'majlis' | 'talim'

export interface Approval {
  teacher_name: string
  comment: string
  approved_at: string
}

export interface SessionSummary {
  id: string
  student_name: string
  mode: Mode
  started_at: string
  last_activity: string
  status: 'active' | 'finished'
  status_uz: string
  stage_uz: string | null
  score: number | null
  max: number | null
  violations: number
  revealed_hidden_fact: boolean
  trap_caught: boolean | null
  hints_used: number
  approval: Approval | null
}

export interface Criterion {
  id: string
  name_uz: string
  level: number
  max: number
  evidence_quote: string
  comment_uz: string
  article_ref: string | null
  article_verified: boolean
}

export interface RubricViolation {
  log_id: string
  id: string
  name_uz: string
  article_ref: string | null
  quote: string
}

export interface Rubric {
  criteria: Criterion[]
  total: number
  max: number
  percent: number
  violations: RubricViolation[]
  provider: string
  note_uz: string
  trap: { state: string | null; question_uz: string | null; invalid_motions: number } | null
  hints_used: number | null
}

export interface SessionDetail extends SessionSummary {
  rubric: Rubric
  rubric_final: boolean
  bayonnoma_url: string
}

export class ApiError extends Error {
  kind: 'pin' | 'offline' | 'server' | 'not_found'
  constructor(kind: ApiError['kind'], message: string) {
    super(message)
    this.kind = kind
  }
}

async function call<T>(path: string, pin: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', 'x-teacher-pin': pin, ...(init?.headers ?? {}) },
    })
  } catch {
    throw new ApiError('offline', 'Server bilan aloqa yo‘q. Backend ishga tushganini tekshiring.')
  }
  if (res.status === 401) throw new ApiError('pin', 'PIN noto‘g‘ri.')
  if (res.status === 404) throw new ApiError('not_found', 'Sessiya topilmadi (server qayta ishga tushgan bo‘lishi mumkin).')
  if (!res.ok) {
    let msg = `Server xatosi (${res.status}).`
    try {
      const body = await res.json()
      if (body?.detail?.message_uz) msg = body.detail.message_uz
    } catch {
      /* matn emas */
    }
    throw new ApiError('server', msg)
  }
  return (await res.json()) as T
}

export const listSessions = (pin: string) =>
  call<{ sessions: SessionSummary[]; count: number }>('/teacher/sessions', pin)

export const getSession = (pin: string, id: string) =>
  call<SessionDetail>(`/teacher/sessions/${encodeURIComponent(id)}`, pin)

export const approveSession = (pin: string, id: string, teacher_name: string, comment: string) =>
  call<{ ok: boolean; approval: Approval; session: SessionSummary }>(
    `/teacher/sessions/${encodeURIComponent(id)}/approve`,
    pin,
    { method: 'POST', body: JSON.stringify({ teacher_name, comment: comment || null }) },
  )
