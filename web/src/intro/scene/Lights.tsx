// Yorug'lik: zalning ko'p qismi soyada, personajlar shiftdagi spotlardan yoritiladi.
// "Nur ustunlari" — haqiqiy hajmiy yorug'lik emas, additive shaffof konuslar (arzon).
// high: har personajga bitta spot (soyasiz) + stol spoti + yo'lak spoti + orqa kontur nur.
// low: bitta keng spot + stol spoti + kontur. Chiroqlar soni fazaga qarab o'zgarmaydi (shader qayta kompilyatsiya
// bo'lmasin) — faqat intensivlik/rang. Qiymatlar (qaysi fazada qancha) — live.ts dagi want* funksiyalari.
import { Sparkles } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ROLES, type RoleId } from '../config'
import { getState } from '../state'
import { BENCH_POS, ROOM, spotSource, type Slot } from './layout'
import { IGNITE_KEY, IGNITE_STEP, isWidePhase, lightLambda, live, reducedMotion, wantAisle, wantBench, wantCool, wantEnv, wantRim, wantSideCool } from './live'

const WARM = new THREE.Color('#ffe2b8')
const COOL = new THREE.Color('#9fc3ff')
/** rejim kartasi almashganda ~0.4 s da yetib boradi */

// ---------- Birinchi titul: chiroqlar birin-ketin yonadi (sessiyada bir marta) ----------
const IGNITE_T0 = 0.5
const IGNITE_GAP = 0.32
const IGNITE_DUR = 0.5
const smooth = (u: number) => u * u * (3 - 2 * u)

/**
 * live.ignite ni yuritadi (boshlang'ich qiymat live.ts da: o'ynalmagan bo'lsa 0, aks holda 1).
 * Room teksturalari tayyor bo'lgach 0.5 + i·0.32 s da, har biri 0.5 s smoothstep: tashqi -> ichki -> himoyachi -> stol.
 */
function useIgnition() {
  const st = useRef({ active: live.ignite[3] < 1, firstFrame: 0 })
  useFrame(() => {
    const S = st.current
    if (!S.active) return
    const now = performance.now()
    if (!S.firstFrame) S.firstFrame = now
    // titulda emas (masalan, darhol boshqa fazaga o'tildi) — ketma-ketlikni kutmay yoqamiz
    if (getState().phase !== 'title' && !live.roomReadyAt) live.roomReadyAt = now - 1e5
    // zal teksturalari kelmasa ham 8 s dan keyin baribir yonadi (zal hech qachon qorong'i qolmasin)
    const t0 = live.roomReadyAt || (now - S.firstFrame > 8000 ? S.firstFrame + 8000 : 0)
    if (!t0) return
    const t = (now - t0) / 1000
    let done = true
    for (let i = 0; i < 4; i++) {
      const u = THREE.MathUtils.clamp((t - (IGNITE_T0 + i * IGNITE_GAP)) / IGNITE_DUR, 0, 1)
      live.ignite[i] = smooth(u)
      if (u < 1) done = false
    }
    if (done) {
      S.active = false
      try {
        sessionStorage.setItem(IGNITE_KEY, '1')
      } catch {
        /* private rejim — har safar yonadi, zarari yo'q */
      }
    }
  })
}

// ---------- Nur konusi materiali ----------
const coneVert = /* glsl */ `
  uniform float uLen;
  varying float vH;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vH = clamp(-position.y / uLen, 0.0, 1.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`
const coneFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vH;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.8);
    float along = smoothstep(0.0, 0.06, vH) * (1.0 - 0.7 * vH) * (1.0 - smoothstep(0.88, 1.0, vH));
    gl_FragColor = vec4(uColor * edge * along * uOpacity, 1.0);
  }
