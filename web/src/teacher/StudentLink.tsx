import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

export const STUDENT_URL = `${window.location.origin}/intro.html`
const IS_LOCAL = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)

/** Talabalar kiradigan havola + QR kod (bo'sh holatda va "Talabalar havolasi" oynasida). */
export function StudentLink({ compact = false }: { compact?: boolean }) {
  const [qr, setQr] = useState<string | null>(null)
  const [qrError, setQrError] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    QRCode.toDataURL(STUDENT_URL, { margin: 1, width: 360, color: { dark: '#08111f', light: '#f4eddc' } })
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQrError(true))
    return () => {
      alive = false
    }
  }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(STUDENT_URL)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('Havolani nusxalang:', STUDENT_URL)
    }
  }

  return (
    <div className={`tp-link ${compact ? 'is-compact' : ''}`}>
      <div className="tp-qr" aria-live="polite">
        {qr ? (
          <img src={qr} alt={`QR kod: ${STUDENT_URL}`} width={180} height={180} />
        ) : qrError ? (
          <span className="tp-muted">QR yaratilmadi</span>
        ) : (
          <span className="tp-skel" aria-label="QR yuklanmoqda" />
        )}
      </div>
      <div className="tp-link-body">
        <p className="tp-eyebrow">Talabalar uchun havola</p>
        <a className="tp-url" href={STUDENT_URL} target="_blank" rel="noreferrer">
          {STUDENT_URL}
        </a>
        <div className="tp-row">
          <button type="button" className="tp-btn tp-btn-gold" onClick={copy}>
            {copied ? 'Nusxalandi' : 'Havolani nusxalash'}
          </button>
          <a className="tp-btn tp-btn-ghost" href={STUDENT_URL} target="_blank" rel="noreferrer">
            Ochish
          </a>
        </div>
        {IS_LOCAL && (
          <p className="tp-hint">
            Bu lokal manzil: telefonlar uchun panelni kompyuterning tarmoq IP manzili orqali oching.
          </p>
        )}
      </div>
    </div>
  )
}
