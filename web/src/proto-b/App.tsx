import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { AUDIO, PANO, ROLES, THINK_SPEAK_AT, WIDE, type Role, type WideId } from './assets'
import { Speech } from './audio'
import { Panorama } from './pano'
import { PortraitStage } from './portrait'

type Shot = { kind: 'pano' } | { kind: 'film' } | { kind: 'wide'; id: WideId } | { kind: 'portrait'; role: Role }
type Sub = { speaker: string; text: string; live: boolean } | null
type Lower = { name: string; role: string } | null
type Phase = 'loading' | 'intro' | 'film' | 'idle' | 'running' | 'error'

const LINES = {
  prompt: { speaker: 'Raislik qiluvchi', text: 'Himoyachi, guvohga savol berishingiz mumkin.' },
  savol: { speaker: 'Himoyachi (siz)', text: 'Siz uning yuzini ko‘rdingizmi?' },
  javob: { speaker: 'Guvoh', text: 'Yo‘q. Men uning yuzini ko‘rmadim. Faqat kulrang kiyimini ko‘rdim.' },
  sudya: { speaker: 'Raislik qiluvchi', text: 'Javob bayonnomaga kiritilsin. Himoyachi, keyingi savolingizni bering.' },
}

const params = new URLSearchParams(location.search)
const num = (k: string) => (params.has(k) ? Number(params.get(k)) : null)
const DEBUG = {
  debug: params.get('debug') === '1',
  jaw: num('jaw'),
  blink: num('blink'),
}
const DEBUG_ROLE = (ROLES as string[]).includes(params.get('role') ?? '') ? (params.get('role') as Role) : null
const SKIP_INTRO = params.get('skip') === '1' || !!DEBUG_ROLE
// ?hold=1 — 360° kirish avtomatik o'tmaydi (namoyish/skrinshot uchun), "Zalga kirish" bosilguncha
const HOLD_INTRO = params.get('hold') === '1'

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))

function makeNoise(): string {
  const c = document.createElement('canvas')
  c.width = c.height = 192
  const g = c.getContext('2d')
  if (!g) return ''
  const img = g.createImageData(192, 192)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v
    img.data[i + 3] = 255
  }
  g.putImageData(img, 0, 0)
  return c.toDataURL('image/png')
}

