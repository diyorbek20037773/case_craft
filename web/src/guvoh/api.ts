// CaseCraft backend (server/README.md) bilan aloqa. Server o'chiq bo'lsa — ApiError(kind: 'offline').

/** ?api=http://localhost:8010 — faqat lokal sinov uchun (boshqa hostga matn yuborilmasin) */
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

export const API_URL: string = apiOverride() ?? (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

/** Sahnadagi AI ishtirokchilar (3D personaj bor) */
export type Speaker = 'judge' | 'witness' | 'prosecutor' | 'clerk' | 'defendant'
/** Serverdan keladigan barcha gapiruvchilar: + talaba (defense) va AI ustoz (tutor, faqat talim) */
export type AnySpeaker = Speaker | 'defense' | 'tutor'
export type Mode = 'majlis' | 'talim'
export type StudentAction = 'next_stage' | 'request_floor' | 'motion_reject_question' | 'hint' | 'continue'
export type StageKind = 'opening' | 'questioning' | 'arguments' | 'last_word' | 'closing' | 'generic'

export interface StageInfo {
  id: string
  order?: number
  name_uz: string
  kind: StageKind
}

export interface Violation {
  id: string
  name_uz?: string
  article_ref: string | null
  article_verified?: boolean
  warning_uz: string
}

export interface Followup {
  speaker: AnySpeaker
  text_uz: string
  audio_url: string | null
  kind?: 'utterance' | 'motion' | 'ruling' | 'record' | 'tutor'
}

/** So'z navbati: kimda so'z, kim so'radi, raislik qiluvchi kimni kutyapti */
export interface Floor {
  holder: Speaker | 'defense'
  requested_by: string[]
  expected: string | null
  label_uz: string
}

export type RecordType = 'normal' | 'violation' | 'fact' | 'ruling' | 'motion'

export interface RecordItem {
  t: string
  speaker: AnySpeaker
  text_uz: string
  type: RecordType
  log_id?: string
  stage_id?: string
  article_ref?: string | null
}

export interface TutorChoice {
  id: string
  label_uz: string
  text_uz: string
  action?: StudentAction
}

export interface TutorRule {
  ref: string
  title_uz: string
  text_uz: string
  verified: boolean
}

export interface Tutor {
  say_uz: string | null
  choices: TutorChoice[]
  hints_left: number
  hints_used?: number
  pause: boolean
  rule?: TutorRule | null
  audio_url: string | null
  /** Server (talim): nima sababli — stage_start | violation | motion_ok | motion_missed | motion_denied | hint | none */
  event?: string
}

/** Talaba payqashi kerak bo'lgan imkoniyat (prokurorning tuzoq savoli) */
export interface TurnWindow {
  kind: 'motion_opportunity' | string
  until_ms: number
  hint_uz: string | null
}

/** /session/start va /turn dagi rejim maydonlari (eski server bo'lsa — yo'q) */
export interface ModeExtras {
  mode?: Mode
  floor?: Floor
  record_delta?: RecordItem[]
  tutor?: Tutor | null
  window?: TurnWindow | null
}

export interface StartRes extends ModeExtras {
  session_id: string
  case_id: string
  stage_id: string
  stages: StageInfo[]
  speaker: Speaker
  text_uz: string
  audio_url: string | null
  disclaimer_uz: string
}

export interface TurnRes extends ModeExtras {
  speaker: AnySpeaker
  text_uz: string
  stage_id: string
  stage_name_uz?: string | null
  stage_kind: StageKind | null
  stage_changed: boolean
  can_advance: boolean
  finished: boolean
  violation: Violation | null
  revealed_hidden_fact: boolean
  audio_url: string | null
  followups: Followup[]
  transcript_uz: string | null
  source?: string
  timings?: Record<string, number>
}

export interface Criterion {
  id: string
  name_uz: string
  level: number
  max: number
  evidence_quote: string
  article_ref: string | null
  article_verified: boolean
  comment_uz: string
  source: string
}

export interface FinishRes {
  session_id: string
  completed: boolean
  rubric: {
    criteria: Criterion[]
    total: number
    max: number
    percent: number
    violations: { log_id: string; id: string; article_ref: string | null; quote: string }[]
    revealed_hidden_fact: boolean
    provider: string
    note_uz?: string
    mode?: Mode
    trap?: { state: 'pending' | 'caught' | 'missed' | null; question_uz: string | null; invalid_motions: number } | null
    hints_used?: number | null
    hints_left?: number | null
    pauses?: number | null
  }
  bayonnoma_html: string
  record?: RecordItem[]
  disclaimer_uz: string
}

export interface Evidence {
  id: string
  name_uz: string
  about_uz: string
}

export interface CaseRes {
  case: {
    id: string
    title_uz: string
    summary_uz: string
    charge: { article: string; text_uz: string }
    defendant: { name: string; about_uz: string }
    facts_uz: string[]
    evidence: Evidence[]
    prosecutor_position_uz?: string
    witness?: { name: string; role_uz: string }
  }
  rules: { stages: { id: string; name_uz: string; order?: number }[] }
  disclaimer_uz: string
}

export interface SttRes {
  text_uz: string
  ms: number
  provider?: string
}

export type ApiErrorKind = 'offline' | 'timeout' | 'session' | 'http'

export class ApiError extends Error {
  kind: ApiErrorKind
  /** HTTP holati (bo'lsa) va server kodi: stt_failed, bad_audio, hint_unavailable ... */
  status: number
  code: string
  constructor(kind: ApiErrorKind, message: string, status = 0, code = '') {
    super(message)
    this.kind = kind
    this.status = status
    this.code = code
  }
}

/** /turn 409 session_finished: sessiya /finish bilan yopilgan (masalan, boshqa oynada) — xato emas, natijaga o'tiladi */
export const isSessionFinished = (e: unknown): boolean => e instanceof ApiError && e.code === 'session_finished'

const OFFLINE_MSG = "AI server ulanmagan. Server ishga tushganini tekshirib, qayta urinib ko'ring."

async function request<T>(path: string, init?: RequestInit, timeoutMs = 30000): Promise<T> {
  const ctl = new AbortController()
  const timer = window.setTimeout(() => ctl.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: ctl.signal,
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiError('timeout', "AI javobi kechikdi. Qayta urinib ko'ring.")
    }
    throw new ApiError('offline', OFFLINE_MSG)
  } finally {
    window.clearTimeout(timer)
  }
  if (!res.ok) {
    let msg = `Server xatosi (${res.status}). Qayta urinib ko'ring.`
    let code = ''
    try {
      const body = (await res.json()) as { detail?: { code?: string; message_uz?: string } | string }
      if (body.detail && typeof body.detail === 'object') {
        msg = body.detail.message_uz ?? msg
        code = body.detail.code ?? ''
      }
    } catch {
      /* JSON emas */
    }
    throw new ApiError(code === 'session_not_found' ? 'session' : 'http', msg, res.status, code)
  }
  return (await res.json()) as T
}

