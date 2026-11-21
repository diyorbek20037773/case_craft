// Kirish 3D foni: butun ekran, fixed, z-index 0 (interfeys IntroApp da ustida).
// Iliq yong'oq-oltin sud zali (bra chiroqlar, navy gilam), 5 personaj yarim doirada, shiftdan nur ustunlari.
// Sifat: dpr [1, 1.5]; PerformanceMonitor FPS tushsa actions.setQuality('low') — mobil tekstura/model,
// postprocessing yo'q, kam chiroq. Kichik ekranda ham "lite" (mobil asset).
import { Environment, PerformanceMonitor, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { Suspense, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { ROLES } from '../config'
import { actions, getState, useIntro } from '../state'
import { characterUrl, propUrl } from './assets'
import { ModelBoundary } from './Boundary'
import { CameraRig } from './CameraRig'
import { Characters } from './Characters'
import { Emblem } from './Emblem'
import { isPortrait, makeSlots } from './layout'
import { Lights } from './Lights'
import { advanceTime } from './live'
import { Furniture, Room } from './Room'

const BG = '#04060b'

// ---------- LD4: personaj va jihoz GLB lari modul yuklanishi bilan yuklana boshlaydi ----------
// (Characters avval HEAD tekshiruvini kutadi — preload shu vaqtni yutadi). Kichik ekranda mobil variantlar.
// MOBILE_ASSETS sessiyada BIR MARTA aniqlanadi va Characters/Furniture/Room ham aynan shuni ishlatadi:
//  - preload URL lari doim haqiqiy yuklanadiganlar bilan mos (ikki marta yuklash yo'q);
//  - oyna o'lchami o'zgarsa (devtools ochilsa) yoki sifat 'low' ga tushsa modellar/teksturalar qayta yuklanmaydi —
//    sekin kompyuterda bu ko'p soniyalik qotish edi. Sifat pasayishi faqat effektlarni (lite) kamaytiradi.
const MOBILE_ASSETS = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 600
if (typeof window !== 'undefined') {
  for (const r of ROLES) useGLTF.preload(characterUrl(r.model, MOBILE_ASSETS), false, true)
  for (const p of ['sudya-stoli', 'prokuror-stoli', 'himoyachi-stoli']) useGLTF.preload(propUrl(p, MOBILE_ASSETS), false, true)
}

/** Sahna soati (live.time) — hamma useFrame dan oldin (priority -1: avtomatik render o'chmaydi) */
function SceneClock() {
  useFrame((_, dt) => advanceTime(dt), -1)
  return null
}

/** Hamma personaj yuklangach bir marta shaderlarni oldindan kompilyatsiya qilish — keyingi faza almashuvida qotmasin */
function WarmUp({ onDone }: { onDone: () => void }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const loaded = useIntro((s) => s.loadedFigures)
  const done = useRef(false)
  useEffect(() => {
    if (done.current || loaded < ROLES.length) return
    // bitta kadr kutamiz: oxirgi figura sahnaga qo'shilib, materiallari tayyor bo'lsin
    const id = requestAnimationFrame(() => {
      if (done.current) return
      done.current = true
      // compileAsync — KHR_parallel_shader_compile bilan asosiy oqimni bloklamaydi; yo'q bo'lsa oddiy compile
      try {
        if (typeof gl.compileAsync === 'function') gl.compileAsync(scene, camera).then(onDone, onDone)
        else {
          gl.compile(scene, camera)
          onDone()
        }
      } catch {
        onDone()
      }
    })
    return () => cancelAnimationFrame(id)
  }, [loaded, gl, scene, camera, onDone])
  return null
}

/**
 * Yuklanish/shader kompilyatsiyasidagi qotishlar hisoblanmasin: shaderlar tayyor bo'lgach (WarmUp) 2,5 s dan keyin
 * yoqiladi (WarmUp kelmasa ham 15 s da). Faqat pasaytiradi ('low' dan qaytmaydi — tebranish/thrash yo'q).
 */
function AdaptiveQuality({ warm }: { warm: boolean }) {
  const quality = useIntro((s) => s.quality)
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setArmed(true), 15000)
    return () => window.clearTimeout(id)
  }, [])
  useEffect(() => {
    if (!warm) return
    const id = window.setTimeout(() => setArmed(true), 2500)
    return () => window.clearTimeout(id)
  }, [warm])
  if (!armed || quality === 'low') return null
  return (
    <PerformanceMonitor
      ms={400}
      iterations={8}
      bounds={(refresh) => (refresh > 90 ? [50, 80] : [36, 55])}
      onDecline={() => actions.setQuality('low')}
      onFallback={() => actions.setQuality('low')}
    />
  )
}

