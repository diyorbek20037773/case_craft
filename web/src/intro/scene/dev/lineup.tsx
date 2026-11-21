// DEV-ONLY: Meshy personajlarini xom holda (tuzatishsiz) ko'rish uchun studiya "lineup".
// Ilova bu faylni IMPORT QILMAYDI — faqat headless brauzerda __mountLineup.ts orqali yuklanadi.
// mode 'full' — 6 personaj to'liq bo'yi; 'faces' — har biriga alohida viewport (bosh-yelka).
// window.__lineupFix: qomat + presetlar har kadr qo'llanadi (klip 1,0 s da muzlatilgan), shuning uchun
// window.__lineupClasp / __lineupTune / __lineupArms ({ rol: {...} }) ni brauzerda o'zgartirib darhol ko'rish mumkin.
// window.__lineupProbe() — o'lchovlar + teri "kirib ketishi" (qo'l tanaga/songa) foizlari.
import { Environment, Html, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { applyPosture, fixClothMaterial, makePostureRig, measurePosture, restorePosture, type ArmPreset, type ClaspTuning, type PostureRig, type PostureTuning } from '../posture'

export const LINEUP = ['sudya', 'prokuror', 'himoyachi', 'guvoh', 'kotib', 'sudlanuvchi'] as const
const GAP = 0.9
const BG = '#7c7c7c'
const FREEZE_AT = 1.0

type Stat = { role: string; triangles: number; textures: string[]; height: number; clip: string | null; headY: number; fix: boolean; measured?: Record<string, number>; after?: Record<string, number> }
type Entry = { root: THREE.Object3D; posture: PostureRig | null }
type W = {
  __lineupNoMip?: boolean
  __lineupFix?: boolean
  __lineupDropRough?: boolean
  __lineupReady?: boolean
  __lineupStats?: Stat[]
  __lineupHeads?: THREE.Vector3[]
  __lineupDpr?: number
  __lineupClasp?: Record<string, ClaspTuning>
  __lineupTune?: Record<string, PostureTuning>
  __lineupArms?: Record<string, ArmPreset>
  __lineupProbe?: () => Record<string, Record<string, number>>
  /** kamera: { pos: [x,y,z], look: [x,y,z], fov } — yaqin kadr uchun (har kadr qo'llanadi) */
  /** har personaj ildizining burilishi, gradus (90 — profil, 40 — 3/4) */
  __lineupYaw?: number
  __lineupCam?: { pos: [number, number, number]; look: [number, number, number]; fov?: number } | null
}
const w = window as unknown as W
const registry = new Map<string, Entry>()

const xOf = (i: number) => (i - (LINEUP.length - 1) / 2) * GAP

function Person({ role, index, onStat }: { role: string; index: number; onStat: (s: Stat) => void }) {
  const gltf = useGLTF(`/models/meshy/${role}.glb`, false, true)
  const root = useMemo(() => {
    const r = cloneSkinned(gltf.scene)
    r.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.frustumCulled = false
      // window.__lineupFix: intro dagi kabi material tuzatishi (metalness 0, metalnessMap yo'q)
      if (w.__lineupFix) {
        const mat = (m.material as THREE.MeshStandardMaterial).clone()
        fixClothMaterial(mat, !!w.__lineupDropRough)
        // diagnostika: atlas choklari mipmap da qo'shni orollardan rang oladimi? (__lineupNoMip)
        if (w.__lineupNoMip) {
          for (const k of ['map', 'normalMap', 'roughnessMap'] as const) {
            const t = mat[k]
            if (!t) continue
            const c = t.clone()
            c.generateMipmaps = false
            c.minFilter = THREE.LinearFilter
            c.needsUpdate = true
            mat[k] = c
          }
        }
        m.material = mat
      }
    })
    return r
  }, [gltf.scene])
  const postureRef = useRef<PostureRig | null>(null)
  const base = useRef<{ tune: PostureRig['tune']; clasp: PostureRig['clasp']; arms: ArmPreset } | null>(null)

  useEffect(() => {
    const posture = w.__lineupFix ? makePostureRig(root, role) : null
    postureRef.current = posture
    base.current = posture ? { tune: { ...posture.tune }, clasp: { ...posture.clasp }, arms: posture.arms } : null
    const mixer = new THREE.AnimationMixer(root)
    const clip = ['idle', 'idle_a'].map((n) => gltf.animations.find((c) => c.name === n)).find(Boolean) ?? null
    if (clip) {
      const a = mixer.clipAction(clip)
      a.play()
      a.time = Math.min(FREEZE_AT, clip.duration)
      a.timeScale = 0
      mixer.update(0)
    }
    root.position.set(xOf(index), 0, 0)
    root.updateMatrixWorld(true)
    if (posture) {
      applyPosture(posture)
      root.updateMatrixWorld(true)
    }
    registry.set(role, { root, posture })
    // statistika
    let tris = 0
    const tex = new Set<string>()
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const g = m.geometry
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3
      const mat = m.material as THREE.MeshStandardMaterial
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap'] as const) {
        const t = mat[k]
        const img = t?.image as { width?: number; height?: number } | undefined
        if (img?.width) tex.add(`${k}:${img.width}x${img.height}`)
      }
    })
    let head: THREE.Object3D | undefined
    root.traverse((o) => {
      if (!head && o.name.toLowerCase() === 'head') head = o
    })
    const hp = new THREE.Vector3()
    head?.getWorldPosition(hp)
    const box = new THREE.Box3().setFromObject(root)
    onStat({ role, triangles: Math.round(tris), textures: [...tex], height: +(box.max.y - box.min.y).toFixed(3), clip: clip?.name ?? null, headY: +hp.y.toFixed(3), fix: !!posture, measured: posture ? { ...posture.measured } : undefined, after: posture ? measurePosture(posture) : undefined })
    return () => {
      mixer.stopAllAction()
      registry.delete(role)
    }
  }, [root, gltf.animations, index, role, onStat])

  // har kadr: muzlatilgan klip pozasi -> qomat + preset (window dagi sozlamalar bilan)
  useFrame(() => {
    const p = postureRef.current
    const b = base.current
    if (!p || !b) return
    Object.assign(p.tune, b.tune, w.__lineupTune?.[role] ?? {})
    Object.assign(p.clasp, b.clasp, w.__lineupClasp?.[role] ?? {})
    p.arms = w.__lineupArms?.[role] ?? b.arms
    root.rotation.y = ((w.__lineupYaw ?? 0) * Math.PI) / 180
    restorePosture(p)
    applyPosture(p)
  })

  return <primitive object={root} />
}

