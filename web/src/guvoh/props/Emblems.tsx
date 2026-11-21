// Davlat ramzlari: orqa devordagi GERB (rasmiy SVG -> public/court/gerb.webp) va supadagi BAYROQ (ustun kodda,
// mato — rasmiy bayroq teksturasi, yengil to'lqin). Manba va litsenziya: public/court/CREDITS.md.
import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { DAIS, FLAG, GERB, ROOM } from '../layout'

export function Gerb({ mobile }: { mobile: boolean }) {
  const tex = useTexture(mobile ? '/court/gerb-m.webp' : '/court/gerb.webp')
  useLayoutEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    tex.needsUpdate = true
  }, [tex])
  // devor paneli va karniz 0,1 m gacha chiqib turadi — gerb ulardan oldinda
  const z = ROOM.zBack + 0.13
  return (
    <group position={[GERB.x, GERB.y, z]}>
      {/* yengil "bo'rtma": o'sha shakldagi yumshoq soya devorga tushadi */}
      <mesh position={[0.025, -0.035, -0.008]} renderOrder={1}>
        <planeGeometry args={[GERB.size, GERB.size]} />
        <meshBasicMaterial map={tex} color="#000000" transparent opacity={0.32} depthWrite={false} />
      </mesh>
      <mesh renderOrder={2}>
        <planeGeometry args={[GERB.size, GERB.size]} />
        <meshStandardMaterial map={tex} alphaTest={0.4} roughness={0.42} metalness={0.18} envMapIntensity={1.1} />
      </mesh>
    </group>
  )
}

const CLOTH_W = 1.2
const CLOTH_H = 0.6
const SEG_X = 24
const SEG_Y = 10

function applyWave(geo: THREE.BufferGeometry, base: Float32Array, t: number) {
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = base[i * 3]
    const y = base[i * 3 + 1]
    const u = x / CLOTH_W // 0 — ustunda, 1 — uchi
    const v = -y / CLOTH_H
    const z = (Math.sin(u * 6.2 - t * 1.5 + v * 0.9) * 0.045 + Math.sin(u * 13 - t * 2.4) * 0.012) * u
    // mato uchi biroz osilib turadi
    pos.setXYZ(i, x * (1 - 0.04 * u), y - u * u * 0.1, z)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
}

/** Bayroq: guruch ustun (supada) + mato. Mato ustundan +X ga chiqadi (old tomondan rasmiy ko'rinish — oy ustun yonida) */
export function Flag({ animate }: { animate: boolean }) {
  const tex = useTexture('/court/bayroq.webp')
  useLayoutEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    tex.needsUpdate = true
  }, [tex])
  const { geo, base } = useMemo(() => {
    const g = new THREE.PlaneGeometry(CLOTH_W, CLOTH_H, SEG_X, SEG_Y).translate(CLOTH_W / 2, -CLOTH_H / 2, 0)
    const b = Float32Array.from(g.attributes.position.array as Float32Array)
    applyWave(g, b, 0)
    return { geo: g, base: b }
  }, [])
  useLayoutEffect(() => () => geo.dispose(), [geo])
  const frame = useRef(0)
  useFrame((state) => {
    if (!animate) return
    if (frame.current++ % 2) return
    applyWave(geo, base, state.clock.elapsedTime)
  })

  const H = FLAG.poleH
  return (
    <group position={[FLAG.x, DAIS.h, FLAG.z]}>
      {/* poydevor */}
      <mesh position={[0, 0.03, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.24, 0.06, 32]} />
        <meshStandardMaterial color="#2a1a10" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.09, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.11, 0.08, 24]} />
        <meshStandardMaterial color="#c79a4a" metalness={1} roughness={0.3} />
      </mesh>
      {/* ustun */}
      <mesh position={[0, H / 2, 0]} castShadow>
        <cylinderGeometry args={[0.018, 0.022, H, 16]} />
        <meshStandardMaterial color="#c9a25a" metalness={1} roughness={0.28} />
      </mesh>
      {/* uch: shar + nayza */}
      <mesh position={[0, H + 0.04, 0]}>
        <sphereGeometry args={[0.04, 20, 14]} />
        <meshStandardMaterial color="#d8b46a" metalness={1} roughness={0.22} />
      </mesh>
      <mesh position={[0, H + 0.13, 0]}>
        <coneGeometry args={[0.028, 0.14, 16]} />
        <meshStandardMaterial color="#d8b46a" metalness={1} roughness={0.22} />
      </mesh>
      {/* mato: ustun tepasidan, biroz pastga og'gan */}
      <mesh geometry={geo} position={[0.02, H - 0.06, 0]} rotation={[0, -0.32, -0.32]} castShadow>
        <meshStandardMaterial map={tex} side={THREE.DoubleSide} roughness={0.85} envMapIntensity={0.7} />
      </mesh>
    </group>
  )
}
