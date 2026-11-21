// 3D sahna yuklanish holati: LazyScene (og‘ir chunk ichida, drei useProgress) shu yerga yozadi,
// TopBar dagi yuklanish chizig‘i (asosiy chunk) shu yerdan o‘qiydi. Bu fayl three/drei ni import qilmaydi.
//
// Ombor globalThis da saqlanadi: dev rejimida og‘ir chunk sahifa ochilgandan ~30-60 s keyin (sekin kompyuterda)
// yuklanadi; shu orada biror fayl saqlansa, Vite lazy chunk ichidagi importlarga yangi `?t=` beradi va modul
// IKKINCHI nusxada ishga tushadi. Unda sahna bir nusxaga, chiziq boshqasiga qarab qoladi ("0/5 personaj" abadiy).
// Umumiy global obyekt — har qanday nusxa bir xil holatni yozadi va o‘qiydi.
import { useSyncExternalStore } from 'react'

export type SceneProgress = {
  /** og‘ir 3D chunk yuklandi va sahna DOM ga qo‘shildi */
  mounted: boolean
  /** 3D sahna xato berib o‘chdi (SceneBoundary zaxira fonni ko‘rsatmoqda) — yuklanish chizig‘i yashirinadi */
  gone: boolean
  /** drei useProgress: THREE.DefaultLoadingManager hozir nimadir yuklayaptimi */
  active: boolean
  /** 0..100 */
  progress: number
  total: number
  /** sahnada tayyor bo‘lgan personajlar soni (Characters.markLoaded yozadi; state.loadedFigures ning zaxirasi) */
  figures: number
}

type Store = { snap: SceneProgress; listeners: Set<() => void>; figureIds: Set<string> }

const KEY = '__introSceneProgressStore'
const g = globalThis as unknown as Record<string, Store | undefined>
const store: Store = (g[KEY] ??= {
  snap: { mounted: false, gone: false, active: false, progress: 0, total: 0, figures: 0 },
  listeners: new Set(),
  figureIds: new Set(),
})

export function setSceneProgress(patch: Partial<SceneProgress>) {
  const snap = store.snap
  const next = { ...snap, ...patch }
  if (
    next.mounted === snap.mounted &&
    next.gone === snap.gone &&
    next.active === snap.active &&
    next.progress === snap.progress &&
    next.total === snap.total &&
    next.figures === snap.figures
  )
    return
  store.snap = next
  store.listeners.forEach((l) => l())
}

/** personaj (model, siluyet yoki yakuniy kapsula) tayyor — har rol bir marta hisoblanadi */
export function reportFigure(id: string) {
  if (store.figureIds.has(id)) return
  store.figureIds.add(id)
  setSceneProgress({ figures: store.figureIds.size })
}

function subscribe(l: () => void) {
  store.listeners.add(l)
  return () => {
    store.listeners.delete(l)
  }
}

const getSnap = () => store.snap

export function useSceneProgress() {
  return useSyncExternalStore(subscribe, getSnap)
}