/** lite o'zgarganda (high->low) yangi teksturalar yuklanguncha eskisi ko'rinib tursin */
function useTransitioned<T>(v: T) {
  const [x, setX] = useState(v)
  useEffect(() => {
    if (x !== v) startTransition(() => setX(v))
  }, [v, x])
  return x
}

function SceneContent() {
  const size = useThree((s) => s.size)
  const portrait = isPortrait(size.width, size.height)
  const quality = useIntro((s) => s.quality)
  // lite — effektlar (postprocessing, chang, chiroqlar soni, normal xaritalar); assetlar MOBILE_ASSETS bo'yicha
  const lite = useTransitioned(quality === 'low' || MOBILE_ASSETS)
  const slots = useMemo(() => makeSlots(portrait), [portrait])
  const [warm, setWarm] = useState(false)
  const onWarm = useCallback(() => setWarm(true), [])

  return (
    <>
      <SceneClock />
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 9, 24]} />
      {/* HDR/tekstura yuklanmasa butun sahna (SceneBoundary) o'chmasin — faqat shu qism tushib qoladi */}
      <ModelBoundary fallback={null} label="/env/old_hall_1k.hdr">
        <Suspense fallback={null}>
          {/* 0.22 — iliqroq zal (avval 0.14); fazaga qarab Lights damp bilan boshqaradi */}
          <Environment files="/env/old_hall_1k.hdr" environmentIntensity={0.22} />
        </Suspense>
      </ModelBoundary>
      <Lights slots={slots} lite={lite} />
      <ModelBoundary fallback={null} label="room-textures">
        <Suspense fallback={null}>
          <Room lite={lite} mobile={MOBILE_ASSETS} />
        </Suspense>
      </ModelBoundary>
      <Furniture mobile={MOBILE_ASSETS} />
      <Characters slots={slots} lite={lite} mobile={MOBILE_ASSETS} />
      <Emblem />
      <CameraRig slots={slots} />
      <AdaptiveQuality warm={warm} />
      <WarmUp onDone={onWarm} />
      {!lite && (
        <EffectComposer multisampling={2} enableNormalPass={false}>
          <Bloom mipmapBlur intensity={0.55} luminanceThreshold={0.9} luminanceSmoothing={0.25} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <Vignette offset={0.28} darkness={0.62} />
        </EffectComposer>
      )}
    </>
  )
}

/**
 * Sahna kadrdan chiqqanda (sahifa pastdagi ma'lumot bo'limlariga aylantirilgan) uzluksiz render to'xtaydi —
 * bo'limlar 72–92% qoplamali, ortidagi oxirgi kadr qotib turadi; sekin kompyuterda aylantirish silliq bo'ladi.
 * 'demand': o'lcham o'zgarsa R3F baribir bitta kadr chizadi (qora kanvas bo'lmaydi). Animatsiyalar live.time ga
 * bog'langan, shuning uchun R3F soatining nolga qaytishi kamerani sakratmaydi.
 */
function useOffscreen() {
  const [off, setOff] = useState(false)
  useEffect(() => {
    let raf = 0
    const check = () => {
      raf = 0
      setOff(window.scrollY > window.innerHeight * 0.9)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check)
    }
    check()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
  return off
}

export function IntroCanvas() {
  const quality = useIntro((s) => s.quality)
  const off = useOffscreen()
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: BG }}>
      <Canvas
        // sifat 'low': piksel zichligi 1 — sekin GPU da eng katta yutuq (1.5 ga nisbatan ~2,25× kam piksel)
        dpr={quality === 'low' ? 1 : [1, 1.5]}
        frameloop={off ? 'demand' : 'always'}
        gl={{ antialias: true, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 46, near: 0.05, far: 40, position: [0, 2.15, 10.4] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.0
        }}
        onPointerMissed={() => {
          const s = getState()
          if (s.phase === 'select' && s.selected) actions.select(null)
        }}
      >
        <SceneContent />
      </Canvas>
    </div>
  )
}
