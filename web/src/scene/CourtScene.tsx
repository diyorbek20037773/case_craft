import { ContactShadows, PerformanceMonitor } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useState } from 'react'
import * as THREE from 'three'
import { CameraRig } from './CameraRig'
import { Character } from './Character'
import { Courtroom } from './Courtroom'
import { SceneEnvironment, SceneLights } from './Lighting'
import { SPEAKER_ORDER, type SpeakerId, type ViewId } from './layout'

export interface CourtSceneProps {
  view: ViewId
  /** Hozir gapirayotgan personaj (halqa yonadi, ism plashkasi sariq bo'ladi) */
  speaking: SpeakerId | null
  className?: string
}

type Quality = 'high' | 'low'

/** To'liq ekranli 3D sud zali. Boshqa ekranlar shu komponentni `view` va `speaking` bilan boshqaradi. */
export function CourtScene({ view, speaking, className }: CourtSceneProps) {
  const [quality, setQuality] = useState<Quality>('high')
  const [maxDpr, setMaxDpr] = useState(1.5)

  return (
    <Canvas
      className={className}
      dpr={[1, maxDpr]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, powerPreference: 'high-performance' }}
      camera={{ fov: 50, near: 0.1, far: 60, position: [5.45, 1.42, 0.45] }}
      fallback={
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-300">
          Brauzeringiz 3D (WebGL) ni qo'llab-quvvatlamaydi. Chrome yoki Safari ning yangi versiyasida oching.
        </div>
      }
    >
      <PerformanceMonitor
        onDecline={() => {
          setMaxDpr(1)
          setQuality('low')
        }}
        onIncline={() => {
          setMaxDpr(1.5)
          setQuality('high')
        }}
        onFallback={() => {
          setMaxDpr(1)
          setQuality('low')
        }}
        flipflops={3}
      />
      <color attach="background" args={['#1a1714']} />
      <fog attach="fog" args={['#1a1714', 18, 34]} />

      <SceneLights />
      <SceneEnvironment />
      <Courtroom />
      {SPEAKER_ORDER.map((id) => (
        <Character key={id} id={id} speaking={speaking === id} />
      ))}
      <ContactShadows
        position={[0, 0.01, 0.5]}
        scale={[14, 17]}
        resolution={quality === 'high' ? 1024 : 512}
        frames={quality === 'high' ? Infinity : 120}
        blur={2.4}
        opacity={0.55}
        far={2.2}
        color="#1b120b"
      />
      <CameraRig view={view} />
    </Canvas>
  )
}
