// Zaldagi o'tirgan personajlar + gapirayotgan ustidagi ingichka yorliq + so'z egasi ostida oltin halqa.
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useContext, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { DESK, WITNESS_POS } from '../layout'
import { FloorContext, SPEAKER_LABEL, SpeakerContext } from '../session'
import { CAST, headOf, PLACEMENT } from './cast'
import { Character } from './Character'

export function Cast({ mobile, debug }: { mobile: boolean; debug: boolean }) {
  return (
    <>
      {CAST.map((c) => (
        <Character key={c.role} spec={c} mobile={mobile} debug={debug} />
      ))}
      <SpeakerTag />
      <FloorRing />
    </>
  )
}

/** So'z egasining oyog'i ostidagi nuqta (pol). Himoyachi — kameraning o'zi, halqa chizilmaydi (HUD da "So'z sizda") */
function floorSpot(holder: string | null): THREE.Vector3 | null {
  if (!holder || holder === 'defense') return null
  if (holder === 'witness') return new THREE.Vector3(WITNESS_POS.x, WITNESS_POS.y + 0.015, WITNESS_POS.z)
  const spec = CAST.find((c) => c.role === holder)
  if (!spec) return null
  const hips = PLACEMENT[spec.role].hips
  return new THREE.Vector3(hips.x, DESK[spec.desk].pos[1] + 0.015, hips.z)
}

/**
 * So'z navbati (floor.holder) — o'quv ko'rsatkichi: polda ingichka oltin halqa, sekin "nafas oladi".
 * O'tirganlar stol ortida bo'lgani uchun chuqurlik testisiz chiziladi (stol orqali shaffof ko'rinadi). Speaking yorlig'idan farqli:
 * yorliq — kim gapiryapti, halqa — kimda gapirish huquqi.
 */
function FloorRing() {
  const holder = useContext(FloorContext)
  const spot = useMemo(() => floorSpot(holder), [holder])
  const ring = useRef<THREE.MeshBasicMaterial>(null)
  const disc = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    const k = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 2.1)
    if (ring.current) ring.current.opacity = 0.38 + 0.2 * k
    if (disc.current) disc.current.opacity = 0.05 + 0.04 * k
  })
  if (!spot) return null
  return (
    <group position={spot} rotation-x={-Math.PI / 2}>
      <mesh renderOrder={6}>
        <ringGeometry args={[0.4, 0.435, 72]} />
        <meshBasicMaterial ref={ring} color="#f3c35a" transparent opacity={0.5} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh renderOrder={5}>
        <circleGeometry args={[0.4, 48]} />
        <meshBasicMaterial ref={disc} color="#ffd98a" transparent opacity={0.07} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Gapirayotgan personaj boshidan biroz yuqorida rol nomi (juda nozik; kadrda bo'lmasa ko'rinmaydi) */
function SpeakerTag() {
  const speaker = useContext(SpeakerContext)
  if (!speaker) return null
  const p = headOf(speaker)
  return (
    <Html position={[p.x, p.y + 0.26, p.z]} center zIndexRange={[4, 0]} pointerEvents="none">
      <span className="pointer-events-none select-none whitespace-nowrap rounded-full border border-amber-200/30 bg-black/45 px-2 py-0.5 text-[10px] font-medium tracking-wide text-amber-50/85 backdrop-blur-sm">
        {SPEAKER_LABEL[speaker]}
      </span>
    </Html>
  )
}
