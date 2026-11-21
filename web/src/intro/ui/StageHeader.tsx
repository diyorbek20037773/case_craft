import type { ReactNode } from 'react'
import { actions } from '../state'
import { IconArrowLeft } from './icons'

/** "—— Sarlavha ——" oltin chiziqlar bilan */
export function RuleHeading({
  children,
  as: Tag = 'h2',
  id,
  className = '',
  focusable = false,
  nowrap = false,
}: {
  children: ReactNode
  as?: 'h2' | 'h3'
  id?: string
  className?: string
  focusable?: boolean
  /** qisqa ekran sarlavhalari: matn bir qatorda, chiziqlar qisqaradi */
  nowrap?: boolean
}) {
  return (
    <Tag id={id} tabIndex={focusable ? -1 : undefined} className={'rule-heading m-0 outline-none focus:outline-none ' + className}>
      <span className={nowrap ? 'shrink-0 whitespace-nowrap' : 'min-w-0'}>{children}</span>
    </Tag>
  )
}

/** Ekran sarlavhasi: chapda "Orqaga", markazda oltin chiziqli serif sarlavha */
export function StageHeader({
  title,
  hint,
  extra,
  className = '',
}: {
  title: string
  hint?: ReactNode
  extra?: ReactNode
  className?: string
}) {
  return (
    <div className={'pointer-events-none absolute inset-x-0 top-[var(--stage-top)] z-10 px-3 sm:px-6 ' + className}>
      <div className="relative mx-auto max-w-[1440px]">
        <button
          type="button"
          className="btn-secondary pointer-events-auto absolute left-0 top-0 z-10 size-11 px-0 sm:size-auto sm:px-4"
          onClick={actions.back}
          aria-label="Orqaga"
        >
          <IconArrowLeft className="size-5" />
          <span className="hidden sm:inline" aria-hidden>
            Orqaga
          </span>
        </button>
        <div className="intro-rise px-12 text-center sm:px-36">
          <RuleHeading
            focusable
            nowrap
            className="text-[1.6rem] drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] min-[400px]:text-[1.85rem] sm:text-[2.6rem] lg:text-[3rem]"
          >
            {title}
          </RuleHeading>
          {hint && (
            <p className="m-0 mt-1 text-sm text-ivory/80 drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)] sm:text-base">{hint}</p>
          )}
          {extra}
        </div>
      </div>
    </div>
  )
}
