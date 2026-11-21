// Slayd illyustratsiyalari: 64x64 chiziqli SVG, currentColor. Tashqi rasm yo‘q.
import type { ReactNode } from 'react'
import type { SlideIcon } from './slidesData'

const base = {
  viewBox: '0 0 64 64',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
}

const PATHS: Record<SlideIcon, ReactNode> = {
  gavel: (
    <>
      <rect x="20" y="10" width="24" height="12" rx="3" transform="rotate(-35 32 16)" />
      <path d="M34 22l-15 21" />
      <path d="M17 45l3-4" strokeWidth={5} />
      <path d="M30 52h24M34 46h16v6H34z" />
    </>
  ),
  scroll: (
    <>
      <path d="M18 12h28a4 4 0 0 1 4 4v34a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V12z" />
      <path d="M18 12a4 4 0 0 0-4 4v4h4" />
      <path d="M26 24h16M26 31h16M26 38h10" />
      <circle cx="41" cy="45" r="4" />
    </>
  ),
  shield: (
    <>
      <path d="M32 8l20 7v14c0 13-8.5 22-20 27C20.5 51 12 42 12 29V15z" />
      <path d="M23 31l6 6 12-13" />
    </>
  ),
  speech: (
    <>
      <path d="M12 16a6 6 0 0 1 6-6h28a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H28l-10 9v-9a6 6 0 0 1-6-6z" />
      <path d="M22 22h20M22 29h13" />
      <path d="M54 46c2 2 3 4.5 3 7M50 50c1 1 1.5 2 1.5 3.5" />
    </>
  ),
  quill: (
    <>
      <path d="M50 10C34 14 24 26 20 42l4 2c4-3 9-5 14-6-3-1-6-1-9 0 4-4 9-6 13-7-2-1-5-1-7-1C42 24 47 18 50 10z" />
      <path d="M22 43l-6 11" />
      <path d="M30 54h22" />
    </>
  ),
  person: (
    <>
      <circle cx="32" cy="21" r="9" />
      <path d="M14 54c1.5-10 9-16 18-16s16.5 6 18 16" />
      <path d="M26 46h12" />
    </>
  ),
  chip: (
    <>
      <rect x="18" y="18" width="28" height="28" rx="5" />
      <path d="M26 38l4-12h4l4 12M27.5 34h9" />
      <path d="M24 18v-6M32 18v-6M40 18v-6M24 52v-6M32 52v-6M40 52v-6M18 24h-6M18 32h-6M18 40h-6M52 24h-6M52 32h-6M52 40h-6" />
    </>
  ),
  cap: (
    <>
      <path d="M6 25l26-11 26 11-26 11z" />
      <path d="M17 30v11c0 4 7 8 15 8s15-4 15-8V30" />
      <path d="M54 27v14" />
      <circle cx="54" cy="44" r="2" />
    </>
  ),
  lens: (
    <>
      <circle cx="27" cy="27" r="14" />
      <path d="M37.5 37.5L52 52" strokeWidth={4} />
      <path d="M27 21v8M27 33.5v.5" />
    </>
  ),
  scales: (
    <>
      <path d="M32 10v42M20 54h24M14 18h36" />
      <circle cx="32" cy="10" r="2" />
      <path d="M14 18L7 34h14zM50 18l-7 16h14z" />
      <path d="M7 34a7 4 0 0 0 14 0M43 34a7 4 0 0 0 14 0" />
    </>
  ),
  book: (
    <>
      <path d="M32 16c-5-4-12-5-20-4v36c8-1 15 0 20 4 5-4 12-5 20-4V12c-8-1-15 0-20 4z" />
      <path d="M32 16v36" />
      <path d="M18 22h8M18 29h8M38 22h8M38 29h8" />
    </>
  ),
  lock: (
    <>
      <rect x="14" y="28" width="36" height="26" rx="5" />
      <path d="M22 28v-7a10 10 0 0 1 20 0v7" />
      <path d="M32 38v6" />
      <circle cx="32" cy="37" r="2.5" />
    </>
  ),
  bulb: (
    <>
      <path d="M24 42c0-5-8-9-8-18a16 16 0 0 1 32 0c0 9-8 13-8 18z" />
      <path d="M25 48h14M27 54h10" />
      <path d="M32 18v10M28 24l4 4 4-4" />
    </>
  ),
}

export function SlideIconSvg({ name, className }: { name: SlideIcon; className?: string }) {
  return (
    <svg {...base} className={className}>
      {PATHS[name]}
    </svg>
  )
}
