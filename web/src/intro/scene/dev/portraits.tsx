// DEV-ONLY: intro UI uchun 3D modellarimizdan portret renderlari (bosh-yelka, 3:4).
// Ilova bu faylni IMPORT QILMAYDI — faqat headless brauzerda __mountPortraits.ts orqali.
// Qomat + material tuzatishi (posture.ts) yoqilgan, idle klip 1,0 s da muzlatilgan.
import { Environment, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { applyPosture, fixClothMaterial, makePostureRig } from '../posture'

const FREEZE_AT = 1.0
/** 3/4 burilish (personaj kameraga nisbatan) */
const TURN = 15 * (Math.PI / 180)
const FOV = 20

type W = { __portraitReady?: string | null; __portrait?: { show: (role: string) => void } }
const w = window as unknown as W

/** Orqa fon: to'q navy-yong'oq gradient (zalning xira, fokusdan tashqari tuyg'usi) */
function useBackdropTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 683
    const ctx = c.getContext('2d')!
    const lin = ctx.createLinearGradient(0, 0, 0, c.height)
    lin.addColorStop(0, '#0b1426')
    lin.addColorStop(0.55, '#16192a')
    lin.addColorStop(1, '#1d140e')
    ctx.fillStyle = lin
    ctx.fillRect(0, 0, c.width, c.height)
    // boshning orqasida iliq yorug' dog' (shift chirog'i devorga tushgandek)
    const rad = ctx.createRadialGradient(c.width * 0.42, c.height * 0.36, 10, c.width * 0.42, c.height * 0.36, c.width * 0.62)
    rad.addColorStop(0, 'rgba(120,88,52,0.55)')
    rad.addColorStop(0.5, 'rgba(60,48,40,0.25)')
    rad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = rad
    ctx.fillRect(0, 0, c.width, c.height)
    // xira vertikal panel chiziqlari (yong'oq panellar, fokusdan tashqari)
    ctx.filter = 'blur(14px)'
    for (const x of [0.12, 0.88]) {
      ctx.fillStyle = 'rgba(70,45,28,0.35)'
      ctx.fillRect(c.width * x - 18, 0, 36, c.height)
    }
    ctx.filter = 'none'
    // chekka qorong'ilashuv
    const vig = ctx.createRadialGradient(c.width / 2, c.height * 0.45, c.width * 0.35, c.width / 2, c.height * 0.45, c.width * 0.85)
    vig.addColorStop(0, 'rgba(0,0,0,0)')
    vig.addColorStop(1, 'rgba(0,0,0,0.6)')
    ctx.fillStyle = vig
    ctx.fillRect(0, 0, c.width, c.height)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
}

function Person({ role, onHead }: { role: string; onHead: (v: THREE.Vector3) => void }) {
  const gltf = useGLTF(`/models/meshy/${role}.glb`, false, true)
  const root = useMemo(() => {
    const r = cloneSkinned(gltf.scene)
    r.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.frustumCulled = false
      const mat = (m.material as THREE.MeshStandardMaterial).clone()
      mat.side = THREE.DoubleSide
      mat.envMapIntensity = 0.7
      fixClothMaterial(mat) // metalness 0, mipmap yo'q (atlas choklari)
      m.material = mat
    })
    return r
  }, [gltf.scene])

  useEffect(() => {
    const posture = makePostureRig(root, role)
    const mixer = new THREE.AnimationMixer(root)
    const clip = ['idle', 'idle_a'].map((n) => gltf.animations.find((c) => c.name === n)).find(Boolean)
    if (clip) {
      const a = mixer.clipAction(clip)
      a.play()
      a.time = Math.min(FREEZE_AT, clip.duration)
      a.timeScale = 0
      mixer.update(0)
    }
    root.rotation.y = TURN
    root.updateMatrixWorld(true)
    applyPosture(posture)
    root.updateMatrixWorld(true)
    const head = posture.head
    const v = new THREE.Vector3()
    head?.getWorldPosition(v)
    onHead(v)
    return () => {
      mixer.stopAllAction()
    }
  }, [root, gltf.animations, role, onHead])

  return <primitive object={root} />
}

/** Kadr: ko'krak o'rtasidan boshdan biroz yuqorigacha; kamera ko'z balandligida */
function Framer({ head, role }: { head: THREE.Vector3 | null; role: string }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const frames = useRef(0)
  useEffect(() => {
    frames.current = 0
    w.__portraitReady = null
  }, [role, head])
  useFrame(() => {
    if (!head) return
    const top = head.y + 0.3
    const bottom = head.y - 0.55
    const cy = (top + bottom) / 2
    const d = (top - bottom) / 2 / Math.tan(((FOV / 2) * Math.PI) / 180)
    camera.fov = FOV
    camera.position.set(head.x, head.y + 0.06, head.z + d)
    camera.lookAt(head.x, cy, head.z)
    camera.updateProjectionMatrix()
    if (++frames.current === 6) w.__portraitReady = role
  })
  return null
}

export function Portraits({ initial }: { initial: string }) {
  const [role, setRole] = useState(initial)
  const [head, setHead] = useState<THREE.Vector3 | null>(null)
  const backdrop = useBackdropTexture()
  useEffect(() => {
    w.__portrait = {
      show: (r: string) => {
        w.__portraitReady = null
        setHead(null)
        setRole(r)
      },
    }
  }, [])
  const onHead = useMemo(() => (v: THREE.Vector3) => setHead(v.clone()), [])
  return (
    <Canvas dpr={1} gl={{ antialias: true, preserveDrawingBuffer: true }} camera={{ fov: FOV, position: [0, 1.5, 2.5], near: 0.05, far: 30 }}>
      <color attach="background" args={['#0b1020']} />
      <Suspense fallback={null}>
        <Environment files="/env/old_hall_1k.hdr" environmentIntensity={0.22} />
      </Suspense>
      {/* fon: kameraga qaragan katta tekislik, nursiz */}
      <mesh position={[0, 1.45, -2.2]}>
        <planeGeometry args={[3.6, 4.8]} />
        <meshBasicMaterial map={backdrop} toneMapped={false} />
      </mesh>
      {/* iliq key — old-chap yuqoridan; sovuq kontur — orqa-o'ng va orqa-chap; juda kam to'ldiruvchi */}
      <directionalLight position={[-2.2, 3.2, 2.6]} intensity={2.7} color="#ffd9ad" />
      <directionalLight position={[2.4, 1.8, 2.2]} intensity={0.32} color="#9fb2d6" />
      <directionalLight position={[1.8, 2.6, -2.4]} intensity={2.4} color="#a9c2ff" />
      <directionalLight position={[-1.6, 2.4, -2.6]} intensity={1.1} color="#a9c2ff" />
      <hemisphereLight args={['#2a3550', '#120c08', 0.25]} />
      <Suspense fallback={null}>
        <Person key={role} role={role} onHead={onHead} />
      </Suspense>
      <Framer head={head} role={role} />
    </Canvas>
  )
}
