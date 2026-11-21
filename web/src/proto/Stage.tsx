// 3D sahna: 360 panorama fon + IBL, minbar to'sig'i, guvoh, yumshoq soya, kamera "nafasi" va giroskop.
import { ContactShadows, PerformanceMonitor, useTexture } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import pano2k from './assets/zal-2k.jpg?url'
import pano4k from './assets/zal-4k.jpg?url'
import panoDetail from './assets/zal-detail.webp?url'
import {
  CAMERA_HEIGHT,
  LECTERN_DIST,
  LECTERN_OUTLINE,
  MIC_DIST,
  MIC_OUTLINE,
  WINDOW_U,
  WITNESS_DIST,
  WITNESS_U,
  JUDGE_LOOK,
  panoAt,
  panoDir,
} from './pano'
import { Witness } from './Witness'

export interface GyroOffset {
  yaw: number
  pitch: number
}

export type Quality = 'high' | 'low'

interface StageProps {
  quality: Quality
  onQuality: (q: Quality) => void
  gyro: RefObject<GyroOffset>
  debug?: boolean
}

const OCCLUDER_LAYER = 1

export function Stage({ quality, onQuality, gyro, debug = false }: StageProps) {
  const [dpr, setDpr] = useState(quality === 'high' ? 1.5 : 1.25)
  const high = quality === 'high'
  return (
    <Canvas
      dpr={[1, dpr]}
      shadows={high ? 'percentage' : false}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 45, near: 0.05, far: 100, position: [0, CAMERA_HEIGHT, 0] }}
      onCreated={({ gl, camera }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
        camera.layers.enable(OCCLUDER_LAYER)
      }}
    >
      <PerformanceMonitor
        onDecline={() => {
          setDpr(1)
          onQuality('low')
        }}
        onIncline={() => setDpr((d) => Math.min(1.5, d + 0.25))}
      />
      <Suspense fallback={null}>
        <Pano />
        <WitnessGroup />
      </Suspense>
      <Lights shadows={high} />
      <Occluder outline={LECTERN_OUTLINE} dist={LECTERN_DIST} debug={debug} />
      <Occluder outline={MIC_OUTLINE} dist={MIC_DIST} debug={debug} />
      <ContactShadows
        position={[WITNESS_POS.x, 0.002, WITNESS_POS.z]}
        scale={2.4}
        far={1.6}
        blur={2.4}
        opacity={0.55}
        resolution={high ? 512 : 256}
        frames={high ? Infinity : 1}
        color="#2a1d14"
      />
      {debug && <DebugBall />}
      <CameraRig gyro={gyro} />
    </Canvas>
  )
}

/* ------------------------------------------------------------------ */

const WITNESS_POS = panoAt(WITNESS_U, WITNESS_DIST)
/** Tana: 70% kameraga, 30% sudyaga qarab turadi (minbar odatda sudyaga qaragan) */
const WITNESS_YAW = (() => {
  const toCam = Math.atan2(-WITNESS_POS.x, -WITNESS_POS.z)
  const toJudge = Math.atan2(JUDGE_LOOK.x - WITNESS_POS.x, JUDGE_LOOK.z - WITNESS_POS.z)
  let d = toJudge - toCam
  d = Math.atan2(Math.sin(d), Math.cos(d))
  return toCam + d * 0.3
})()

function WitnessGroup() {
  return <Witness position={WITNESS_POS} rotationY={WITNESS_YAW} />
}

/** zal-detail.webp kesimi (asl 8192x4096 pikselda) — make_pano.py bilan bir xil */
const DETAIL = { u0: 4424 / 8192, u1: 6554 / 8192, v0: 1229 / 4096, v1: 3277 / 4096 }

/** Ichidan ko'rinadigan sfera bo'lagi (u/v oralig'i). scale(-1) — ichidan qaraganda ko'zgu bo'lmasin */
function panoSphere(radius: number, u0 = 0, u1 = 1, v0 = 0, v1 = 1, w = 128, h = 64) {
  const g = new THREE.SphereGeometry(radius, w, h, u0 * Math.PI * 2, (u1 - u0) * Math.PI * 2, v0 * Math.PI, (v1 - v0) * Math.PI)
  g.scale(-1, 1, 1)
  return g
}

