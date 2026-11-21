// Sahna UI ikonlari (inline SVG, currentColor). Emoji yo'q — barcha belgi shu yerda.
import type { ReactNode } from 'react'
import type { AnySpeaker } from '../api'

function Svg({ size = 18, className = '', children, sw = 1.8 }: { size?: number; className?: string; children: ReactNode; sw?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

type P = { size?: number; className?: string }

export const FolderIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.2l2 2h8.8A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
  </Svg>
)
export const ScrollIcon = (p: P) => (
  <Svg {...p}>
    <path d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7" />
    <path d="M7 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2" />
    <path d="M9 9h6M9 12.5h6M9 16h3.5" />
  </Svg>
)
export const SoundOnIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  </Svg>
)
export const SoundOffIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
    <path d="m16 9.5 5 5M21 9.5l-5 5" />
  </Svg>
)
export const MoreIcon = (p: P) => (
  <Svg {...p} sw={2.4}>
    <path d="M5.5 12h.01M12 12h.01M18.5 12h.01" />
  </Svg>
)
export const CloseIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
)
export const CheckIcon = (p: P) => (
  <Svg {...p} sw={2.2}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
)
export const ArrowRightIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
)
export const SkipIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 6.5v11l8-5.5zM17.5 6.5v11" />
  </Svg>
)
export const FlagIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 21V4M5 4.5h11l-2 4 2 4H5" />
  </Svg>
)
export const BulbIcon = (p: P) => (
  <Svg {...p}>
    <path d="M9 17.5h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z" />
  </Svg>
)
export const ObjectionIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3 3.5 7.5v1h17v-1z" />
    <path d="M5.5 10v7M9.8 10v7M14.2 10v7M18.5 10v7M3.5 20h17" />
  </Svg>
)
export const MicIcon = (p: P) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </Svg>
)
export const SendIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 12 20 4l-4.5 16-3.5-6.5z" />
    <path d="m12 13.5 3.5-3.5" />
  </Svg>
)
export const WarnIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5 2.5 20h19z" />
    <path d="M12 10v4.5M12 17.2h.01" />
  </Svg>
)
export const XMarkSmall = (p: P) => (
  <Svg {...p} sw={2.4}>
    <path d="M7 7l10 10M17 7 7 17" />
  </Svg>
)
export const GavelIcon = (p: P) => (
  <Svg {...p}>
    <path d="m13.5 4.5 6 6M11 7l6 6M12.5 5.5l-4 4 6 6 4-4M10.5 11.5 3.5 18.5M4 21h9" />
  </Svg>
)
export const EarIcon = (p: P) => (
  <Svg {...p}>
    <path d="M7 9a5 5 0 0 1 10 0c0 3-3 3.6-3 6.5a2.5 2.5 0 0 1-5 0M10 9.5a2 2 0 0 1 4 0" />
  </Svg>
)
export const ChartIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 20h16M7 16v-4M12 16V7M17 16v-6.5" />
  </Svg>
)
export const CapIcon = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 9.5 12 5l9.5 4.5L12 14 2.5 9.5Z" />
    <path d="M6.5 11.6v4.1c0 1.2 2.5 2.8 5.5 2.8s5.5-1.6 5.5-2.8v-4.1M21.5 9.5v5" />
  </Svg>
)
export const PauseIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M10 9v6M14 9v6" />
  </Svg>
)

/** Gapiruvchi roli ikoni (subtitr, bayonnoma) */
export function RoleIcon({ speaker, size = 14, className = '' }: { speaker: AnySpeaker | string; size?: number; className?: string }) {
  const p = { size, className }
  switch (speaker) {
    case 'judge':
      return <GavelIcon {...p} />
    case 'witness':
      return (
        <Svg {...p}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </Svg>
      )
    case 'prosecutor':
      return (
        <Svg {...p}>
          <path d="M12 4v16M7 20h10M5 7h14M5 7l-2.5 6a2.5 2.5 0 0 0 5 0zM19 7l-2.5 6a2.5 2.5 0 0 0 5 0z" />
        </Svg>
      )
    case 'clerk':
      return (
        <Svg {...p}>
          <path d="M15.5 4.5 19.5 8.5 9 19H5v-4z" />
        </Svg>
      )
    case 'defendant':
      return (
        <Svg {...p}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0M9 20v-3M15 20v-3" />
        </Svg>
      )
    case 'tutor':
      return <CapIcon {...p} />
    default:
      return (
        <Svg {...p}>
          <path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z" />
        </Svg>
      )
  }
}
