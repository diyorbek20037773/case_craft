// Kanvas: HDRI yorug'lik + quyosh (deraza orqali) + yuz uchun yumshoq "key" nur + shift chiroqlari, soyalar, postprocessing.
// Sifat darajalari: 2 — kuchli noutbuk (N8AO, bloom, SMAA, 2048 soya, haqiqiy shisha), 1 — o'rta (noutbukda boshlang'ich),
// 0 — telefon/sekin (AO yo'q).
// PerformanceMonitor FPS tushsa darajani pasaytiradi.
import { Environment, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { Suspense, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { PLACEMENT, type SeatedRole } from './characters/cast'
import { Cast } from './characters/CourtCast'
import { court } from './characters/court'
import { director, now } from './director'
import { Hall } from './Hall'
import { debugShot, frameShot, KEY_LIGHT_POS, LAMPS, RIM_LIGHT_POS, ROOM, wideShot, witnessShots, WITNESS_POS, WITNESS_ROT_Y, type Shot } from './layout'
import { SpeakerContext, type Speaker } from './session'
import { Witness } from './Witness'

export type Tier = 0 | 1 | 2

interface SceneProps {
  mobile: boolean
  tier: Tier
  onTier: (t: Tier) => void
  /** ?tier=N — sifat qotirilgan (o'lchash uchun), PerformanceMonitor o'chiq */
  lockTier: boolean
  debug: boolean
  /** Joriy bosqich nomi (zal ekranida) */
  stageName?: string
}

/**
 * FPS ga qarab sifatni moslash. Yuklanish va shader kompilyatsiyasi paytidagi qotishlar hisobga olinmasin deb
 * Suspense ichida (hamma narsa yuklangandan keyin) va 4 s kechikish bilan ishga tushadi.
 */
function AdaptiveQuality({ tier, maxTier, onTier }: { tier: Tier; maxTier: Tier; onTier: (t: Tier) => void }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setArmed(true), 4000)
    return () => window.clearTimeout(id)
  }, [])
  if (!armed) return null
  return (
    <PerformanceMonitor
      ms={400}
      iterations={8}
      bounds={(refresh) => (refresh > 90 ? [50, 80] : [38, 55])}
      flipflops={2}
      onDecline={() => onTier(Math.max(0, tier - 1) as Tier)}
      onIncline={() => onTier(Math.min(maxTier, tier + 1) as Tier)}
      onFallback={() => onTier(0)}
    />
  )
}

export function Scene({ mobile, tier, onTier, lockTier, debug, stageName = '' }: SceneProps) {
  // Noutbuk iGPU da sahna to'ldirish tezligiga (fill-rate) bog'liq: piksel zichligi asosiy dastak
  const dpr: [number, number] = tier === 2 ? [1, 1.5] : tier === 1 ? [0.85, 0.85] : mobile ? [0.9, 1.25] : [0.75, 0.75]
  return (
    <Canvas
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={dpr}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 46, near: 0.05, far: 40, position: [4.3, 2.3, 3.7] }}
      onCreated={(state) => {
        state.gl.toneMapping = THREE.NoToneMapping
        if (debug) Object.assign(window, { __three: state, __director: director, __court: court })
      }}
    >
      <color attach="background" args={['#1a1410']} />
      <Suspense fallback={null}>
        {!lockTier && <AdaptiveQuality tier={tier} maxTier={mobile ? 1 : 2} onTier={onTier} />}
        <Environment files={mobile ? '/env/old_hall_1k.hdr' : '/env/church_meeting_room_1k.hdr'} environmentIntensity={0.42} />
        <Lights tier={tier} />
        <Hall mobile={mobile} tier={tier} stageName={stageName} />
        <Witness mobile={mobile} position={WITNESS_POS} rotationY={WITNESS_ROT_Y} debug={debug} />
        <Cast mobile={mobile} debug={debug} />
        <Warmup />
      </Suspense>
      <CameraRig />
      <Effects tier={tier} />
    </Canvas>
  )
}

/**
 * Yuklangandan keyin barcha tekstura va shaderlarni oldindan GPU ga yuklaydi. Aks holda kadrdan tashqaridagi personaj
 * (masalan kabinadagi sudlanuvchi) birinchi marta kadrga kirganda tekstura yuklanishi/shader kompilyatsiyasi sekin
 * kompyuterda kadrni ~3 s qotirardi — kamera kesmasi kechikib ko'rinardi.
 */
