/** Tuzoq savol natijasi: payqadi / o'tkazib yubordi / hali bo'lmagan */
export function TrapBadge({ v }: { v: boolean | null }) {
  if (v === true) return <span className="tp-pill is-good">Payqadi</span>
  if (v === false) return <span className="tp-pill is-bad">O‘tkazib yubordi</span>
  return <span className="tp-muted">—</span>
}
