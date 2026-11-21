// Push-to-talk: tugmani bosib turib gapirish -> MediaRecorder (webm/opus, maks 15 s) -> backend /stt -> matn.
// Lokal model yo'q: audio faqat /stt ga yuboriladi va hech qayerda saqlanmaydi. Xavfsiz kontekst (HTTPS yoki localhost)
// bo'lmasa brauzer mikrofonni bermaydi — micSupported() false, tugma ko'rsatilmaydi (matn va chiplar doim ishlaydi).
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../api'

export const MAX_REC_MS = 15000
const MIN_REC_MS = 600

export function micSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  )
}

function pickMime(): string {
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m
    } catch {
      /* eski brauzer */
    }
  }
  return ''
}

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(b)
  })
}

export type MicState = 'idle' | 'starting' | 'recording' | 'transcribing'

interface Opts {
  onText: (text: string) => void
  onError: (message: string) => void
}

export function usePushToTalk({ onText, onError }: Opts) {
  const [state, setState] = useState<MicState>('idle')
  const [elapsed, setElapsed] = useState(0)
  const cb = useRef({ onText, onError })
  useEffect(() => {
    cb.current = { onText, onError }
  })
  const busy = useRef(false)
  const wantStop = useRef(false)
  const rec = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const t0 = useRef(0)
  const timers = useRef<number[]>([])
  /** Unmount bo'ldimi: kutilayotgan getUserMedia / onstop / /stt natijasi endi ishlatilmaydi */
  const alive = useRef(true)

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }
  const release = () => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      clearTimers()
      const r = rec.current
      rec.current = null
      if (r) {
        // onstop -> transcribe chaqirilmasin: unmountdan keyin /stt yuborilmaydi
        r.onstop = null
        r.ondataavailable = null
        try {
          if (r.state === 'recording') r.stop()
        } catch {
          /* allaqachon to'xtagan */
        }
      }
      chunks.current = []
      release()
      busy.current = false
    }
  }, [])

  const transcribe = useCallback(async (mime: string) => {
    if (!alive.current) return
    clearTimers()
    release()
    rec.current = null
    const dur = performance.now() - t0.current
    const blob = new Blob(chunks.current, { type: mime })
    chunks.current = []
    if (dur < MIN_REC_MS || blob.size < 1000) {
      busy.current = false
      setState('idle')
      cb.current.onError("Juda qisqa. Tugmani bosib turgan holda gapiring.")
      return
    }
    setState('transcribing')
    try {
      const r = await api.stt(await blobToDataUrl(blob), mime)
      if (!alive.current) return
      const text = r.text_uz.trim()
      if (!text) throw new ApiError('http', '', 422, 'stt_failed')
      cb.current.onText(text)
    } catch (e) {
      if (!alive.current) return
      const msg =
        e instanceof ApiError && e.status === 422
          ? 'Ovoz tanilmadi. Savolni yozib yuboring.'
          : e instanceof ApiError && e.message
            ? e.message
            : "Ovozni yuborib bo'lmadi. Savolni yozib yuboring."
      cb.current.onError(msg)
    } finally {
      busy.current = false
      if (alive.current) setState('idle')
    }
  }, [])

  const stop = useCallback(() => {
    wantStop.current = true
    const r = rec.current
    if (r && r.state === 'recording') r.stop()
  }, [])

  const start = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    wantStop.current = false
    setState('starting')
    let s: MediaStream
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch (e) {
      busy.current = false
      if (!alive.current) return
      setState('idle')
      const name = e instanceof DOMException ? e.name : ''
      cb.current.onError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Mikrofonga ruxsat berilmadi. Savolni yozib yuboring.'
          : 'Mikrofon topilmadi. Savolni yozib yuboring.',
      )
      return
    }
    if (!alive.current) {
      // ruxsat kutilayotganda komponent yopildi — mikrofon darhol o'chiriladi (chiroq yonib qolmasin)
      s.getTracks().forEach((t) => t.stop())
      busy.current = false
      return
    }
    if (wantStop.current) {
      // birinchi bosishda ruxsat oynasi chiqdi va tugma qo'yib yuborildi
      s.getTracks().forEach((t) => t.stop())
      busy.current = false
      setState('idle')
      cb.current.onError('Mikrofon tayyor. Endi tugmani bosib turib gapiring.')
      return
    }
    stream.current = s
    const mime = pickMime()
    let r: MediaRecorder
    try {
      r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined)
    } catch {
      release()
      busy.current = false
      setState('idle')
      cb.current.onError("Bu brauzerda ovoz yozib bo'lmadi. Savolni yozib yuboring.")
      return
    }
    chunks.current = []
    r.ondataavailable = (ev) => {
      if (ev.data.size) chunks.current.push(ev.data)
    }
    r.onstop = () => void transcribe(r.mimeType || mime || 'audio/webm')
    rec.current = r
    t0.current = performance.now()
    r.start(250)
    setElapsed(0)
    setState('recording')
    timers.current.push(window.setTimeout(stop, MAX_REC_MS))
    let tickId = 0
    const tick = () => {
      setElapsed(performance.now() - t0.current)
      timers.current = timers.current.filter((t) => t !== tickId)
      if (rec.current === r && alive.current) {
        tickId = window.setTimeout(tick, 200)
        timers.current.push(tickId)
      }
    }
    tick()
  }, [stop, transcribe])

  return { state, elapsed, start, stop }
}
