// Ixtiyoriy CaseCraft emblemasi: /intro/models/casecraft-emblem.glb bo'lsa (content-type tekshiruvi bilan).
// Paydo bo'lish: chetdan (90°) yuzga 2,2 s burilish + oltin yaltirash (nur chapdan o'ngga o'tadi, emissive puls).
// Titulda sudya stoli tepasida sekin suzadi; Boshlash'dan keyin orqa devordagi navy diskka "gerb" bo'lib o'rnashadi
// (ramka bilan birga rejim/lobbida so'nadi — live.plaque). Fayl yo'q bo'lsa — hech narsa (kod tayyor turadi).
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getState } from '../state'
import { EMBLEM_URL, useAvailable } from './assets'
import { ModelBoundary } from './Boundary'
import { EMBLEM_POS, EMBLEM_SETTLED, PLAQUE } from './layout'
import { live, reducedMotion } from './live'

/** emblema o'lchami (eng katta tomoni, m) */
const SIZE = 1.1
/** diskka o'rnashganda: disk diametri (2·(r−0.02)) ichiga sig'sin */
const SETTLED_SCALE = (2 * (PLAQUE.r - 0.06)) / SIZE
const APPEAR_S = 2.2
const GOLD = new THREE.Color('#e0b866')
const easeOut = (u: number) => 1 - Math.pow(1 - u, 3)

function EmblemModel() {
  const gltf = useGLTF(EMBLEM_URL, false, true)
  const { obj, mats } = useMemo(() => {
    const c = gltf.scene.clone(true)
    // o'lchamni SIZE ga moslash, markazni koordinata boshiga
    const box = new THREE.Box3().setFromObject(c)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const k = SIZE / Math.max(size.x, size.y, size.z, 1e-3)
    c.scale.setScalar(k)
    c.position.copy(center).multiplyScalar(-k)
    const mats: { m: THREE.MeshStandardMaterial; base: THREE.Color; baseI: number }[] = []
    c.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.raycast = () => null
      const src = m.material as THREE.MeshStandardMaterial
      if (src?.isMeshStandardMaterial) {
        // yaltirash uchun alohida nusxa (GLTF keshidagi asl material o'zgarmasin)
        const mat = src.clone()
        m.material = mat
        mats.push({ m: mat, base: mat.emissive.clone(), baseI: mat.emissiveIntensity })
      }
    })
    const g = new THREE.Group()
    g.add(c)
    return { obj: g, mats }
  }, [gltf.scene])
  useEffect(() => () => mats.forEach(({ m }) => m.dispose()), [mats])

  const ref = useRef<THREE.Group>(null)
  const light = useRef<THREE.PointLight>(null)
  const st = useRef({ t0: -1, settle: getState().phase === 'title' ? 0 : 1 })
  const tmp = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, rawDt) => {
    const g = ref.current
    if (!g) return
    const dt = Math.min(rawDt, 0.1)
    const t = live.time
    const S = st.current
    if (S.t0 < 0) S.t0 = t
    const u = reducedMotion ? 1 : Math.min(1, (t - S.t0) / APPEAR_S)

    // titulda suzadi, boshqa fazalarda gerb bo'lib diskda turadi (~1,2 s da ko'chadi)
    const want = getState().phase === 'title' ? 0 : 1
    S.settle = THREE.MathUtils.damp(S.settle, want, reducedMotion ? 30 : 2.6, dt)
    const sv = S.settle
    const bob = reducedMotion ? 0 : Math.sin(t * 0.6) * 0.06 * (1 - sv)
    tmp.copy(EMBLEM_POS).lerp(EMBLEM_SETTLED, sv)
    g.position.set(tmp.x, tmp.y + bob, tmp.z)

    // diskka o'rnashgan bo'lsa ramka bilan birga so'nadi (rejim/lobbi — kartalar ortida ko'rinmasin)
    const vis = THREE.MathUtils.lerp(1, live.plaque, sv)
    const scale = THREE.MathUtils.lerp(1, SETTLED_SCALE, sv) * Math.max(0.001, vis)
    g.scale.setScalar(scale)
    g.visible = vis > 0.01

    // chetdan yuzga burilish, keyin titulda yengil tebranish; diskda — to'g'ri
    const turn = (1 - easeOut(u)) * (Math.PI / 2)
    const sway = reducedMotion ? 0 : Math.sin(t * 0.25) * 0.3 * u * (1 - sv)
    g.rotation.y = turn + sway

    // oltin yaltirash: burilish davomida qo'ng'iroqsimon puls, nur chapdan o'ngga o'tadi
    const bell = reducedMotion ? 0 : Math.sin(Math.PI * u)
    for (const { m, base, baseI } of mats) {
      m.emissive.copy(base).lerp(GOLD, bell * 0.85)
      m.emissiveIntensity = baseI + bell * 0.6
    }
    const l = light.current
    if (l) {
      l.position.set(-1 + 2 * easeOut(u), 0.7, 0.75)
      l.intensity = 6 + 10 * bell
    }
  })
  return (
    <group ref={ref}>
      <primitive object={obj} />
      {/* emblemaga oltin kontur nur (paydo bo'lishda chapdan o'ngga yaltirab o'tadi) */}
      <pointLight ref={light} position={[0.6, 0.8, -0.7]} color="#ffd79a" intensity={6} distance={3} decay={2} />
    </group>
  )
}

export function Emblem() {
  const avail = useAvailable(EMBLEM_URL)
  if (avail !== 'yes') return null
  return (
    <ModelBoundary fallback={null} label={EMBLEM_URL}>
      <Suspense fallback={null}>
        <EmblemModel />
      </Suspense>
    </ModelBoundary>
  )
}
