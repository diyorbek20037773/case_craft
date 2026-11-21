import { IconStar8 } from './icons'

/** Sahna pastki burchaklaridagi oltin 8 qirrali yulduzlar va ularni bog‘lovchi ingichka chiziqlar (konsept rasmlari). */
export function StageOrnaments() {
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 hidden h-40 sm:block lg:inset-x-6 lg:bottom-4" aria-hidden>
      <span className="stage-orn-h" />
      <span className="stage-orn-v left-[13px]" />
      <span className="stage-orn-v right-[13px]" />
      <IconStar8 className="stage-orn-star absolute -bottom-px left-0 size-[27px]" />
      <IconStar8 className="stage-orn-star absolute -bottom-px right-0 size-[27px]" />
    </div>
  )
}
