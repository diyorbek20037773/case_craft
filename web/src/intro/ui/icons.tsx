// Oddiy chiziqli ikonkalar (24x24, currentColor). Kutubxonasiz.
import { useId } from 'react'
import { star8Points } from './order/star8'

type P = { className?: string }

const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export function IconSpeakerOn({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6" />
      <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  )
}

export function IconSpeakerOff({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </svg>
  )
}

export function IconArrowLeft({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  )
}

export function IconArrowRight({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export function IconChevronDown({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export function IconClose({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

export function IconSpark({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M17.5 6.5L15 9M9 15l-2.5 2.5" />
    </svg>
  )
}

export function IconUser({ className }: P) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  )
}

export function IconPlay({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconCap({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M2.5 9.5L12 5l9.5 4.5L12 14z" />
      <path d="M6.5 11.5v4.2c0 1.3 2.5 2.8 5.5 2.8s5.5-1.5 5.5-2.8v-4.2" />
      <path d="M21.5 9.5v5" />
    </svg>
  )
}

export function IconGavel({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M13.5 4.5l6 6M11 7l6 6M12.2 5.8l-4.4 4.4 6 6 4.4-4.4" />
      <path d="M10.8 13.2L4 20" />
      <path d="M3 21h9" />
    </svg>
  )
}

export function IconUsers({ className }: P) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3 19.5a6 6 0 0 1 12 0" />
      <circle cx="17" cy="9.5" r="2.6" />
      <path d="M16.5 14.2a5 5 0 0 1 4.8 5.3" />
    </svg>
  )
}

export function IconCopy({ className }: P) {
  return (
    <svg {...base} className={className}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </svg>
  )
}

export function IconBook({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M12 6.5c-1.8-1.3-4.5-2-8-2v13c3.5 0 6.2.7 8 2 1.8-1.3 4.5-2 8-2v-13c-3.5 0-6.2.7-8 2z" />
      <path d="M12 6.5v13" />
    </svg>
  )
}

export function IconShield({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z" />
      <path d="M8.8 12l2.3 2.3 4.4-4.6" />
    </svg>
  )
}

export function IconCheck({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

/** Konseptdagi burchak bezagi: o‘tkir uchli 8 qirrali yulduz konturi */
const STAR_PTS = star8Points(12, 12, 11, 6.6)

export function IconStar8({ className }: P) {
  return (
    <svg {...base} strokeWidth={1.25} className={className}>
      <polygon points={STAR_PTS} />
    </svg>
  )
}

/** Ikki 45° burilgan kvadrat (to‘liq kontur) — rejim ikonkalari ramkasi; ichida yumshoq oltin nur */
const FRAME_OUTER = star8Points(50, 50, 48.5)
const FRAME_INNER = star8Points(50, 50, 41)

export function Star8Frame({ className }: P) {
  const id = useId()
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden fill="none">
      <defs>
        <radialGradient id={id} cx="50%" cy="34%" r="66%">
          <stop offset="0%" stopColor="#c9a45c" stopOpacity="0.3" />
          <stop offset="70%" stopColor="#08111f" stopOpacity="0.55" />
        </radialGradient>
      </defs>
      <polygon points={FRAME_OUTER} fill={`url(#${id})`} stroke="currentColor" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <polygon points={FRAME_INNER} stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}
