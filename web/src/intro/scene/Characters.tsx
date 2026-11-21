// 5 personaj: Meshy GLB (bo'lsa) yoki ataylab qilingan qorong'i siluyet (guvoh.glb geometriyasi + kontur nur).
// Fayl paydo bo'lsa (assets.ts 20 s da qayta tekshiradi) model sahifa qayta yuklanmasdan almashadi.
// Faqat tinch idle klip (idle | idle_a) — Meshy yelka nuqsoni sababli imo-ishorali kliplar ishlatilmaydi.
// Yuklanish: GLB kelguncha darhol kapsula siluyet; GLB kelganda 900 ms "paydo bo'lish" (pastdan yuqoriga kesim + oltin chiziq).
// Titulda zal bo'sh (live.show = 0): GLB'lar yuklanadi va chiziladi (kesim hammasini tashlaydi — shader oldindan
// kompilyatsiya bo'ladi), tituldan chiqqach xuddi shu kesim bilan ~0,7 s da birin-ketin paydo bo'ladi.
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Suspense, startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { ROLES, type Role, type RoleId } from '../config'
import { actions, getState, useIntro, type IntroState } from '../state'
import { reportFigure } from '../ui/loading/progressStore'
import { characterUrl, useAvailable, useModelUrl } from './assets'
import { ModelBoundary } from './Boundary'
import { benchSide, heads, makeGaze, updateGaze, weightShift } from './gaze'
import { applyPosture, fixClothMaterial, makePostureRig, restorePosture } from './posture'
import { STEP_FORWARD, type Slot } from './layout'
import { focusOf, IGNITE_STEP, isWidePhase, live, reducedMotion, SHOW_SEC, SHOW_STAGGER, wantLight, wantShow } from './live'

const IDLE_CLIPS = ['idle', 'idle_a']
const FALLBACK_MODEL = 'guvoh'
const GOLD = '#c9a45c'
const NAVY = '#0f1b33'
const DEG = Math.PI / 180
/** Tanlanganda oldinga qadam (m) — 0,3 dan oshmaydi */
const STEP = Math.min(STEP_FORWARD, 0.3)
/** Hover / tanlashda kameraga burilish chegarasi */
const TURN_HOVER = 6 * DEG
const TURN_SELECT = 10 * DEG
/** Launch: sudya stoli tomon tana burilishi (≤12°), 0,6 s, indeks×70 ms kechikish */
const TURN_LAUNCH = 12 * DEG
const LAUNCH_TURN_SEC = 0.6
const LAUNCH_STAGGER = 0.07
/** "Paydo bo'lish" davomiyligi va balandligi */
const REVEAL_SEC = 0.9
const REVEAL_H = 1.95
/** Yuklanish kapsulasi shu "borlik"dan keyin ko'rinadi (titulda yashirin) */
const CAPSULE_SHOW = 0.15

/** Har personajga turli tezlik va boshlang'ich vaqt — nafas sinxron bo'lmasin */
const BREATH: Record<RoleId, { speed: number; phase: number }> = {
  sudya: { speed: 0.86, phase: 0.13 },
  prokuror: { speed: 0.97, phase: 0.61 },
  himoyachi: { speed: 0.92, phase: 0.37 },
  guvoh: { speed: 1.04, phase: 0.82 },
  kotib: { speed: 0.9, phase: 0.05 },
}

// ---------- Yuklanish hisobi: har rol bir marta (model, siluyet yoki yakuniy kapsula) ----------
// Faza (titul ham) muhim emas — titulda figuralar yashirin, lekin hisoblanadi.
// Ikki manba: state.loadedFigures (menejer API) va globalThis dagi progressStore (dev HMR modul nusxalari
// ajralib qolsa ham yuklanish chizig'i shu orqali 5/5 ni ko'radi).
const loaded = new Set<RoleId>()
function markLoaded(id: RoleId) {
  reportFigure(id)
  if (loaded.has(id)) return
  loaded.add(id)
  if (getState().loadedFigures < ROLES.length) actions.figureLoaded()
}
/** "paydo bo'lish" bir marta: mobil<->to'liq almashganda qayta o'ynamaydi */
const revealed = new Set<RoleId>()

// ---------- Dunyo-Y kesimi (paydo bo'lish) — shader qo'shimchalari ----------
type Cut = { value: number }
const CUT_VERT = (s: string) =>
  'varying float vCutY;\n' + s.replace('#include <project_vertex>', '#include <project_vertex>\n  vCutY = (modelMatrix * vec4(transformed, 1.0)).y;')