function Warmup() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    const id = window.setTimeout(() => {
      const seen = new Set<THREE.Texture>()
      scene.traverse((o) => {
        const mats = (o as THREE.Mesh).material
        if (!mats) return
        for (const m of Array.isArray(mats) ? mats : [mats]) {
          for (const v of Object.values(m)) {
            if (v instanceof THREE.Texture && !seen.has(v)) {
              seen.add(v)
              gl.initTexture(v)
            }
          }
        }
      })
      void gl.compileAsync(scene, camera).catch(() => {})
    }, 300)
    return () => window.clearTimeout(id)
  }, [gl, scene, camera])
  return null
}

function Lights({ tier }: { tier: Tier }) {
  const sun = useRef<THREE.DirectionalLight>(null)
  const key = useRef<THREE.SpotLight>(null)
  const judgeKey = useRef<THREE.SpotLight>(null)
  const scene = useThree((s) => s.scene)
  const shadowSize = tier === 2 ? 2048 : 1024
  const gl = useThree((s) => s.gl)
  // Soya xaritalari har 2-kadrda yangilanadi (personajlar sekin harakatlanadi — farqi ko'rinmaydi, ~15% tejaladi)
  const frame = useRef(0)
  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    return () => {
      gl.shadowMap.autoUpdate = true
    }
  }, [gl])
  useFrame(() => {
    if (frame.current++ % 2 === 0) gl.shadowMap.needsUpdate = true
  })
  useEffect(() => {
    // nishonlar sahnada bo'lishi kerak (matritsalari yangilansin)
    const s = sun.current
    const k = key.current
    const j = judgeKey.current
    if (s) {
      s.target.position.set(0.3, 0, 1.2)
      scene.add(s.target)
    }
    if (k) {
      k.target.position.set(WITNESS_POS.x, 1.45, WITNESS_POS.z)
      scene.add(k.target)
    }
    if (j) {
      j.target.position.copy(PLACEMENT.judge.head).setY(PLACEMENT.judge.head.y - 0.3)
      scene.add(j.target)
    }
    return () => {
      if (s) scene.remove(s.target)
      if (k) scene.remove(k.target)
      if (j) scene.remove(j.target)
    }
  }, [scene])
  return (
    <>
      {/* Quyosh: chap devordagi derazalardan iliq nur, devor soyasi bilan pol/stolga yorug' dog'lar tushadi */}
      <directionalLight
        ref={sun}
        position={[-11, 7.2, -0.3]}
        color="#ffdcb0"
        intensity={5.2}
        castShadow
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-radius={tier === 2 ? 4 : 2}
        shadow-camera-left={-7.5}
        shadow-camera-right={7.5}
        shadow-camera-top={6.5}
        shadow-camera-bottom={-6.5}
        shadow-camera-near={2}
        shadow-camera-far={26}
      />
      {/* Yuz uchun "key" nur: guvohning o'ng-oldidan (kamera tomoni) yuqoridan, yumshoq konus (layout.ts) */}
      <spotLight
        ref={key}
        position={KEY_LIGHT_POS.toArray()}
        color="#ffe9d2"
        intensity={34}
        angle={0.42}
        penumbra={0.85}
        decay={2}
        distance={12}
        castShadow={tier === 2}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.02}
      />
      {/* Raislik qiluvchiga yumshoq old nur (yuz va mantiya ko'rinsin) */}
      <spotLight ref={judgeKey} position={[1.4, 3.7, 0.4]} color="#ffe6c8" intensity={16} angle={0.4} penumbra={0.9} decay={2} distance={9} />
      {/* Orqa-chapdan sovuqroq kontur nur (personajni fondan ajratadi) */}
      <pointLight position={RIM_LIGHT_POS.toArray()} color="#cfe0ff" intensity={4} distance={6} decay={2} />
      {/* Shift chiroqlari: har birining tagida haqiqiy nur manbai (telefonda kamroq) */}
      {LAMPS.slice(0, tier === 2 ? 3 : tier === 1 ? 2 : 1).map(([x, z]) => (
        <pointLight key={`${x},${z}`} position={[x, ROOM.height - 0.4, z]} color="#ffd6a3" intensity={tier === 0 ? 5 : 3.6} distance={8} decay={2} />
      ))}
      <hemisphereLight args={['#fff1de', '#3a2618', 0.25]} />
    </>
  )
}