`

function Shaft({ from, to, id, radius = 0.72 }: { from: THREE.Vector3; to: THREE.Vector3; id: RoleId; radius?: number }) {
  const { geo, quat, len } = useMemo(() => {
    const dir = to.clone().sub(from)
    const len = dir.length()
    const g = new THREE.CylinderGeometry(0.07, radius, len, 28, 1, true)
    g.translate(0, -len / 2, 0) // tepasi (manba) koordinata boshida
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize())
    return { geo: g, quat: q, len }
  }, [from, to, radius])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: coneVert,
        fragmentShader: coneFrag,
        uniforms: { uLen: { value: len }, uColor: { value: WARM.clone() }, uOpacity: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [len],
  )
  const capMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.8, 2.2), toneMapped: false }), [])
  const capBase = useMemo(() => new THREE.Color(3.2, 2.8, 2.2), [])
  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
      capMat.dispose()
    },
    [geo, mat, capMat],
  )
  useFrame(() => {
    const s = getState()
    const k = live.light[id]
    const ign = live.ignite[IGNITE_STEP[id]]
    // keng kadrda nur ustunlari ko'proq ko'rinadi (titul 0.48 -> ~0.11); yaqin kadrda yorug'likka ergashadi
    const o = isWidePhase(s.phase) ? 0.23 * k : 0.04 + 0.1 * k
    mat.uniforms.uOpacity.value = o * ign
    ;(mat.uniforms.uColor.value as THREE.Color).copy(WARM).lerp(COOL, live.cool[id])
    // shiftdagi gardish: o'chiq chiroq — xira
    capMat.color.copy(capBase).multiplyScalar(0.08 + 0.92 * ign)
  })
  return (
    <group position={from} quaternion={quat}>
      <mesh geometry={geo} material={mat} raycast={() => null} renderOrder={5} />
      {/* shiftdagi chiroq gardishi */}
      <mesh position={[0, 0.02, 0]} raycast={() => null} material={capMat}>
        <cylinderGeometry args={[0.13, 0.13, 0.04, 20]} />
      </mesh>
    </group>
  )
}

function CharSpot({ slot, id }: { slot: Slot; id: RoleId }) {
  const ref = useRef<THREE.SpotLight>(null)
  const scene = useThree((s) => s.scene)
  const from = useMemo(() => spotSource(slot), [slot])
  useEffect(() => {
    const l = ref.current
    if (!l) return
    scene.add(l.target)
    return () => {
      scene.remove(l.target)
    }
  }, [scene])
  useFrame(() => {
    const l = ref.current
    if (!l) return
    const p = live.pos[id]
    l.target.position.set(p.x, 0.9, p.z)
    l.target.updateMatrixWorld()
    l.intensity = 150 * live.light[id] * live.ignite[IGNITE_STEP[id]]
    l.color.copy(WARM).lerp(COOL, live.cool[id])
  })
  return <spotLight ref={ref} position={from} color={WARM} angle={0.2} penumbra={0.75} decay={2} distance={11} intensity={0} />
}

/** Nurlardagi chang: faqat !lite va keng fazalarda, ≤70 zarra. Fazadan chiqqanda yumshoq so'nadi. */
const DUST_N = 64
function Dust() {
  const ref = useRef<THREE.Points>(null)
  const base = useMemo(() => Float32Array.from({ length: DUST_N }, (_, i) => 0.25 + 0.45 * ((i * 0.618034) % 1)), [])
  const opac = useMemo(() => new Float32Array(DUST_N), [])
  const st = useRef({ v: 0, last: -1 })
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const s = getState()
    const want = isWidePhase(s.phase) ? live.ignite[3] : 0
    st.current.v = THREE.MathUtils.damp(st.current.v, want, 3, dt)
    const v = st.current.v
    const pts = ref.current
    if (!pts) return
    pts.visible = v > 0.01
    if (Math.abs(v - st.current.last) < 0.005) return
    st.current.last = v
    for (let i = 0; i < DUST_N; i++) opac[i] = base[i] * v
    const a = pts.geometry.getAttribute('opacity') as THREE.BufferAttribute | undefined
    if (a) a.needsUpdate = true
  })
  return (
    <Sparkles
      ref={ref}
      count={DUST_N}
      scale={[6.5, 3.6, 4.5]}
      position={[0, 2.5, -0.2]}
      size={2.2}
      speed={reducedMotion ? 0 : 0.18}
      noise={0.6}
      opacity={opac}
      color="#ffd9a0"
      raycast={() => null}
    />
  )
}

const RIM_BASE = new THREE.Color('#9db4e0')
const RIM_COOL = new THREE.Color('#a9c8ff')

export function Lights({ slots, lite }: { slots: Record<RoleId, Slot>; lite: boolean }) {
  const scene = useThree((s) => s.scene)
  const bench = useRef<THREE.SpotLight>(null)
  const group = useRef<THREE.SpotLight>(null)
  const aisle = useRef<THREE.SpotLight>(null)
  const side = useRef<THREE.DirectionalLight>(null)
  const rim = useRef<THREE.DirectionalLight>(null)
  useIgnition()

  useEffect(() => {
    const targets: [THREE.SpotLight | null, THREE.Vector3][] = [
      [bench.current, new THREE.Vector3(BENCH_POS.x, 1.6, ROOM.zBack + 0.2)],
      [group.current, new THREE.Vector3(0, 0.6, 0.2)],
      [aisle.current, new THREE.Vector3(0, 0, 2.6)],
    ]
    const added: THREE.SpotLight[] = []
    for (const [l, t] of targets) {
      if (!l) continue
      l.target.position.copy(t)
      scene.add(l.target)
      l.target.updateMatrixWorld()
      added.push(l)
    }
    return () => added.forEach((l) => scene.remove(l.target))
  }, [scene, lite])

  // Kayfiyat qiymatlari (damp) + ko'k rang personajlarga
  const mood = useRef({ bench: 1.5, aisle: 1.5, side: 0, env: 0.22, rim: 1, init: false })
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const s = getState()
    const M = mood.current
    const lam = reducedMotion ? 30 : lightLambda(s)
    if (!M.init) {
      M.bench = wantBench(s)
      M.aisle = wantAisle(s)
      M.env = wantEnv(s)
      M.init = true
    }
    M.bench = THREE.MathUtils.damp(M.bench, wantBench(s), lam, dt)
    M.aisle = THREE.MathUtils.damp(M.aisle, wantAisle(s), lam, dt)
    M.side = THREE.MathUtils.damp(M.side, wantSideCool(s), lam, dt)
    M.env = THREE.MathUtils.damp(M.env, wantEnv(s), reducedMotion ? 30 : 3, dt)
    M.rim = THREE.MathUtils.damp(M.rim, wantRim(s), lam, dt)
    for (const r of ROLES) live.cool[r.id] = THREE.MathUtils.damp(live.cool[r.id], wantCool(r.id, s), lam, dt)

    const ign = live.ignite
    if (bench.current) bench.current.intensity = 70 * M.bench * ign[3]
    if (aisle.current) aisle.current.intensity = 70 * M.aisle * ign[3]
    if (side.current) side.current.intensity = M.side
    // orqa kontur nur: select'da ×2 va sovuqroq — figuralar orqa devordan ajralib tursin (soya yo'q, arzon)
    if (rim.current) {
      rim.current.intensity = (lite ? 1.1 : 1.4) * M.rim
      rim.current.color.copy(RIM_BASE).lerp(RIM_COOL, THREE.MathUtils.clamp(M.rim - 1, 0, 1))
    }
    if (group.current) {
      // lite: bitta umumiy spot — o'rtacha personaj yorug'iga ergashadi (titul 110×1.5, tanlash 110)
      let sum = 0
      for (const r of ROLES) sum += live.light[r.id]
      const avg = sum / ROLES.length
      const k = isWidePhase(s.phase) ? THREE.MathUtils.clamp((avg / 0.48) * 1.5, 0.3, 2.2) : THREE.MathUtils.clamp(avg / 0.82, 0.3, 1.3)
      group.current.intensity = 110 * k * (0.25 + (0.75 * (ign[0] + ign[1] + ign[2])) / 3)
    }
    // muhit yorug'i: yonish paytida xira boshlanadi
    scene.environmentIntensity = M.env * (0.35 + 0.65 * (ign[0] + ign[3]) * 0.5)
  })

  const shafts = useMemo(
    () =>
      ROLES.map((r) => {
        const s = slots[r.id]
        return { id: r.id, from: spotSource(s), to: s.pos.clone().addScaledVector(s.forward, 0.3).setY(0) }
      }),
    [slots],
  )

  return (
    <>
      <hemisphereLight args={['#33415e', '#120c08', lite ? 0.35 : 0.22]} />
      {/* orqadan sovuq kontur nur: siluyetlarni fondan ajratadi */}
      <directionalLight ref={rim} position={[0.5, 4.5, -6]} color="#9db4e0" intensity={lite ? 1.1 : 1.4} />
      {/* Ta'lim kartasi: chapdan sovuq ko'k yon nur (doim bor, intensivlik 0 — kompilyatsiya bo'lmasin) */}
      <directionalLight ref={side} position={[-6, 2.8, 3]} color="#9fc3ff" intensity={0} />
      {/* sudya stoli va orqa devor — iliq, yumshoq */}
      <spotLight ref={bench} position={[0, ROOM.height - 0.1, 0.6]} color="#ffd9a6" angle={0.55} penumbra={0.9} decay={2} distance={14} intensity={0} />
      {lite ? (
        <spotLight ref={group} position={[0, ROOM.height - 0.1, 3.2]} color={WARM} angle={0.75} penumbra={0.8} decay={2} distance={12} intensity={0} />
      ) : (
        <>
          {ROLES.map((r) => (
            <CharSpot key={r.id} slot={slots[r.id]} id={r.id} />
          ))}
          {/* yo'lak: gilam va parketda iliq yaltirash (konseptdagi "yaltiroq pol") */}
          <spotLight ref={aisle} position={[0, ROOM.height - 0.1, 6.6]} color="#ffd9a6" angle={0.5} penumbra={1} decay={2} distance={13} intensity={0} />
        </>
      )}
      {shafts.map((s) => (
        <Shaft key={s.id} id={s.id} from={s.from} to={s.to} />
      ))}
      {!lite && <Dust />}
    </>
  )
}
