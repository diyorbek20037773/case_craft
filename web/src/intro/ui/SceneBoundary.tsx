import { Component, type ReactNode } from 'react'
import { simHref } from '../config'
import { actions, getState, type Phase } from '../state'
import { setSceneProgress } from './loading/progressStore'
import { dismissSplash } from './loading/splash'

/**
 * 3D sahna xato bersa (WebGL yo‘q, 3D chunk yoki model/HDRI yuklanmadi) butun kirish qismi yiqilmasin:
 * interfeys ishlashda davom etadi, fon oddiy to‘q ko‘k gradient bo‘ladi, yuklanish chizig‘i yashirinadi.
 */
export class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    // lazy chunk yuklanmasa ProgressReporter umuman ishga tushmaydi — chiziq "0/5" da qolmasin
    setSceneProgress({ gone: true })
    console.warn('[intro] 3D sahna o‘chirildi, zaxira fon ko‘rsatilmoqda:', error)
  }

  render() {
    if (this.state.failed) {
      return (
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,#1c2f54_0%,#0c1629_55%,#08111f_100%)]"
        />
      )
    }
    return this.props.children
  }
}

/** Xatolik oynasidagi to‘g‘ridan-to‘g‘ri majlis havolasi (tanlangan rejim bilan) */
function SimLink({ className }: { className: string }) {
  return (
    <a className={className} href={simHref(getState().mode === 'majlis' ? 'majlis' : 'talim')}>
      To‘g‘ridan-to‘g‘ri majlisga
    </a>
  )
}

/**
 * Bitta ekran (titul, rejim, rol, ish papkasi) xato bersa — qora/bo‘sh ekran o‘rniga kichik oyna:
 * "Orqaga", "Qayta urinish" va majlisga to‘g‘ridan-to‘g‘ri havola. Ekran (faza) almashganda o‘zi tiklanadi
 * (IntroApp uni faza kaliti bilan qayta yaratadi).
 */
export class StageBoundary extends Component<{ phase: Phase; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[intro] ekranni chizishda xato:', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    const { phase } = this.props
    return (
      <div className="pointer-events-auto absolute inset-0 grid place-items-center px-4" role="alert">
        <div className="glass-strong grid w-full max-w-md gap-4 p-6 text-center">
          <p className="m-0 font-display text-[1.7rem] font-semibold leading-tight text-ivory">Bu ekranni ochib bo‘lmadi</p>
          <p className="m-0 text-ivory/80">Orqaga qayting yoki qayta urinib ko‘ring. Majlisni to‘g‘ridan-to‘g‘ri ham boshlash mumkin.</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {phase !== 'title' && phase !== 'launch' ? (
              <button type="button" className="btn-secondary" onClick={actions.back}>
                Orqaga
              </button>
            ) : null}
            <button type="button" className="btn-secondary" onClick={() => this.setState({ failed: false })}>
              Qayta urinish
            </button>
          </div>
          <SimLink className="btn-primary btn-gold" />
        </div>
      </div>
    )
  }
}

/**
 * Ilova ildizi: kutilmagan xato bo‘lsa splash abadiy qolib ketmasin va oq/bo‘sh sahifa chiqmasin —
 * qayta yuklash va majlisga to‘g‘ridan-to‘g‘ri havola.
 */
export class RootBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[intro] ilovada xato:', error)
    dismissSplash()
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="grid min-h-svh place-items-center bg-navy-950 px-4" role="alert">
        <div className="glass-strong grid w-full max-w-md gap-4 p-6 text-center">
          <p className="m-0 font-display text-[1.7rem] font-semibold leading-tight text-ivory">Sahifani ko‘rsatib bo‘lmadi</p>
          <p className="m-0 text-ivory/80">Sahifani qayta yuklang yoki majlisni to‘g‘ridan-to‘g‘ri boshlang.</p>
          <button type="button" className="btn-secondary" onClick={() => window.location.reload()}>
            Qayta yuklash
          </button>
          <SimLink className="btn-primary btn-gold" />
          <p className="m-0 text-sm text-ivory/60">AI o‘quv simulyatsiyasi</p>
        </div>
      </div>
    )
  }
}