function Effects({ tier }: { tier: Tier }) {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {tier >= 1 ? (
        <N8AO aoRadius={0.6} distanceFalloff={1} intensity={tier === 2 ? 2.2 : 1.6} quality={tier === 2 ? 'low' : 'performance'} halfRes />
      ) : (
        <></>
      )}
      <Bloom mipmapBlur intensity={tier === 0 ? 0.25 : 0.4} luminanceThreshold={0.95} luminanceSmoothing={0.2} />
      <HueSaturation saturation={0.06} />
      <BrightnessContrast brightness={0.0} contrast={0.06} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.32} darkness={0.55} />
      <SMAA />
    </EffectComposer>
  )
}

/**
 * Personaj kadrlari: himoyachi stoli tomonidan, har qanday ekran nisbatida personaj kadrga sig'adi (frameShot).
 * `head` — boshning haqiqiy joyi (court.heads, Head suyagidan); yuklanmaguncha PLACEMENT dagi taxmin.
 * Sudya: yuz va stol ustidagi qo'llar to'liq (yuz ~ suyak + 8 sm, qo'llar ~ yuzdan 55 sm pastda); gorizontal ekranda
 * kadr kengroq va subyekt biroz chapga — o'ngdagi panel qo'lni, chapdagi bayonnoma yelkani yopmasin.
 */
const UP = new THREE.Vector3(0, 1, 0)
const ROLE_FROM: Record<SeatedRole, THREE.Vector3> = {
  judge: new THREE.Vector3(2.7, 1.55, 1.4),
  prosecutor: new THREE.Vector3(1.6, 1.45, 3.7),
  clerk: new THREE.Vector3(1.2, 1.5, 1.0),
  // old shisha devori orqali, ustunlar orasidan (telefonda ham guvoh chizig'iga tushmaydi)
  defendant: new THREE.Vector3(3.35, 1.5, 1.5),
}
const _subj = new THREE.Vector3()
const _side = new THREE.Vector3()

function roleShot(r: SeatedRole, aspect: number, out: Shot): Shot {
  const portrait = aspect < 0.85
  const lift = portrait ? 0.3 : 0.1
  const live = court.heads[r]
  // suyak bo'lsa: yuz markazi suyakdan ~8 sm yuqorida; taxminiy PLACEMENT.head allaqachon yuz balandligida
  const face = live ? _subj.copy(live).setY(live.y + 0.08) : _subj.copy(PLACEMENT[r].head)
  const from = ROLE_FROM[r]
  let shot: Shot
  if (r === 'judge') {
    face.y -= 0.24
    shot = portrait ? frameShot(face, from, 0.52, 0.5, 34, aspect, lift) : frameShot(face, from, 0.95, 0.5, 32, aspect, lift)
    if (!portrait) {
      // nishon kamera o'ng tomoniga 9 sm — sudya kadrda biroz chapda (o'ng-pastdagi panel ochiq zonasi markazi)
      _side.copy(shot.target).sub(shot.pos).cross(UP).normalize()
      shot.target.addScaledVector(_side, 0.09)
    }
  } else if (r === 'defendant') {
    face.y -= 0.22
    shot = frameShot(face, from, portrait ? 0.55 : 0.95, 0.68, 30, aspect, lift)
  } else {
    face.y -= 0.22
    shot = frameShot(face, from, 0.6, 0.42, 32, aspect, lift)
  }
  out.pos.copy(shot.pos)
  out.target.copy(shot.target)
  out.fov = shot.fov
  return out
}

/**
 * Kamera: talaba-himoyachi ko'zi. Avto rejimda gapirayotgan personajga silliq o'tadi (guvoh: tinglash/javob kadrlari),
 * hech kim gapirmasa — umumiy kadr. TopBar/CameraPicker: 'wide' — umumiy, 'close' — tanlangan (court.focus) yoki
 * gapirayotgan personaj.
 */
