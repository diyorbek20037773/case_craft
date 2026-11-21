import type { ReactNode } from 'react'
import type { Floor, Mode, StageInfo } from '../api'
import { FolderIcon, ScrollIcon, SoundOffIcon, SoundOnIcon } from './icons'

const MODE_BADGE: Record<Mode, { label: string; title: string }> = {
  majlis: {
    label: 'Sud majlisi',
    title: "Imtihon rejimi: maslahat yo'q, xato bayonnomaga yoziladi",
  },
  talim: {
    label: "Ta'lim · ustoz bilan",
    title: "Ustoz tushuntiradi, xatoda vaqt to'xtaydi, 3 ta maslahat",
  },
}

/** Qo'l belgisi — talaba so'z so'radi */
export function HandIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path
        d="M8 11V5.5a1.5 1.5 0 0 1 3 0V10m0-5.5v-1a1.5 1.5 0 0 1 3 0V10m0-4.5a1.5 1.5 0 0 1 3 0V13c0 4-2.5 7.5-6.5 7.5-2.6 0-4.1-1.3-5.4-3.4L3.4 14a1.4 1.4 0 0 1 2.2-1.7L8 14.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * So'z chipi: kimda so'z. Talabada — oltin fon, navy matn, yengil puls; boshqada — shisha.
 * Noutbukda markaz-tepada (TopBar), telefonda dock ichida (CourtDock) ko'rsatiladi.
 */
export function FloorChip({ floor, requested, className = '' }: { floor: Floor; requested: boolean; className?: string }) {
  const mine = floor.holder === 'defense'
  return (
    <span
      aria-live="polite"
      title="O'quv ko'rsatkichi: so'zni raislik qiluvchi beradi"
      data-mine={mine}
      data-asked={requested && !mine}
      className={`floor-chip ${className}`}
    >
      <span className="dot" aria-hidden="true" />
      <span className="truncate">{mine ? "So'z sizda — gapiring" : floor.label_uz}</span>
      {requested && !mine && (
        <span className="inline-flex shrink-0 items-center gap-1 border-l border-gold-soft/30 pl-2 text-[13px] font-semibold text-gold-soft">
          <HandIcon /> so'raldi
        </span>
      )}
    </span>
  )
}

interface Props {
  mode: Mode
  stages: StageInfo[]
  stageId: string | null
  closed: boolean
  floor: Floor | null
  floorRequested: boolean
  recordCount: number
  recordOpen: boolean
  onRecord: () => void
  onCase: () => void
  muted: boolean
  onMute: () => void
  /** Kamera tanlovi (characters/CameraPicker) — shu guruhga qo'yiladi */
  camera?: ReactNode
}

export function TopBar({ mode, stages, stageId, closed, floor, floorRequested, recordCount, recordOpen, onRecord, onCase, muted, onMute, camera }: Props) {
  const idx = stages.findIndex((s) => s.id === stageId)
  const stage = idx >= 0 ? stages[idx] : null
  const pct = stages.length ? (closed ? 100 : Math.round(((idx + 0.5) / stages.length) * 100)) : 0
  const badge = MODE_BADGE[mode]
  return (
    <>
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="glass pointer-events-auto flex min-w-0 max-w-[min(23rem,calc(100vw-14.5rem))] flex-col gap-1.5 px-3 py-2.5 sm:max-w-[min(23rem,48vw)] sm:px-3.5">
          <div className="flex items-center gap-2">
            <img src="/intro/casecraft-emblem-64.png" alt="" width={28} height={28} className="h-7 w-7 shrink-0" />
            <span className="font-display text-[22px] leading-none font-semibold tracking-tight text-gold-soft">CaseCraft</span>
          </div>
          <p className="text-[13px] leading-tight font-medium text-ivory/85">
            AI o'quv simulyatsiyasi<span className="hidden sm:inline"> · real sud qarori emas</span>
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span title={badge.title} className="rounded-full border border-gold/60 px-2.5 py-0.5 text-[12px] font-semibold tracking-[0.04em] text-gold-soft">
              {badge.label}
            </span>
          </div>
          {stage ? (
            <div>
              <p className="truncate text-[14px] font-medium text-ivory" title={stage.name_uz}>
                <span className="font-semibold text-gold-soft">
                  {idx + 1}/{stages.length}
                </span>{' '}
                · {closed ? 'Majlis yakunlandi' : stage.name_uz}
              </p>
              <div
                className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-ivory/10"
                role="progressbar"
                aria-label="Majlis bosqichi"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#9c7b3c,#e2c88f)] shadow-[0_0_10px_rgb(226_200_143/0.5)] transition-[width] duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-[14px] text-ivory/75">Majlis hali boshlanmagan</p>
          )}
        </div>

        <div className="pointer-events-auto flex shrink-0 items-center gap-1.5" role="toolbar" aria-label="Sahna boshqaruvi">
          <button type="button" onClick={onCase} aria-label="Ish materiali" title="Ish materiali" className="btn-secondary w-11 rounded-full px-0 sm:w-auto sm:px-4">
            <FolderIcon className="text-gold-soft" />
            <span className="hidden sm:inline">Ish materiali</span>
          </button>
          <button
            type="button"
            onClick={onRecord}
            aria-pressed={recordOpen}
            aria-label={`Bayonnoma, ${recordCount} ta yozuv`}
            title="Jonli bayonnoma"
            className="btn-secondary relative w-11 rounded-full px-0 sm:w-auto sm:px-4"
          >
            <ScrollIcon className="text-gold-soft" />
            <span className="hidden sm:inline">Bayonnoma</span>
            {recordCount > 0 && (
              <span
                key={recordCount}
                className="count-pop absolute -top-1 -right-1 min-w-5 rounded-full bg-gold px-1.5 text-center text-[12px] leading-5 font-bold text-navy-950 sm:static sm:bg-ivory/15 sm:text-ivory"
              >
                {recordCount}
              </span>
            )}
          </button>
          {camera && <div className="cam-slot">{camera}</div>}
          <button
            type="button"
            onClick={onMute}
            aria-pressed={!muted}
            aria-label={muted ? 'Ovozni yoqish' : "Ovozni o'chirish"}
            title={muted ? 'Ovoz o\'chiq — yoqish' : "Ovoz yoqiq — o'chirish"}
            className="btn-secondary w-11 rounded-full px-0"
          >
            {muted ? <SoundOffIcon className="text-ivory/80" /> : <SoundOnIcon className="text-gold-soft" />}
          </button>
        </div>
      </header>

      {floor && !closed && (
        <div className="pointer-events-none absolute top-[4.25rem] left-1/2 z-10 hidden -translate-x-1/2 lg:block xl:top-[max(1rem,env(safe-area-inset-top))]">
          <FloorChip floor={floor} requested={floorRequested} />
        </div>
      )}
    </>
  )
}
