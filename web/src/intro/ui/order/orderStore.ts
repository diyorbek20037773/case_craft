// "Himoyachi orderi" marosimini so‘rash. SelectScreen ochiq bo‘lsa — u marosimni ko‘rsatib, oxirida
// actions.chooseRole() ni o‘zi chaqiradi. Tinglovchi bo‘lmasa false qaytadi (chaqiruvchi to‘g‘ridan-to‘g‘ri o‘tsin).

let listener: (() => void) | null = null

export function requestOrder(): boolean {
  if (!listener) return false
  listener()
  return true
}

export function onOrderRequest(l: () => void) {
  listener = l
  return () => {
    if (listener === l) listener = null
  }
}