// ---------- Teri kirib ketishi o'lchovi (dev) ----------
type Part = 'handL' | 'handR' | 'foreL' | 'foreR' | 'armL' | 'armR' | 'torso' | 'thighL' | 'thighR'
const PART_OF: Record<string, Part> = {
  LeftHand: 'handL',
  RightHand: 'handR',
  LeftForeArm: 'foreL',
  RightForeArm: 'foreR',
  LeftArm: 'armL',
  RightArm: 'armR',
  Hips: 'torso',
  Spine02: 'torso',
  Spine01: 'torso',
  Spine: 'torso',
  LeftUpLeg: 'thighL',
  RightUpLeg: 'thighR',
}

function skinnedParts(root: THREE.Object3D) {
  const parts: Partial<Record<Part, number[]>> = {}
  const v = new THREE.Vector3()
  root.updateMatrixWorld(true)
  const rp = new THREE.Vector3()
  root.getWorldPosition(rp)
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh
    if (!m.isSkinnedMesh) return
    const si = m.geometry.getAttribute('skinIndex')
    const sw = m.geometry.getAttribute('skinWeight')
    const n = m.geometry.getAttribute('position').count
    for (let i = 0; i < n; i++) {
      let best = 0
      let bw = -1
      for (let k = 0; k < 4; k++) {
        const wk = sw.getComponent(i, k)
        if (wk > bw) {
          bw = wk
          best = si.getComponent(i, k)
        }
      }
      const part = PART_OF[m.skeleton.bones[best]?.name ?? '']
      if (!part || bw < 0.6) continue
      m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld).sub(rp)
      ;(parts[part] ??= []).push(v.x, v.y, v.z)
    }
  })
  return parts
}