/** below=true: kesimdan PASTDAGI qism ko'rinadi (model); false: yuqoridagi (yuklanish kapsulasi) */
function cutFrag(s: string, below: boolean, edge: boolean) {
  return (
    'uniform float uCutY;\nuniform vec3 uCutGold;\nvarying float vCutY;\n' +
    s
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n  if (vCutY ${below ? '>' : '<'} uCutY) discard;`)
      .replace(
        '#include <opaque_fragment>',
        (edge ? 'outgoingLight += uCutGold * (1.0 - smoothstep(0.0, 0.03, abs(uCutY - vCutY)));\n' : '') + '#include <opaque_fragment>',
      )
  )
}
const cutGold = { value: new THREE.Color(GOLD).multiplyScalar(2.6) }

function installReveal(mat: THREE.MeshStandardMaterial, cut: Cut) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCutY = cut
    shader.uniforms.uCutGold = cutGold
    shader.vertexShader = CUT_VERT(shader.vertexShader)
    shader.fragmentShader = cutFrag(shader.fragmentShader, true, true)
  }
  mat.customProgramCacheKey = () => 'intro-reveal'
}

// ---------- Siluyet materiali: deyarli qora + Fresnel kontur (oltin-ko'kish) ----------
const rimUniform = { value: new THREE.Color('#9fb3d9').multiplyScalar(0.55) }
function makeSilhouetteMaterial(cut?: Cut, below = false) {
  const m = new THREE.MeshStandardMaterial({ color: '#07090f', roughness: 0.75, metalness: 0, envMapIntensity: 0.2 })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = rimUniform
    let frag = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      'outgoingLight += uRim * pow(1.0 - saturate(abs(dot(normal, normalize(vViewPosition)))), 2.6);\n#include <opaque_fragment>',
    )
    if (cut) {
      shader.uniforms.uCutY = cut
      shader.uniforms.uCutGold = cutGold
      shader.vertexShader = CUT_VERT(shader.vertexShader)
      frag = cutFrag(frag, below, below)
    }
    shader.fragmentShader = 'uniform vec3 uRim;\n' + frag
  }
  m.customProgramCacheKey = () => (cut ? (below ? 'intro-silhouette-rim-cutb' : 'intro-silhouette-rim-cut') : 'intro-silhouette-rim')
  return m
}

type Tintable = { mat: THREE.MeshStandardMaterial; base: THREE.Color }

/** GLB ni klonlaydi (SkeletonUtils — skelet ham nusxalanadi), materiallarni alohida qiladi va idle klipni o'ynatadi */
function useFigure(url: string, id: RoleId, silhouette: boolean) {
  const gltf = useGLTF(url, false, true)
  const fig = useMemo(() => {
    const root = cloneSkinned(gltf.scene)
    const tint: Tintable[] = []
    // kesim doim bor: titulda yashirish / tituldan chiqqach paydo bo'lish (live.show) va yuklanish "paydo bo'lishi"
    const cut: Cut = { value: -1e4 }
    const sil = silhouette ? makeSilhouetteMaterial(cut, true) : null
    // yuklanish paydo bo'lishi (kapsula -> model): faqat haqiqiy model, birinchi marta
    const playReveal = !silhouette && !reducedMotion && !revealed.has(id)
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      // bind-poza bounding sphere bo'yicha kesilib, qo'l/bosh yo'qolmasin
      m.frustumCulled = false
      m.raycast = () => null // bosish — ko'rinmas kapsula orqali (skinned raycast qimmat)
      if (sil) {
        m.material = sil
        return
      }
      const src = m.material as THREE.MeshStandardMaterial
      if (src?.isMeshStandardMaterial) {
        const mat = src.clone()
        mat.side = THREE.DoubleSide // Meshy choklarida teskari yuzlar
        fixClothMaterial(mat) // metalness xaritasi kiyimda mis rangli chiziqlar berardi
        mat.envMapIntensity = 0.7
        installReveal(mat, cut)
        m.material = mat
        tint.push({ mat, base: mat.color.clone() })
      }
    })
    // Balandlik tekshiruvi: Meshy real o'lchamda (~1,7 m) keladi; boshqacha bo'lsa moslanadi
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const h = box.max.y - box.min.y
    if (Number.isFinite(h) && h > 0 && (h < 1.3 || h > 2.2)) root.scale.setScalar(1.75 / h)
    // qomat qatlami (posture.ts) — bind pozada yasaladi
    const posture = makePostureRig(root, id)
    return { root, tint, sil, posture, cut, playReveal }
  }, [gltf.scene, silhouette, id])

  const mixer = useMemo(() => new THREE.AnimationMixer(fig.root), [fig.root])
  useEffect(() => {
    const clip = IDLE_CLIPS.map((n) => gltf.animations.find((c) => c.name === n)).find(Boolean)
    if (!clip) console.warn(`[intro] ${url}: idle klip topilmadi`)
    else {
      const a = mixer.clipAction(clip)
      const b = BREATH[id]
      a.timeScale = b.speed * fig.posture.tune.idleTimeScale // tebranish sokinroq
      a.play()
      a.time = clip.duration * b.phase
    }
    // effektdan oldin kadr o'tgan bo'lsa suyaklarda bind+qomat turibdi: avval toza pozaga qaytaramiz, aks holda
    // klip izi yo'q suyaklarda tuzatish bir marta ikki karra qo'llanib qoladi
    restorePosture(fig.posture)
    mixer.update(0)
    fig.posture.hasClip = false // yangi klip pozasi yozildi — eski saqlangan poza tiklanmasin
    if (import.meta.env.DEV) {
      const w = window as unknown as { __introFigs?: Record<string, unknown> }
      w.__introFigs = { ...w.__introFigs, [id + (fig.sil ? ':sil' : '')]: { mixer, root: fig.root, clips: gltf.animations.map((c) => c.name), clip: clip?.name, posture: fig.posture } }
    }
    return () => {
      mixer.stopAllAction()
      mixer.uncacheRoot(fig.root)
    }
  }, [gltf.animations, mixer, fig, id, url])

  useEffect(
    () => () => {
      fig.tint.forEach((t) => t.mat.dispose())
      fig.sil?.dispose()
      // klonlangan skeletning suyak teksturasi (DataTexture) GPU da qolib ketmasin; qayta kerak bo'lsa three o'zi yaratadi
      fig.root.traverse((o) => (o as THREE.SkinnedMesh).skeleton?.dispose())
    },
    [fig],
  )
  return { ...fig, mixer }
}

const _rootW = new THREE.Vector3()
const easeInOut = (k: number) => k * k * (3 - 2 * k)

function Figure({ url, id, silhouette }: { url: string; id: RoleId; silhouette: boolean }) {
  const fig = useFigure(url, id, silhouette)
  const gaze = useMemo(() => makeGaze(id), [id])
  const last = useRef(-1)
  const rev = useRef(0)
  // paydo bo'lish paytida kapsula yuqori qismda qoladi (model pastdan "o'sib" chiqadi)
  const [revealing, setRevealing] = useState(fig.playReveal)
  useEffect(() => {
    markLoaded(id)
  }, [id])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const show = live.show[id]
    // titulda figura butunlay kesilgan (ko'rinmaydi): mixer/qomat/nigoh CPU ishi bekor — o'tkazib yuboramiz.
    // Restore/apply juftligi birga o'tkaziladi, shuning uchun keyingi kadrda klip pozasi to'g'ri tiklanadi.
    if (show > 0 || !fig.posture.hasClip) {
      // qomat: klip pozasini tiklash -> mixer -> tuzatishlar (to'planmaydi) -> nigoh
      restorePosture(fig.posture)
      fig.mixer.update(dt)
      applyPosture(fig.posture)
      updateGaze(gaze, fig.posture, getState(), state.camera.position, live.time, dt)
      fig.posture.head?.getWorldPosition(heads[id])
    }

    // kesim balandligi: ikki sababdan kichigi — yuklanish paydo bo'lishi va sahnada "borlik" (titulda 0)
    let cutY = 1e4
    if (fig.playReveal || show < 1) fig.root.getWorldPosition(_rootW)
    if (fig.playReveal && rev.current < 1) {
      // titulda (yoki paydo bo'layotganda) yuklanish animatsiyasi ortiqcha — live.show o'zi ko'rsatadi.
      // sekin kompyuterda shader kompilyatsiyasi kadrni cho'zsa ham animatsiya ko'rinsin: qadam cheklangan
      rev.current = show < 1 ? 1 : Math.min(1, rev.current + Math.min(dt, 0.05) / REVEAL_SEC)
      if (rev.current < 1) cutY = _rootW.y - 0.02 + easeInOut(rev.current) * REVEAL_H
    }
    if (revealing && rev.current >= 1) {
      revealed.add(id)
      setRevealing(false)
    }
    if (show < 1) cutY = Math.min(cutY, show <= 0 ? -1e4 : _rootW.y - 0.02 + easeInOut(show) * REVEAL_H)
    fig.cut.value = cutY

    const k = live.light[id]
    if (Math.abs(k - last.current) > 0.004) {
      last.current = k
      // material tusi: lite rejimda alohida nur yo'q — xiralashtirish shu orqali ko'rinadi
      const f = 0.2 + 0.8 * Math.min(k, 1.2)
      for (const t of fig.tint) t.mat.color.copy(t.base).multiplyScalar(f)
    }
  })
  return (
    <>
      <primitive object={fig.root} />
      {revealing && <CapsuleSilhouette who={id} cut={fig.cut} />}
    </>
  )
}

/** GLB talab qilmaydigan kapsula siluyet: yuklanish paytida darhol, hech narsa bo'lmasa — yakuniy zaxira.
 *  Titulda (live.show = 0) ko'rinmaydi — zal bo'sh. */
function CapsuleSilhouette({ who, cut, finalFor }: { who: RoleId; cut?: Cut; finalFor?: RoleId }) {
  const mat = useMemo(() => makeSilhouetteMaterial(cut), [cut])
  useEffect(() => () => mat.dispose(), [mat])
  useEffect(() => {
    if (finalFor) markLoaded(finalFor)
  }, [finalFor])
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    if (ref.current) ref.current.visible = live.show[who] > CAPSULE_SHOW
  })
  const none = () => null
  return (
    <group ref={ref} visible={live.show[who] > CAPSULE_SHOW}>
      {/* oyoqlar */}
      <mesh position={[0.095, 0.47, 0]} material={mat} raycast={none}>
        <capsuleGeometry args={[0.075, 0.78, 4, 12]} />
      </mesh>
      <mesh position={[-0.095, 0.47, 0]} material={mat} raycast={none}>
        <capsuleGeometry args={[0.075, 0.78, 4, 12]} />
      </mesh>
      {/* tana */}
      <mesh position={[0, 1.2, 0]} scale={[1, 1, 0.68]} material={mat} raycast={none}>
        <capsuleGeometry args={[0.17, 0.4, 4, 16]} />
      </mesh>
      {/* qo'llar (yonda, biroz pastga) */}
      <mesh position={[0.235, 1.07, 0]} rotation-z={0.06} material={mat} raycast={none}>
        <capsuleGeometry args={[0.05, 0.56, 4, 10]} />
      </mesh>
      <mesh position={[-0.235, 1.07, 0]} rotation-z={-0.06} material={mat} raycast={none}>
        <capsuleGeometry args={[0.05, 0.56, 4, 10]} />
      </mesh>
      {/* bo'yin va bosh */}
      <mesh position={[0, 1.5, 0]} material={mat} raycast={none}>
        <cylinderGeometry args={[0.05, 0.055, 0.1, 12]} />
      </mesh>
      <mesh position={[0, 1.63, 0.01]} scale={[0.9, 1.08, 1]} material={mat} raycast={none}>
        <sphereGeometry args={[0.11, 20, 14]} />
      </mesh>
    </group>
  )
}

function Silhouette({ id, mobile }: { id: RoleId; mobile: boolean }) {
  const url = useModelUrl(characterUrl(FALLBACK_MODEL, false), characterUrl(FALLBACK_MODEL, true), mobile)
  const fullAvail = useAvailable(characterUrl(FALLBACK_MODEL, false))
  if (!url) return <CapsuleSilhouette who={id} finalFor={fullAvail === 'no' ? id : undefined} />
  return (
    <ModelBoundary key={url} fallback={<CapsuleSilhouette who={id} finalFor={id} />} label={url}>
      <Suspense fallback={<CapsuleSilhouette who={id} />}>
        <Figure url={url} id={id} silhouette />
      </Suspense>
    </ModelBoundary>
  )
}

/** Model URL ini transition orqali almashtirish: mobil<->to'liq almashganda eski model yangi yuklanguncha qoladi */
function useStableUrl(next: string | null) {
  const [url, setUrl] = useState(next)
  useEffect(() => {
    if (next === url) return
    if (url === null || next === null) setUrl(next)
    else startTransition(() => setUrl(next))
  }, [next, url])
  return url
}

// hover qilingan figuraning "hoversiz" yorug'i (×1.15 shundan hisoblanadi) — har holat uchun bitta obyekt
let noHoverSrc: IntroState | null = null
let noHoverState: IntroState | null = null
function lightWithoutHover(id: RoleId, s: IntroState) {
  if (s !== noHoverSrc) {
    noHoverSrc = s
    noHoverState = { ...s, hovered: null }
  }
  return wantLight(id, noHoverState!)
}

/** Holatdan kerakli yorug'lik: hover ×1.15 (100 ms), tanlashda boshqalar 0,45 */
function targetLight(id: RoleId, s: IntroState) {
  const hov = s.phase === 'select' && s.hovered === id
  if (s.phase === 'select' && s.selected && s.selected !== id) return 0.45 * (hov ? 1.15 : 1)
  return hov ? lightWithoutHover(id, s) * 1.15 : wantLight(id, s)
}

function Character({ role, slot, mobile }: { role: Role; slot: Slot; mobile: boolean }) {
  const want = useModelUrl(characterUrl(role.model, false), characterUrl(role.model, true), mobile)
  const avail = useAvailable(characterUrl(role.model, false))
  const url = useStableUrl(want)
  const group = useRef<THREE.Group>(null)
  const st = useRef({ step: 0, light: 0.3, turn: 0, show: -1, launchFrom: NaN })
  // birinchi kadrdan oldin: titulda bo'sh zal; boshqa fazadan boshlansa — darhol bor (paydo bo'lish o'ynamaydi)
  useLayoutEffect(() => {
    if (st.current.show < 0) st.current.show = wantShow(getState())
    live.show[role.id] = st.current.show
  }, [role.id])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const s = getState()
    const g = group.current
    if (!g) return
    const S = st.current
    const focused = focusOf(s) === role.id
    const hov = s.phase === 'select' && s.hovered === role.id
    // ~0,8 s da yetib boradi; reduced-motion — deyarli darhol
    S.step = THREE.MathUtils.damp(S.step, focused ? STEP : 0, reducedMotion ? 30 : 4.2, dt)
    const L = targetLight(role.id, s)
    // hover yorug'i 100 ms ichida (λ=25), qolgani yumshoq
    // rejim kartasi hover'i ~250 ms (λ=12) — farq tez o'qilsin
    S.light = THREE.MathUtils.damp(S.light, L, reducedMotion ? 30 : hov && L > S.light ? 25 : s.phase === 'mode' ? 12 : 5, dt)
    // kameraga burilish: hover 6°, tanlangan 10° (chegara — kamera yo'nalishigacha)
    let turnWant = 0
    const lim = focused && s.phase === 'select' ? TURN_SELECT : hov ? TURN_HOVER : 0
    if (lim) {
      const cam = state.camera.position
      const diff = Math.atan2(cam.x - g.position.x, cam.z - g.position.z) - slot.rotY
      turnWant = THREE.MathUtils.clamp(Math.atan2(Math.sin(diff), Math.cos(diff)), -lim, lim)
    }
    if (s.phase === 'launch' && live.launchT >= 0) {
      // "hamma o'rnidan tursin": stol tomon (orqada) — yelka ustidan, to'lqin bilan
      if (Number.isNaN(S.launchFrom)) S.launchFrom = S.turn
      const p = reducedMotion ? 1 : THREE.MathUtils.clamp((live.launchT - slot.index * LAUNCH_STAGGER) / LAUNCH_TURN_SEC, 0, 1)
      const e = p * p * (3 - 2 * p)
      S.turn = S.launchFrom + (benchSide(slot.pos.x) * TURN_LAUNCH - S.launchFrom) * e
    } else {
      S.launchFrom = NaN
      S.turn = THREE.MathUtils.damp(S.turn, turnWant, reducedMotion ? 30 : 14, dt)
    }
    g.rotation.y = slot.rotY + S.turn
    // og'irlik ko'chishi: slotning yon o'qi bo'ylab ±1,2 sm
    const ws = weightShift(role.id, live.time)
    g.position.copy(slot.pos).addScaledVector(slot.forward, S.step)
    g.position.x += slot.forward.z * ws
    g.position.z -= slot.forward.x * ws
    live.pos[role.id].copy(g.position)
    live.light[role.id] = S.light
    // sahnada "borlik": titulda 0; chiqqach chiroqlar tartibida (tashqi -> ichki -> himoyachi) ~0,7 s da paydo bo'ladi.
    // S.show — umumiy soat 0..1 (titulga qaytilsa — teskari); har personaj o'z oralig'i bilan.
    const total = SHOW_SEC + 2 * SHOW_STAGGER
    const target = wantShow(s)
    S.show = reducedMotion ? target : THREE.MathUtils.clamp(S.show + (target ? dt : -dt) / total, 0, 1)
    live.show[role.id] = THREE.MathUtils.clamp((S.show * total - IGNITE_STEP[role.id] * SHOW_STAGGER) / SHOW_SEC, 0, 1)
  })

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    if (getState().phase !== 'select') return
    e.stopPropagation()
    actions.hover(role.id)
    document.body.style.cursor = 'pointer'
  }
  const onOut = () => {
    if (getState().hovered === role.id) actions.hover(null)
    document.body.style.cursor = ''
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (getState().phase !== 'select') return
    e.stopPropagation()
    actions.select(role.id)
  }

  return (
    <group ref={group} position={slot.pos} rotation-y={slot.rotY}>
      {url ? (
        <ModelBoundary label={url} fallback={<Silhouette id={role.id} mobile={mobile} />}>
          <Suspense fallback={<CapsuleSilhouette who={role.id} />}>
            <Figure url={url} id={role.id} silhouette={false} />
          </Suspense>
        </ModelBoundary>
      ) : avail === 'no' ? (
        <Silhouette id={role.id} mobile={mobile} />
      ) : (
        <CapsuleSilhouette who={role.id} />
      )}
      {/* bosish/hover uchun ko'rinmas kapsula */}
      {/* visible=false: chizilmaydi (5 ta draw call kam), R3F raycast esa ko'rinmas obyektni ham tekshiradi */}
      <mesh position={[0, 0.9, 0]} visible={false} onPointerOver={onOver} onPointerOut={onOut} onClick={onClick}>
        <capsuleGeometry args={[0.32, 1.2, 4, 8]} />
        <meshBasicMaterial />
      </mesh>
      <BlobShadow who={role.id} />
      <Label role={role} index={slot.index} />
    </group>
  )
}

// ---------- Oyoq ostidagi yumshoq soya (haqiqiy soya xaritasi o'rniga — arzon) ----------
let blobTex: THREE.Texture | null = null
function getBlobTexture() {
  if (blobTex) return blobTex
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(0,0,0,0.85)')
  g.addColorStop(0.5, 'rgba(0,0,0,0.45)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  blobTex = new THREE.CanvasTexture(c)
  return blobTex
}

const BLOB_OPACITY = 0.8
/** Soya personaj bilan birga so'nadi/yonadi; doim chiziladi (titulda shaffof) — shader oldindan kompilyatsiya bo'lsin */
function BlobShadow({ who }: { who: RoleId }) {
  const tex = useMemo(() => getBlobTexture(), [])
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(() => {
    if (mat.current) mat.current.opacity = BLOB_OPACITY * live.show[who]
  })
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, 0]} raycast={() => null} renderOrder={1}>
      <planeGeometry args={[1.0, 0.8]} />
      <meshBasicMaterial ref={mat} map={tex} transparent depthWrite={false} opacity={0} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  )
}

/** Desktop yorlig'i balandligi (m): tanlangan kadrda tizza ~ plitkalar qatoridan (y≈760/900) ancha yuqori */
const LABEL_Y_DESKTOP = 0.45

// ---------- Yer yorlig'i: rol nomi + "AI agent" / "Siz" / "Avtomatik" ----------
// Desktop select'da faqat hover/tanlangan figurada; telefonda (hover yo'q) hammasida, ixcham. Case'da yashirin.
// drei <Html> o'rniga oddiy DOM: Html har yorliq uchun alohida React root yaratadi va select'dan chiqqanda uni
// commit paytida sinxron unmount qiladi — dev konsolda 5 ta "Attempted to synchronously unmount a root" xatosi.
// Bu yerda element bir marta yaratiladi, faqat select'da proyeksiya qilinadi (boshqa fazada kadr ishi yo'q).
const _lblV = new THREE.Vector3()
function Label({ role, index }: { role: Role; index: number }) {
  const phase = useIntro((s) => s.phase)
  const selected = useIntro((s) => s.selected)
  const hovered = useIntro((s) => s.hovered)
  // tor ekranda (telefon) yorliqlar ixcham va ikki qatorda (qo'shnilar ustma-ust tushmasin)
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const connected = useThree((s) => s.events.connected) as HTMLElement | undefined
  const compact = size.width < 640
  // <1024px da tanlangan rol pastki varaqda ochiladi (SelectScreen DESKTOP = 1024; rol nomi varaqda bor) —
  // varaq yorliqni yopib qo'ymasin: tanlanganda yorliqlar yashirin
  const sheet = size.width < 1024
  const anchor = useRef<THREE.Group>(null)
  const last = useRef({ x: NaN, y: NaN })

  const dom = useMemo(() => {
    const wrap = document.createElement('div')
    wrap.setAttribute('aria-hidden', 'true')
    wrap.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;user-select:none;z-index:1;display:none'
    const pill = document.createElement('div')
    const name = document.createElement('span')
    const tag = document.createElement('span')
    pill.append(name, tag)
    wrap.append(pill)
    return { wrap, pill, name, tag }
  }, [])

  useEffect(() => {
    const parent = connected ?? (gl.domElement.parentNode as HTMLElement | null)
    parent?.appendChild(dom.wrap)
    return () => dom.wrap.remove()
  }, [gl, connected, dom])

  const visible = phase === 'select'
  useLayoutEffect(() => {
    // ko'rsatish (display:block) useFrame da — avval joylashadi, chap-yuqori burchakda bir kadr "miltillamasin"
    if (!visible) dom.wrap.style.display = 'none'
    last.current.x = NaN
    if (!visible) return
    const active = hovered === role.id || selected === role.id
    const show = selected !== null && sheet ? false : compact ? selected === null : active
    const tag = role.id === 'kotib' ? 'Avtomatik' : role.playable ? 'Siz' : compact ? 'AI' : 'AI agent'
    dom.name.textContent = role.name
    dom.tag.textContent = tag
    const s = dom.pill.style
    s.display = 'flex'
    s.alignItems = 'center'
    s.gap = `${compact ? 4 : 7}px`
    s.whiteSpace = 'nowrap'
    // center (−50%) + telefonda qo'shnilar ustma-ust tushmasin — juft/toq qatorlar
    s.transform = `translate(-50%, -50%) translateY(${compact ? (index % 2 === 1 ? 36 : 14) : 0}px)`
    s.padding = compact ? '2px 6px 2px 7px' : '5px 10px 5px 12px'
    s.borderRadius = '999px'
    s.background = 'rgba(11,20,40,0.9)'
    s.border = `1px solid ${active ? GOLD : 'rgba(201,164,92,0.35)'}`
    s.color = '#f6efe0'
    s.font = `600 ${compact ? 10 : 13}px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif`
    s.letterSpacing = '0.2px'
    s.opacity = show ? '1' : '0'
    s.transition = 'opacity .15s, border-color .3s'
    s.boxShadow = '0 2px 12px rgba(0,0,0,0.5)'
    const t = dom.tag.style
    t.fontSize = `${compact ? 9 : 11}px`
    t.fontWeight = '700'
    t.padding = compact ? '1px 5px' : '2px 7px'
    t.borderRadius = '999px'
    t.textTransform = 'uppercase'
    t.letterSpacing = '0.4px'
    t.background = role.playable ? GOLD : 'transparent'
    t.color = role.playable ? NAVY : '#e2c88f'
    t.border = role.playable ? 'none' : '1px solid rgba(201,164,92,0.7)'
  }, [visible, hovered, selected, compact, sheet, index, role, dom])

  useFrame((state) => {
    if (!visible || !anchor.current) return
    anchor.current.getWorldPosition(_lblV).project(state.camera)
    const behind = _lblV.z > 1
    const x = (_lblV.x * 0.5 + 0.5) * state.size.width
    const y = (-_lblV.y * 0.5 + 0.5) * state.size.height
    const L = last.current
    if (behind) {
      if (dom.wrap.style.display !== 'none') dom.wrap.style.display = 'none'
      L.x = NaN
      return
    }
    // DOM ga faqat siljiganda yoziladi (kamera tinch turganda style yozuvi yo'q)
    if (!(Math.abs(x - L.x) < 0.1 && Math.abs(y - L.y) < 0.1)) {
      L.x = x
      L.y = y
      dom.wrap.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    }
    if (dom.wrap.style.display !== 'block') dom.wrap.style.display = 'block'
  })

  // desktop: tizza balandligida (tanlangan figurada pastdagi rol plitkalari ortida qolmasin); telefon: oyoq ostida
  return <group ref={anchor} position={[0, compact ? -0.02 : LABEL_Y_DESKTOP, 0.18]} />
}

// ---------- Oltin fokus halqasi: 8 qirrali yulduzli qo'sh doira ----------
const RING_SIZE = 1.5 // m (tekislik tomoni)
function makeRingTexture() {
  const N = 512
  const c = document.createElement('canvas')
  c.width = c.height = N
  const ctx = c.getContext('2d')!
  const px = N / RING_SIZE
  const cx = N / 2
  ctx.translate(cx, cx)
  ctx.strokeStyle = '#e8c77e'
  ctx.lineJoin = 'miter'
  ctx.shadowColor = 'rgba(232,199,126,0.95)'
  const circle = (r: number, w: number, blur: number) => {
    ctx.shadowBlur = blur
    ctx.lineWidth = w
    ctx.beginPath()
    ctx.arc(0, 0, r * px, 0, Math.PI * 2)
    ctx.stroke()
  }
  // ikki halqa: tashqi qalinroq, ichki ingichka
  circle(0.5, 7, 22)
  circle(0.5, 4, 0)
  circle(0.44, 3, 12)
  // 8 qirrali yulduz: ikki 45° burilgan kvadrat (uchlari ichki halqaga tegadi)
  const r = 0.43 * px
  const square = (rot: number) => {
    ctx.beginPath()
    for (let i = 0; i < 4; i++) {
      const a = rot + (i * Math.PI) / 2
      const x = Math.cos(a) * r
      const y = Math.sin(a) * r
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.stroke()
  }
  ctx.lineWidth = 3
  ctx.shadowBlur = 14
  square(0)
  square(Math.PI / 4)
  ctx.shadowBlur = 0
  ctx.lineWidth = 2
  square(0)
  square(Math.PI / 4)
  // halqalar orasida 16 ta mayda nuqta
  ctx.fillStyle = '#f3dca0'
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8
    ctx.beginPath()
    ctx.arc(Math.cos(a) * 0.47 * px, Math.sin(a) * 0.47 * px, 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function FocusRing({ lite }: { lite: boolean }) {
  const ref = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Mesh>(null)
  const ringMat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: makeRingTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    [],
  )
  const glowMat = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, 'rgba(201,164,92,0.28)')
    g.addColorStop(0.55, 'rgba(201,164,92,0.4)')
    g.addColorStop(0.72, 'rgba(201,164,92,0.22)')
    g.addColorStop(1, 'rgba(201,164,92,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 64)
    return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
  }, [])
  // lite (bloom yo'q): rang ×3 va yorqinroq disk — baribir yorqin oltin ko'rinsin
  useEffect(() => {
    ringMat.color.setScalar(lite ? 3 : 1.7)
  }, [lite, ringMat])
  useEffect(
    () => () => {
      ringMat.map?.dispose()
      ringMat.dispose()
      glowMat.map?.dispose()
      glowMat.dispose()
    },
    [ringMat, glowMat],
  )
  const st = useRef({ a: 0, init: false })
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const s = getState()
    const g = ref.current
    if (!g) return
    const id: RoleId | null = isWidePhase(s.phase) ? null : (focusOf(s) ?? (s.phase === 'select' ? 'himoyachi' : null))
    const a = id ? 1 : 0
    st.current.a = THREE.MathUtils.damp(st.current.a, a, 5, dt)
    if (id) {
      const p = live.pos[id]
      if (!st.current.init || reducedMotion) g.position.set(p.x, 0.012, p.z)
      else {
        g.position.x = THREE.MathUtils.damp(g.position.x, p.x, 9, dt)
        g.position.z = THREE.MathUtils.damp(g.position.z, p.z, 9, dt)
      }
      st.current.init = true
    }
    // 0,08 rad/s aylanish (reduced-motion — qo'zg'almas)
    if (spin.current && !reducedMotion) spin.current.rotation.z += 0.08 * dt
    const pulse = reducedMotion ? 1 : 0.88 + 0.12 * Math.sin(live.time * 2.2)
    ringMat.opacity = st.current.a * pulse
    glowMat.opacity = st.current.a * (lite ? 0.95 : 0.6) * pulse
    g.visible = st.current.a > 0.01
  })
  return (
    <group ref={ref} visible={false}>
      <mesh ref={spin} rotation-x={-Math.PI / 2} material={ringMat} raycast={() => null} renderOrder={2}>
        <planeGeometry args={[RING_SIZE, RING_SIZE]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.002} material={glowMat} raycast={() => null} renderOrder={2}>
        <planeGeometry args={[1.45, 1.45]} />
      </mesh>
    </group>
  )
}

/**
 * lite — effektlar (halqa yorqinligi); mobile — mobil GLB variantlari. Ikkalasi ajratilgan: sifat 'low' ga tushganda
 * yuklangan modellar almashtirilmaydi (qayta yuklash/klonlash/kaft o'lchovi — sekin kompyuterda qotish beradi).
 */
export function Characters({ slots, lite, mobile }: { slots: Record<RoleId, Slot>; lite: boolean; mobile: boolean }) {
  // personajlar hali chizilmagan kadrda ham live.pos to'g'ri bo'lsin (halqa, nurlar, nigoh nishonlari)
  useLayoutEffect(() => {
    for (const r of ROLES) {
      live.pos[r.id].copy(slots[r.id].pos)
      heads[r.id].copy(slots[r.id].pos).setY(1.6)
    }
  }, [slots])
  // tanlash ekranidan chiqilganda hover/kursor qolib ketmasin
  const phase = useIntro((s) => s.phase)
  useEffect(() => {
    if (phase === 'select') return
    document.body.style.cursor = ''
    if (getState().hovered) actions.hover(null)
  }, [phase])
  // sahna o'chsa (xato/boundary, HMR) kursor "pointer" bo'lib qolmasin
  useEffect(
    () => () => {
      document.body.style.cursor = ''
    },
    [],
  )
  return (
    <group>
      {ROLES.map((r) => (
        <Character key={r.id} role={r} slot={slots[r.id]} mobile={mobile} />
      ))}
      <FocusRing lite={lite} />
    </group>
  )
}
