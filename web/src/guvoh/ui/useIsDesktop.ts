import { useEffect, useState } from 'react'

/** Noutbuk (>= 1024 px): bayonnoma yon panel; telefon — pastki varaq */
export function useIsDesktop() {
  const q = '(min-width: 1024px)'
  const [desk, setDesk] = useState(() => window.matchMedia?.(q).matches ?? true)
  useEffect(() => {
    const m = window.matchMedia?.(q)
    if (!m) return
    const on = () => setDesk(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return desk
}