/** A nuqtalaridan qanchasi B ichida (`axis` bo'ylab B ning min..max oralig'ida, qolgan ikki o'qda 2,5 sm katak) — % */
function insidePct(A: number[] | undefined, B: number[] | undefined, axis: 0 | 1 | 2, margin = 0.006) {
  if (!A?.length || !B?.length) return -1
  const [p, q] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1]
  const cell = 0.025
  const grid = new Map<string, [number, number]>()
  for (let i = 0; i < B.length; i += 3) {
    const key = Math.round(B[i + p] / cell) + ',' + Math.round(B[i + q] / cell)
    const c = grid.get(key)
    const val = B[i + axis]
    if (!c) grid.set(key, [val, val])
    else {
      c[0] = Math.min(c[0], val)
      c[1] = Math.max(c[1], val)
    }
  }
  let inside = 0
  for (let i = 0; i < A.length; i += 3) {
    const c = grid.get(Math.round(A[i + p] / cell) + ',' + Math.round(A[i + q] / cell))
    if (c && A[i + axis] > c[0] + margin && A[i + axis] < c[1] - margin) inside++
  }
  return +((100 * inside) / (A.length / 3)).toFixed(1)
}

w.__lineupProbe = () => {
  const out: Record<string, Record<string, number>> = {}
  for (const role of LINEUP) {
    const e = registry.get(role)
    if (!e) continue
    const r: Record<string, number> = {}
    if (e.posture) for (const [k, v] of Object.entries(measurePosture(e.posture))) r[k] = +v.toFixed(1)
    if (e.posture) for (const k of ['innerL', 'innerR'] as const) if (e.posture.measured[k] !== undefined) r[k] = +e.posture.measured[k].toFixed(0)
    const P = skinnedParts(e.root)
    // qo'l/bilak tana ichida (oldi-orqa bo'ylab), kaft son ichida (yon bo'ylab), yuqori qo'l tana ichida (yon bo'ylab — yelka "erishi")
    r.handInTorsoL = insidePct(P.handL, P.torso, 2)
    r.handInTorsoR = insidePct(P.handR, P.torso, 2)
    r.foreInTorsoL = insidePct(P.foreL, P.torso, 2)
    r.foreInTorsoR = insidePct(P.foreR, P.torso, 2)
    r.handInThighL = insidePct(P.handL, P.thighL, 0)
    r.handInThighR = insidePct(P.handR, P.thighR, 0)
    r.armInTorsoL = insidePct(P.armL, P.torso, 0)
    r.armInTorsoR = insidePct(P.armR, P.torso, 0)
    // bilak uchi (wrist) balandligi va oldinga chiqishi (ildizga nisbatan, m)
    const hl = e.posture?.sides[0].hand
    const hr = e.posture?.sides[1].hand
    const rp = new THREE.Vector3()
    e.root.getWorldPosition(rp)
    const tv = new THREE.Vector3()
    if (hl) {
      hl.getWorldPosition(tv).sub(rp)
      r.wristL_y = +tv.y.toFixed(3)
      r.wristL_z = +tv.z.toFixed(3)
      r.wristL_x = +tv.x.toFixed(3)
    }
    if (hr) {
      hr.getWorldPosition(tv).sub(rp)
      r.wristR_y = +tv.y.toFixed(3)
      r.wristR_z = +tv.z.toFixed(3)
      r.wristR_x = +tv.x.toFixed(3)
    }
    out[role] = r
  }
  return out
}

