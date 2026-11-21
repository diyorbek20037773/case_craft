/**
 * "Boshlash" ortidagi 8 qirrali yulduz (ikki 45° burilgan kvadrat): chiziq 1.4 s da chiziladi
 * (stroke-dashoffset), keyin 60 s/aylanish. Reduced-motion — darhol chizilgan, aylanmaydi; q-low — aylanmaydi.
 */
export function StartStar({ className = '' }: { className?: string }) {
  return (
    <span className={'ld-star ' + className} aria-hidden>
      <svg viewBox="-50 -50 100 100" className="ld-star-svg">
        <rect className="ld-star-sq" x="-34" y="-34" width="68" height="68" pathLength={1} />
        <rect className="ld-star-sq ld-star-sq2" x="-34" y="-34" width="68" height="68" pathLength={1} transform="rotate(45)" />      </svg>
    </span>
  )
}
