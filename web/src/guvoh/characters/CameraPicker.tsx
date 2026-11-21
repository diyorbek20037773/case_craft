// Kamera kadri tanlovi: Avto (gapirganga silliq o'tadi) | Umumiy | Sudya | Guvoh | Prokuror | Sudlanuvchi | Kotib.
// TopBar dagi "Kamera" tugmasi bilan bir holatda ishlaydi: avto -> director.camera 'auto', umumiy -> 'wide',
// personaj -> 'close' + court.focus. TopBar tugmasi rejimni almashtirsa, tanlangan personaj bekor qilinadi.
import { useEffect, useRef, useState } from 'react'
import type { CameraMode } from '../director'
import type { Speaker } from '../session'
import { court, FOCUS_LABEL } from './court'

const ROLES: Speaker[] = ['judge', 'witness', 'prosecutor', 'defendant', 'clerk']

interface Props {
  cam: CameraMode
  onCamera: (m: CameraMode) => void
}

export function CameraPicker({ cam, onCamera }: Props) {
  const [open, setOpen] = useState(false)
  const [focus, setFocus] = useState<Speaker | null>(court.focus)
  const box = useRef<HTMLDivElement>(null)

  // TopBar rejimni almashtirsa (yaqin emas) — personaj tanlovi bekor
  useEffect(() => {
    if (cam !== 'close' && court.focus !== null) {
      court.focus = null
      setFocus(null)
    }
  }, [cam])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (f: 'auto' | 'wide' | Speaker) => {
    if (f === 'auto' || f === 'wide') {
      court.focus = null
      setFocus(null)
      onCamera(f)
    } else {
      court.focus = f
      setFocus(f)
      onCamera('close')
    }
    setOpen(false)
  }

  const current: 'auto' | 'wide' | Speaker | null = cam === 'auto' ? 'auto' : cam === 'wide' ? 'wide' : cam === 'close' ? focus : null
  const label = current === 'auto' ? 'Avto' : current ? FOCUS_LABEL[current] : cam === 'close' ? 'Yaqin' : 'Erkin'
  const items: ('auto' | 'wide' | Speaker)[] = ['auto', 'wide', ...ROLES]

  return (
    <div
      ref={box}
      className="pointer-events-auto absolute right-3 top-[calc(max(0.75rem,env(safe-area-inset-top))_+_6.4rem)] z-10 sm:top-[calc(max(0.75rem,env(safe-area-inset-top))_+_3.4rem)]"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Kadr: ${label}. Tanlash`}
        className="min-h-11 rounded-full border border-white/20 bg-black/45 px-3.5 text-xs font-medium text-white backdrop-blur-md transition active:scale-95"
      >
        Kadr: <span className="text-amber-100">{label}</span>
      </button>
      {open && (
        <div role="menu" aria-label="Kamera kadri" className="absolute right-0 top-full mt-1.5 flex w-44 flex-col overflow-hidden rounded-2xl border border-white/15 bg-black/80 py-1 backdrop-blur-md">
          {items.map((it) => {
            const active = it === current
            return (
              <button
                key={it}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => pick(it)}
                className={`flex min-h-11 items-center justify-between px-3.5 text-left text-[13px] transition hover:bg-white/10 ${active ? 'text-amber-200' : 'text-white/85'}`}
              >
                <span>{it === 'auto' ? 'Avto' : FOCUS_LABEL[it]}</span>
                <span className="text-[10px] text-white/45">{it === 'auto' ? 'gapirganga' : active ? '●' : ''}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