/** 'faces' rejimi: 6 ta scissor viewport, har biri o'z personajining boshiga qaragan */
function FacesRenderer() {
  const { gl, scene, size } = useThree()
  const cam = useMemo(() => new THREE.PerspectiveCamera(24, 1, 0.05, 50), [])
  useFrame(() => {
    const heads = w.__lineupHeads
    if (!heads) return
    const n = LINEUP.length
    const tw = Math.floor(size.width / n)
    const th = Math.floor(size.height * 0.6)
    const ty = Math.floor((size.height - th) / 2)
    gl.setScissorTest(false)
    gl.setViewport(0, 0, size.width, size.height)
    gl.setClearColor(BG, 1)
    gl.clear()
    gl.setScissorTest(true)
    cam.aspect = tw / th
    for (let i = 0; i < n; i++) {
      const h = heads[i]
      const target = new THREE.Vector3(h.x, h.y - 0.05, 0)
      cam.position.set(h.x, h.y, 1.35)
      cam.lookAt(target)
      cam.updateProjectionMatrix()
      gl.setViewport(i * tw, ty, tw, th)
      gl.setScissor(i * tw + 2, ty, tw - 4, th)
      gl.render(scene, cam)
    }
    gl.setScissorTest(false)
  }, 1)
  return null
}

function CamOverride() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  useFrame(() => {
    const c = w.__lineupCam
    if (!c) return
    camera.position.set(...c.pos)
    camera.lookAt(...c.look)
    if (c.fov && camera.fov !== c.fov) {
      camera.fov = c.fov
      camera.updateProjectionMatrix()
    }
  })
  return null
}

function ReadyFlag({ count }: { count: () => number }) {
  const frames = useRef(0)
  useFrame(() => {
    if (count() >= LINEUP.length && ++frames.current === 8) w.__lineupReady = true
  })
  return null
}

export function Lineup({ mode }: { mode: 'full' | 'faces' }) {
  const stats = useRef<Stat[]>([])
  const onStat = useMemo(
    () => (s: Stat) => {
      stats.current = stats.current.filter((x) => x.role !== s.role).concat(s)
      w.__lineupStats = LINEUP.map((r) => stats.current.find((x) => x.role === r)).filter((x): x is Stat => !!x)
      w.__lineupHeads = LINEUP.map((r, i) => new THREE.Vector3(xOf(i), stats.current.find((x) => x.role === r)?.headY ?? 1.6, 0))
    },
    [],
  )
  const half = ((LINEUP.length - 1) / 2) * GAP + 0.6
  // to'liq kadr: 6 personaj kengligi sig'adigan masofa (16:9, fov 30), kamera ko'krak balandligida
  const fov = 30
  const dist = half / (Math.tan(((fov / 2) * Math.PI) / 180) * (16 / 9))
  return (
    <Canvas dpr={w.__lineupDpr ?? 1} gl={{ antialias: true, preserveDrawingBuffer: true }} camera={{ fov, position: [0, 1.3, dist], near: 0.05, far: 60 }} onCreated={({ camera }) => camera.lookAt(0, 0.95, 0)}>
      <color attach="background" args={[BG]} />
      <Suspense fallback={null}>
        <Environment files="/env/old_hall_1k.hdr" environmentIntensity={0.45} />
      </Suspense>
      {/* key (old-chap), fill (old-o'ng), rim (orqa) */}
      <directionalLight position={[-3, 4, 4]} intensity={2.4} color="#fff4e6" />
      <directionalLight position={[3.5, 2.2, 3]} intensity={0.8} color="#e8f0ff" />
      <directionalLight position={[0, 3.5, -4]} intensity={1.6} color="#ffffff" />
      <hemisphereLight args={['#ffffff', '#555555', 0.3]} />
      {/* kulrang "cheksiz" pol */}
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color={BG} roughness={1} />
      </mesh>
      <Suspense fallback={null}>
        {LINEUP.map((r, i) => (
          <Person key={r} role={r} index={i} onStat={onStat} />
        ))}
        {mode === 'full' &&
          LINEUP.map((r, i) => (
            <Html key={r} position={[xOf(i), -0.04, 0.2]} center style={{ pointerEvents: 'none' }}>
              <div style={{ font: '600 18px system-ui, sans-serif', color: '#111', background: 'rgba(255,255,255,0.75)', padding: '2px 10px', borderRadius: 6, whiteSpace: 'nowrap' }}>{r}</div>
            </Html>
          ))}
      </Suspense>
      {mode === 'faces' && <FacesRenderer />}
      <CamOverride />
      <ReadyFlag count={() => stats.current.length} />
    </Canvas>
  )
}