export default function App() {
  const panoBox = useRef<HTMLDivElement>(null)
  const portraitBox = useRef<HTMLDivElement>(null)
  const film = useRef<HTMLVideoElement>(null)
  const pano = useRef<Panorama | null>(null)
  const stage = useRef<PortraitStage | null>(null)
  const [speech] = useState(() => new Speech())
  const runId = useRef(0)

  const [phase, setPhase] = useState<Phase>('loading')
  const [shot, setShot] = useState<Shot>({ kind: 'pano' })
  const [cut, setCut] = useState(0)
  const [sub, setSub] = useState<Sub>(null)
  const [lower, setLower] = useState<Lower>(null)
  const [loadPct, setLoadPct] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [gyro, setGyro] = useState<'off' | 'on' | 'denied'>('off')
  const [panoReturn, setPanoReturn] = useState(false)
  const [noise] = useState(makeNoise)
  const canGyro =
    typeof window !== 'undefined' && 'DeviceOrientationEvent' in window && matchMedia('(pointer: coarse)').matches

  const goShot = useCallback((s: Shot) => {
    setShot(s)
    setCut((c) => c + 1)
  }, [])

  // --- ishga tushirish: assetlarni yuklash ---
  useEffect(() => {
    const pc = panoBox.current
    const box = portraitBox.current
    if (!pc || !box) return
    let alive = true
    const p = new Panorama(pc)
    pano.current = p
    const st = new PortraitStage(box, DEBUG)
    st.amplitude = () => speech.amplitude()
    stage.current = st

    let done = 0
    const total = 4
    const tick = () => alive && setLoadPct(Math.round((++done / total) * 100))
    const img = (src: string) =>
      new Promise<void>((res, rej) => {
        const i = new Image()
        i.onload = () => res()
        i.onerror = () => rej(new Error(src))
        i.src = src
      })

    const panoP = p.load(PANO.small, PANO.large).then(tick, () => {
      tick()
      if (alive) setNotice('360° panorama yuklanmadi — to‘g‘ridan keng kadrga o‘tdik.')
      return 'fail' as const
    })
    const rest = Promise.all([
      img(WIDE.majlis.src).then(tick),
      st.preload('guvoh').then(tick),
      st.preload('sudya').then(tick),
    ])

    if (DEBUG_ROLE) {
      void st.show(DEBUG_ROLE, 'listen').then(() => {
        if (!alive) return
        setPhase('idle')
        goShot({ kind: 'portrait', role: DEBUG_ROLE })
      })
      return () => {
        alive = false
        p.dispose()
        st.dispose()
      }
    }

    panoP.then((r) => {
      if (!alive) return
      if (r === 'fail' || SKIP_INTRO) return
      p.start()
      setPhase((ph) => (ph === 'loading' ? 'intro' : ph))
    })
    Promise.all([panoP, rest]).then(
      ([r]) => {
        if (!alive) return
        if (r === 'fail' || SKIP_INTRO) {
          setPhase('idle')
          goShot({ kind: 'wide', id: 'majlis' })
          setSub({ ...LINES.prompt, live: false })
        }
      },
      (e: unknown) => {
        if (!alive) return
        setError(`Rasmlar yuklanmadi (${e instanceof Error ? e.message.split('/').pop() : 'tarmoq'}).`)
        setPhase('error')
      },
    )
    return () => {
      alive = false
      p.dispose()
      st.dispose()
    }
  }, [goShot, speech])

  // --- kirish: 360° → (bo'sh zalga dolly-in video, bo'lsa) → odamlar o'tirgan keng kadr ---
  const phaseRef = useRef<Phase>(phase)
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const toSession = useCallback(() => {
    const ph = phaseRef.current
    if (ph !== 'intro' && ph !== 'film') return
    phaseRef.current = 'idle'
    setPhase('idle')
    goShot({ kind: 'wide', id: 'majlis' })
    setLower(null)
    setSub({ ...LINES.prompt, live: false })
    window.setTimeout(() => film.current?.pause(), 700)
  }, [goShot])

  const leaveIntro = useCallback(() => {
    if (phaseRef.current !== 'intro') return
    window.setTimeout(() => pano.current?.stop(), 900)
    const v = film.current
    if (!PANO.introVideo || !v) {
      toSession()
      return
    }
    phaseRef.current = 'film'
    setPhase('film')
    v.currentTime = 0
    void v.play().catch(() => toSession())
    goShot({ kind: 'film' })
    window.setTimeout(toSession, 3600)
  }, [goShot, toSession])

  useEffect(() => {
    if (phase !== 'intro' || HOLD_INTRO) return
    const t0 = performance.now()
    const id = window.setInterval(() => {
      const el = performance.now() - t0
      const busy = pano.current?.interacting ?? false
      if ((el > 4800 && !busy) || el > 12000) leaveIntro()
    }, 200)
    return () => window.clearInterval(id)
  }, [phase, leaveIntro])

  // portret qatlami ko'rinmayotganda render to'xtaydi (batareya)
  useEffect(() => {
    if (shot.kind === 'portrait') return
    const id = window.setTimeout(() => stage.current?.stop(), 400)
    return () => window.clearTimeout(id)
  }, [shot])

  // --- ssenariy ---
  const run = useCallback(async () => {
    const st = stage.current
    if (!st) return
    const my = ++runId.current
    const alive = () => runId.current === my
    const sp = speech
    sp.unlock()
    setPhase('running')
    setNotice(null)
    setPanoReturn(false)
    pano.current?.stop()

    // 1) savol — himoyachi o'rnidan keng kadr, kamera guvohga suriladi
    goShot({ kind: 'wide', id: 'majlis-guvoh' })
    setLower(null)
    setSub({ ...LINES.savol, live: true })
    const q = sp.speak(AUDIO.savol, LINES.savol.text)
    await wait(950)
    if (!alive()) return
    // 2) guvohning reaksiyasi: savolni tinglayapti
    await st.show('guvoh', 'listen')
    if (!alive()) return
    goShot({ kind: 'portrait', role: 'guvoh' })
    setLower({ name: 'Guvoh', role: 'Ko‘rsatma beruvchi shaxs' })
    await q.done
    if (!alive()) return
    // 3) o'ylaydi: think video bo'lsa — kameraga qaraydi, bosh chayqaydi (~3 s); bo'lmasa 0,8 s pauza
    const thinkDur = st.setMode('think')
    await wait(thinkDur > 0 ? Math.min(thinkDur, THINK_SPEAK_AT) * 1000 : 800)
    if (!alive()) return
    // 4) javob (think video oxirigacha o'ynab, keyin gapirish sikliga o'tadi)
    setSub({ ...LINES.javob, live: true })
    st.setMode('talk')
    const a = sp.speak(AUDIO.javob, LINES.javob.text)
    await a.done
    if (!alive()) return
    st.setMode('listen')
    await wait(550)
    if (!alive()) return
    // 5) keng kadr
    goShot({ kind: 'wide', id: 'majlis-sudya' })
    setLower(null)
    await wait(1400)
    if (!alive()) return
    // 6) raislik qiluvchi
    await st.show('sudya', 'listen')
    if (!alive()) return
    goShot({ kind: 'portrait', role: 'sudya' })
    setLower({ name: 'Raislik qiluvchi', role: 'Sudya' })
    await wait(450)
    if (!alive()) return
    setSub({ ...LINES.sudya, live: true })
    st.setMode('talk')
    const j = sp.speak(AUDIO.sudya, LINES.sudya.text)
    await j.done
    if (!alive()) return
    st.setMode('listen')
    await wait(700)
    if (!alive()) return
    goShot({ kind: 'wide', id: 'majlis' })
    setLower(null)
    setSub({ speaker: 'Raislik qiluvchi', text: 'Himoyachi, savolingizni berishingiz mumkin.', live: false })
    if (sp.usedSynth) setNotice('Ovoz ijro etilmadi — og‘iz harakati sintetik ritmda ko‘rsatildi.')
    setPhase('idle')
  }, [goShot, speech])

  const toggle360 = useCallback(() => {
    const p = pano.current
    if (!p) return
    if (shot.kind === 'pano') {
      p.stop()
      setPanoReturn(false)
      goShot({ kind: 'wide', id: 'majlis' })
    } else {
      p.start()
      setPanoReturn(true)
      goShot({ kind: 'pano' })
    }
  }, [shot, goShot])

  const askGyro = useCallback(async () => {
    speech.unlock()
    const ok = (await pano.current?.enableGyro()) ?? false
    setGyro(ok ? 'on' : 'denied')
  }, [speech])

  const showIntroCard = (phase === 'intro' || phase === 'loading') && shot.kind === 'pano'
  const isWide = (id: WideId) => shot.kind === 'wide' && shot.id === id

  return (
    <div className="pb-root">
      <div className="pb-stage">
        <div
          ref={panoBox}
          className={`pb-layer pb-pano ${shot.kind === 'pano' ? 'on' : ''}`}
          role="img"
          aria-label="Sud zali, 360 daraja ko'rinish"
        />
        {(Object.keys(WIDE) as WideId[]).map((id) => (
          <img
            key={id + (isWide(id) ? cut : '')}
            src={WIDE[id].src}
            alt={WIDE[id].label}
            className={`pb-layer pb-wide ${isWide(id) ? 'on kb' : ''}`}
            style={
              {
                objectPosition: WIDE[id].focus,
                transformOrigin: WIDE[id].focus,
                '--kb-from': WIDE[id].from,
                '--kb-to': WIDE[id].to,
              } as CSSProperties
            }
            draggable={false}
          />
        ))}
        {PANO.introVideo && (
          <video
            ref={film}
            className={`pb-layer pb-wide ${shot.kind === 'film' ? 'on' : ''}`}
            src={PANO.introVideo}
            muted
            playsInline
            preload="auto"
            aria-label="Bo'sh sud zali"
          />
        )}
        <div ref={portraitBox} className={`pb-layer pb-portrait ${shot.kind === 'portrait' ? 'on' : ''}`} />
      </div>
      <div className="pb-vignette" />
      <div className="pb-grain" style={noise ? { backgroundImage: `url(${noise})` } : undefined} />

      <div className="pb-ui">
        <header className="pb-top">
          <span className="pb-tag">AI o&lsquo;quv simulyatsiyasi</span>
          <div className="pb-top-right">
            {shot.kind === 'pano' && canGyro && (
              <button className="pb-chip" onClick={askGyro} disabled={gyro === 'on'}>
                {gyro === 'on' ? 'Giroskop yoqilgan' : gyro === 'denied' ? 'Giroskop ruxsat berilmadi' : 'Giroskop'}
              </button>
            )}
            {phase === 'idle' && !DEBUG_ROLE && (
              <button className="pb-chip" onClick={toggle360} aria-pressed={shot.kind === 'pano'}>
                {shot.kind === 'pano' ? 'Kadrga qaytish' : '360° zal'}
              </button>
            )}
          </div>
        </header>

        {showIntroCard && (
          <div className="pb-intro">
            <p className="pb-intro-kicker">Sud majlisi zali</p>
            <h1 className="pb-intro-title">Guvohni so&lsquo;roq qilish</h1>
            {phase === 'loading' ? (
              <p className="pb-intro-hint" role="status">
                <span className="pb-spinner" aria-hidden /> Zal yuklanmoqda… {loadPct}%
              </p>
            ) : (
              <>
                <p className="pb-intro-hint">Barmoq bilan atrofga qarang</p>
                <button className="pb-link" onClick={leaveIntro}>
                  Zalga kirish
                </button>
              </>
            )}
          </div>
        )}

        {panoReturn && shot.kind === 'pano' && (
          <div className="pb-intro pb-intro-small">
            <p className="pb-intro-hint">Barmoq yoki sichqoncha bilan zalni aylantiring</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="pb-error" role="alert">
            <p>{error}</p>
            <button className="pb-primary" onClick={() => location.reload()}>
              Qayta yuklash
            </button>
          </div>
        )}

        <div className="pb-bottom">
          {lower && shot.kind === 'portrait' && (
            <div className="pb-lower" key={lower.name}>
              <span className="pb-lower-name">{lower.name}</span>
              <span className="pb-lower-role">{lower.role}</span>
            </div>
          )}
          {sub && shot.kind !== 'pano' && <Subtitle key={sub.text + sub.live} sub={sub} speech={speech} />}
          {notice && <p className="pb-notice">{notice}</p>}
          {(phase === 'idle' || phase === 'running') && shot.kind !== 'pano' && !DEBUG_ROLE && (
            <div className="pb-actions">
              {phase === 'idle' && <p className="pb-ready">Tayyor savol: &laquo;{LINES.savol.text}&raquo;</p>}
              <button className="pb-primary" onClick={run} disabled={phase === 'running'}>
                {phase === 'running' ? (
                  <>
                    <span className="pb-eq" aria-hidden>
                      <i />
                      <i />
                      <i />
                    </span>
                    Sud majlisi davom etmoqda
                  </>
                ) : (
                  'Savol berish'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Subtitle({ sub, speech }: { sub: NonNullable<Sub>; speech: Speech }) {
  const words = sub.text.split(' ')
  const [shown, setShown] = useState(sub.live ? 0 : words.length)
  useEffect(() => {
    if (!sub.live) return
    let raf = 0
    let last = -1
    const loop = () => {
      // matnni ovozdan biroz oldinroq ochamiz — o'qish qulay
      const n = Math.min(words.length, Math.ceil(Math.min(1, speech.progress * 1.15 + 0.05) * words.length))
      if (n !== last) {
        last = n
        setShown(n)
      }
      if (n < words.length) raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [sub, speech, words.length])
  return (
    <div className="pb-sub" aria-live="polite">
      <span className="pb-sub-speaker">{sub.speaker}</span>
      <p className="pb-sub-text">
        {words.map((w, i) => (
          <span key={i} className={i < shown ? 'w on' : 'w'}>
            {w}{' '}
          </span>
        ))}
      </p>
    </div>
  )
}
