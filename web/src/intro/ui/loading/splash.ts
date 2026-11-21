// intro.html dagi statik splash (#boot-splash) — JS dan oldin chiqadi. React birinchi marta chizilgach
// yumshoq yo‘qoladi (titul shu payt intro-rise bilan ko‘tariladi). StrictMode ikki marta chaqirsa ham bir marta ishlaydi.

const MIN_VISIBLE_MS = 450
const FADE_MS = 650

let dismissed = false

export function dismissSplash() {
  if (dismissed) return
  dismissed = true
  const el = document.getElementById('boot-splash')
  if (!el) return
  const wait = Math.max(0, MIN_VISIBLE_MS - performance.now())
  window.setTimeout(() => {
    // ikki kadr: titul DOM i haqiqatan chizilganidan keyin
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.setAttribute('data-done', '')
        window.setTimeout(() => el.remove(), FADE_MS + 100)
      }),
    )
  }, wait)
}