/**
 * Panorama: butun sfera (4k, kuchsiz GPU da 2k) + guvoh atrofida asl 8k aniqlikdagi bo'lak (chetlari silliq).
 * Ton-mappingsiz (asl ranglar); shu rasm IBL yorug'lik sifatida ham ishlatiladi.
 */
function Pano() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const big = gl.capabilities.maxTextureSize >= 4096
  const [tex, detail] = useTexture(big ? [pano4k, panoDetail] : [pano2k, pano2k])
  const geometry = useMemo(() => panoSphere(40), [])
  const detailGeometry = useMemo(() => panoSphere(39, DETAIL.u0, DETAIL.u1, DETAIL.v0, DETAIL.v1, 48, 48), [])
  useEffect(() => {
    const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy())
    for (const t of [tex, detail]) {
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = aniso
      t.needsUpdate = true
    }
    tex.mapping = THREE.EquirectangularReflectionMapping
    scene.environment = tex
    // three equirect: u=0.5 -> +X; bizda sudya -Z da
    scene.environmentRotation.set(0, Math.PI / 2, 0)
    scene.environmentIntensity = 0.95
    return () => {
      scene.environment = null
    }
  }, [tex, detail, gl, scene])
  useEffect(
    () => () => {
      geometry.dispose()
      detailGeometry.dispose()
    },
    [geometry, detailGeometry],
  )
  // Sfera markazi kamerada (aks holda 1,3 m siljish fon va to'siqni bir-biridan ajratadi).
  // Ikkalasi ham "opaque" ro'yxatda: fon -> aniq bo'lak -> to'siqlar -> guvoh tartibida chiziladi.
  return (
    <group position={[0, CAMERA_HEIGHT, 0]} rotation-y={-Math.PI / 2}>
      <mesh geometry={geometry} renderOrder={-3}>
        <meshBasicMaterial map={tex} toneMapped={false} depthWrite={false} />
      </mesh>
      {big && (
        <mesh geometry={detailGeometry} renderOrder={-2}>
          <meshBasicMaterial
            map={detail}
            toneMapped={false}
            depthWrite={false}
            blending={THREE.CustomBlending}
            blendSrc={THREE.SrcAlphaFactor}
            blendDst={THREE.OneMinusSrcAlphaFactor}
          />
        </mesh>
      )}
    </group>
  )
}

/** Asosiy yorug'lik o'ngdagi derazadan (guvoh ortida, chap-oldindan kontur nuri), ship chiroqlari — yumshoq to'ldiruvchi */
function Lights({ shadows }: { shadows: boolean }) {
  const key = useRef<THREE.DirectionalLight>(null)
  const keyPos = useMemo(() => panoDir(WINDOW_U + 0.02, 0.36).multiplyScalar(5).add(WITNESS_POS), [])
  useEffect(() => {
    const l = key.current
    if (!l) return
    l.target.position.copy(WITNESS_POS).setY(1.3)
    l.target.updateMatrixWorld()
  }, [])
  return (
    <>
      <directionalLight
        ref={key}
        position={keyPos}
        intensity={1.5}
        color="#fff0dc"
        castShadow={shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-1}
        shadow-camera-right={1}
        shadow-camera-top={1.2}
        shadow-camera-bottom={-1.2}
        shadow-camera-near={1}
        shadow-camera-far={10}
      />
      {/* ship chirog'i — yuqoridan iliq */}
      <spotLight
        position={[WITNESS_POS.x - 0.6, 3.2, WITNESS_POS.z + 0.6]}
        target-position={[WITNESS_POS.x, 1.4, WITNESS_POS.z]}
        angle={0.6}
        penumbra={1}
        intensity={6}
        decay={2}
        color="#ffe6c4"
      />
    </>
  )
}