export type TurnInput = { text: string } | { action: StudentAction }

/** O'qituvchi tasdig'i (o'qituvchi paneli yozadi; talaba faqat holatni ko'radi) */
export interface Approval {
  teacher_name: string
  comment: string
  approved_at: string
  /** Server tayyorlagan o'zbekcha vaqt (bo'lsa) */
  at_uz?: string
}

/** GET /session/{id}/approval: {approved, teacher_name, at, at_uz, comment}; {approval: {...}} ko'rinishi ham qabul qilinadi */
function toApproval(v: unknown): Approval | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (o.approval !== undefined) return toApproval(o.approval)
  if (o.approved === false || typeof o.teacher_name !== 'string' || !o.teacher_name) return null
  return {
    teacher_name: o.teacher_name,
    comment: typeof o.comment === 'string' ? o.comment : '',
    approved_at: typeof o.approved_at === 'string' ? o.approved_at : typeof o.at === 'string' ? o.at : '',
    ...(typeof o.at_uz === 'string' && o.at_uz ? { at_uz: o.at_uz } : {}),
  }
}

const post = <T>(path: string, body: unknown, timeoutMs?: number) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) }, timeoutMs)

export const api = {
  getCase: () => request<CaseRes>('/case'),
  /** mode doim aniq yuboriladi (yuborilmasa server eski xatti-harakatga o'tadi) */
  start: (opts: { mode: Mode; case_id?: string | null; student_name?: string }) =>
    post<StartRes>('/session/start', {
      mode: opts.mode,
      ...(opts.case_id ? { case_id: opts.case_id } : {}),
      ...(opts.student_name ? { student_name: opts.student_name } : {}),
    }),
  turn: (session_id: string, input: TurnInput) => post<TurnRes>('/turn', { session_id, ...input }),
  /** Ovoz -> matn (Gemini, audio saqlanmaydi). Xatoda ApiError status 422 */
  stt: (audio_b64: string, mime: string) => post<SttRes>('/stt', { audio_b64, mime }, 25000),
  /** rubrika real LLM bilan 3× budjet oladi */
  finish: (session_id: string) => post<FinishRes>('/finish', { session_id }, 60000),
  /** Tasdiq holati (tasdiqlanmagan bo'lsa null). Server bu yo'lni bilmasa — ApiError status 404 */
  approval: (session_id: string) =>
    request<unknown>(`/session/${encodeURIComponent(session_id)}/approval`, undefined, 10000).then(toApproval),
  bayonnomaUrl: (session_id: string) => `${API_URL}/session/${encodeURIComponent(session_id)}/bayonnoma`,
}
