// RoleSlides modalining holati: rol paneli va agent kartochkalari openSlides(rol) ni chaqiradi.
import { useSyncExternalStore } from 'react'
import { actions, getState } from '../state'
import { requestOrder } from './order/orderStore'
import type { SlideRole } from './slides'

let current: SlideRole | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export function openSlides(role: SlideRole) {
  current = role
  emit()
}

export function closeSlides() {
  current = null
  emit()
}

export function useSlidesRole() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => current,
  )
}

/** "Himoyachi sifatida davom etish": rol tanlashda — ish papkasiga; titul/rejim/lobbidan — rejim tanlashga;
 *  ish papkasida — shunchaki sahnaga qaytadi (rol allaqachon tanlangan); launch paytida hech narsa qilmaydi */
export function chooseFromSlides() {
  closeSlides()
  const { phase } = getState()
  if (phase === 'launch') return
  window.scrollTo({ top: 0 })
  // rol tanlashda — "HIMOYACHI ORDERI · TASDIQLANDI" muhri orqali (overlay o'zi chooseRole ni chaqiradi)
  if (phase === 'select') {
    if (!requestOrder()) actions.chooseRole()
  } else if (phase !== 'case') actions.start()
}