function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const aspect = size.width / Math.max(1, size.height)
  const speaker = useContext(SpeakerContext)
  const speakerRef = useRef<Speaker | null>(speaker)
  useEffect(() => {
    speakerRef.current = speaker
    if (speaker) {
      court.lastSpeaker = speaker
      court.lastSpeakerAt = now()
    }
  }, [speaker])
  const S = useMemo(() => ({ wide: wideShot(aspect), witness: witnessShots(aspect) }), [aspect])
  const st = useRef({ pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50, init: false, subject: '' })
  const want = useMemo(() => ({ pos: new THREE.Vector3(), target: new THREE.Vector3() }), [])
  const roleBuf = useMemo<Shot>(() => ({ pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 32 }), [])
  const fixed = useMemo(() => debugShot(new URLSearchParams(window.location.search).get('view')), [])

  useFrame((state, rawDt) => {
    if (director.camera === 'free') return
    if (fixed) {
      camera.position.copy(fixed.pos)
      camera.lookAt(fixed.target)
      if (camera.fov !== fixed.fov) {
        camera.fov = fixed.fov
        camera.updateProjectionMatrix()
      }
      return
    }
    // sekin kompyuterda ham o'tish devor vaqti bo'yicha bo'lsin (0,1 s cheklov 5 fps da o'tishni 2 barobar cho'zardi)
    const dt = Math.min(rawDt, 0.25)
    const s = st.current
    const t = state.clock.elapsedTime
    const tNow = now()
    const phase = director.phase
    const who = speakerRef.current
    if (who) court.lastSpeakerAt = tNow
    // gap tugagach kamera darhol qaytib ketmasin (navbatdagi gapiruvchi odatda ~0,5 s ichida)
    const recent = court.lastSpeaker && tNow - court.lastSpeakerAt < 2.5 ? court.lastSpeaker : null

    const shotFor = (r: Speaker): Shot => (r === 'witness' ? (phase === 'answer' ? S.witness.close : S.witness.listen) : roleShot(r, aspect, roleBuf))
    let shot: Shot
    let subject: string
    // court.cue (GuvohApp): qoidabuzarlik/qaror/yopilish — sudya; navbatdagi gapiruvchi — ovozi yuklanmasdan oldin
    const auto = court.cue ?? who
    if (director.camera === 'wide') {
      shot = S.wide
      subject = 'wide'
    } else if (director.camera === 'close') {
      subject = court.focus ?? auto ?? recent ?? 'witness'
      shot = shotFor(subject as Speaker)
    } else if (auto) {
      subject = auto
      shot = shotFor(auto)
    } else if (phase === 'listen' || phase === 'think') {
      subject = 'witness'
      shot = S.witness.listen
    } else if (phase === 'answer') {
      subject = 'witness'
      shot = S.witness.close
    } else if (recent) {
      subject = recent
      shot = shotFor(recent)
    } else {
      subject = 'wide'
      shot = S.wide
    }

    // yangi kadrga o'tish ~1,5–2 s (silliq), so'ng kadr ichida sekin suzish
    const lambda = 1.7
    want.pos.copy(shot.pos)
    want.target.copy(shot.target)
    // sekin dolly: tinglashda kamera asta yaqinlashadi
    if (shot === S.witness.listen && (phase === 'listen' || phase === 'think')) {
      const k = Math.min(1, (tNow - director.phaseStart) / 6)
      want.pos.lerp(want.target, 0.06 * k)
    }
    // "qo'lda" yengil suzish
    want.pos.x += Math.sin(t * 0.21) * 0.03
    want.pos.y += Math.sin(t * 0.17 + 1.3) * 0.012
    // Keskin o'tish (kesma): sudyaga (to'xtatish, qaror, yopilish) — darhol, oraliq "devor/bayroq" kadrlarisiz;
    // shisha kabinaga va undan, uzoq ko'chishlar (> 3,5 m) ham kesma. Qolganlari — silliq
    const cut =
      s.init &&
      subject !== s.subject &&
      (subject === 'judge' || subject === 'defendant' || s.subject === 'defendant' || s.pos.distanceTo(want.pos) > 3.5)
    s.subject = subject
    if (!s.init || cut) {
      s.pos.copy(want.pos)
      s.target.copy(want.target)
      s.fov = shot.fov
      s.init = true
    }
    s.pos.x = THREE.MathUtils.damp(s.pos.x, want.pos.x, lambda, dt)
    s.pos.y = THREE.MathUtils.damp(s.pos.y, want.pos.y, lambda, dt)
    s.pos.z = THREE.MathUtils.damp(s.pos.z, want.pos.z, lambda, dt)
    s.target.x = THREE.MathUtils.damp(s.target.x, want.target.x, lambda * 1.25, dt)
    s.target.y = THREE.MathUtils.damp(s.target.y, want.target.y, lambda * 1.25, dt)
    s.target.z = THREE.MathUtils.damp(s.target.z, want.target.z, lambda * 1.25, dt)
    s.fov = THREE.MathUtils.damp(s.fov, shot.fov, lambda, dt)
    camera.position.copy(s.pos)
    camera.lookAt(s.target)
    if (Math.abs(camera.fov - s.fov) > 1e-3) {
      camera.fov = s.fov
      camera.updateProjectionMatrix()
    }
  })
  return null
}
