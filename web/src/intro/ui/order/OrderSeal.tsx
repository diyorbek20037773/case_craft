import { useId } from 'react'
import { star8Points } from './star8'

const STAR = star8Points(66, 50, 17, 10.5)
const RING = 'M 66,66 m -48,0 a 48,48 0 1,1 96,0 a 48,48 0 1,1 -96,0'

/**
 * CaseCraft o‘quv muhri: dumaloq, markazida o‘zimizning 8 qirrali yulduz, «TASDIQLANDI» tasmasi.
 * Davlat muhri EMAS — aylana matnida ham shunday yozilgan.
 */
export function OrderSeal({ className = '' }: { className?: string }) {
  const uid = useId()
  const ring = `${uid}-ring`
  const ink = `${uid}-ink`
  return (
    <svg viewBox="0 0 132 132" className={className} aria-hidden>
      <defs>
        <path id={ring} d={RING} />
        {/* siyoh notekisligi: muhr qog‘ozga bir tekis tushmaydi */}
        <filter id={ink} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="11" />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 2" />
          <feComposite in="SourceGraphic" operator="in" />
        </filter>
      </defs>
      <g filter={`url(#${ink})`} fill="none" stroke="currentColor">
        <circle cx="66" cy="66" r="62" strokeWidth="3.2" />
        <circle cx="66" cy="66" r="56.5" strokeWidth="1.1" />
        <circle cx="66" cy="66" r="38.5" strokeWidth="1.1" />
        <text fill="currentColor" stroke="none" fontSize="8.4" fontWeight="800" fontFamily="Manrope, system-ui, sans-serif">
          <textPath href={`#${ring}`} textLength="296" lengthAdjust="spacing">
            CASECRAFT ✦ O‘QUV MUHRI ✦ TO‘QIMA HUJJAT ✦
          </textPath>
        </text>
        <polygon points={STAR} strokeWidth="1.7" strokeLinejoin="round" />
        <circle cx="66" cy="50" r="4" fill="currentColor" stroke="none" />
        <rect x="3" y="78" width="126" height="25" rx="2" style={{ fill: '#f4eddc' }} strokeWidth="2.4" />
        <rect x="6.5" y="81.5" width="119" height="18" rx="1" strokeWidth="0.8" />
        <text
          x="66"
          y="95.2"
          textAnchor="middle"
          fill="currentColor"
          stroke="none"
          fontSize="13"
          fontWeight="800"
          letterSpacing="1.3"
          fontFamily="Manrope, system-ui, sans-serif"
        >
          TASDIQLANDI
        </text>
      </g>
    </svg>
  )
}