/**
 * Ko'rinmas to'siq: panoramadagi narsa (minbar, mikrofon) siluyeti bo'yicha chuqurlik yozadi (rang yozmaydi).
 * Shu bois guvohning pastki qismi rasmdagi minbar ORTIDA qoladi. ?debug=1 da qizil ko'rinadi.
 */
function Occluder({ outline, dist, debug }: { outline: [number, number][]; dist: number; debug: boolean }) {
  const geometry = useMemo(() => {
    const contour = outline.map(([u, v]) => new THREE.Vector2(u, -v))
    const tris = THREE.ShapeUtils.triangulateShape(contour, [])
    const pos: number[] = []
    const d = new THREE.Vector3()
    for (const [u, v] of outline) {
      panoDir(u, v, d)
      const k = dist / Math.max(1e-3, Math.hypot(d.x, d.z))
      pos.push(d.x * k, CAMERA_HEIGHT + d.y * k, d.z * k)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(tris.flat())
    return g
  }, [outline, dist])
  const ref = useRef<THREE.Mesh>(null)
  useEffect(() => {
    ref.current?.layers.set(OCCLUDER_LAYER)
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh ref={ref} geometry={geometry} renderOrder={-1}>
      <meshBasicMaterial
        colorWrite={debug}
        color="#ff0044"
        transparent={debug}
        opacity={0.45}
        side={THREE.DoubleSide}
        depthWrite
      />
    </mesh>
  )
}

/** ?debug=1 — IBL yo'nalishini tekshirish uchun ko'zgu shar */
function DebugBall() {
  const p = useMemo(() => panoAt(WITNESS_U - 0.06, 1.6, 1.0), [])
  return (
    <mesh position={p}>
      <sphereGeometry args={[0.18, 48, 32]} />
      <meshStandardMaterial metalness={1} roughness={0.02} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ */

/**
 * Kamera: panorama nuqtasida, guvohga qarab; sekin "nafas" (kichik tebranish) va giroskop qo'shimchasi.
 * Tik ekranda guvoh markazda, keng ekranda biroz chaproqda — o'ngda deraza yorug'i ko'rinadi.
 */
function CameraRig({ gyro }: { gyro: RefObject<GyroOffset> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const smooth = useRef({ yaw: 0, pitch: 0 })
  const base = useMemo(() => {
    const aspect = size.width / Math.max(1, size.height)
    const portrait = aspect < 0.9
    // Guvoh boshi va ko'kragi orasiga qarash
    const look = WITNESS_POS.clone().setY(portrait ? 1.42 : 1.3)
    const dir = look.sub(new THREE.Vector3(0, CAMERA_HEIGHT, 0))
    let yaw = Math.atan2(dir.x, -dir.z)
    const pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z))
    if (!portrait) yaw -= aspect > 1.4 ? 0.08 : 0.04
    const fov = portrait ? 52 : aspect > 1.4 ? 50 : 54
    return { yaw, pitch, fov }
  }, [size.width, size.height])

  useEffect(() => {
    camera.fov = base.fov
    camera.updateProjectionMatrix()
  }, [camera, base.fov])

  const e = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), [])
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const t = state.clock.elapsedTime
    const g = gyro.current
    smooth.current.yaw = THREE.MathUtils.damp(smooth.current.yaw, g?.yaw ?? 0, 6, dt)
    smooth.current.pitch = THREE.MathUtils.damp(smooth.current.pitch, g?.pitch ?? 0, 6, dt)
    const breathYaw = Math.sin(t * 0.21 * Math.PI * 2) * 0.004 + Math.sin(t * 0.07 * Math.PI * 2) * 0.006
    const breathPitch = Math.sin(t * 0.25 * Math.PI * 2) * 0.004
    // yaw: -Z dan o'ngga musbat; three da Y atrofida aylanish teskari yo'nalishda
    e.set(base.pitch + breathPitch + smooth.current.pitch, -(base.yaw + breathYaw + smooth.current.yaw), 0, 'YXZ')
    camera.quaternion.setFromEuler(e)
    camera.position.set(0, CAMERA_HEIGHT + Math.sin(t * 0.25 * Math.PI * 2) * 0.004, 0)
  })
  return null
}
