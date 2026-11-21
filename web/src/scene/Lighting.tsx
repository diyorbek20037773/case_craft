import { Environment, Lightformer } from '@react-three/drei'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { AssetBoundary } from './AssetBoundary'
import { ASSETS } from './assets'
import { SPEAKERS } from './layout'

const ENV_INTENSITY = 0.75

/** Internetsiz ishlaydigan yorug'lik muhiti (oxirgi zaxira) */
function LocalEnvironment() {
  return (
    <Environment resolution={128} frames={1} environmentIntensity={ENV_INTENSITY}>
      <Lightformer form="rect" intensity={2.2} color="#fff4e2" position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
      <Lightformer form="rect" intensity={1.2} color="#dfe9ff" position={[-6, 2, 0]} rotation-y={Math.PI / 2} scale={[12, 3, 1]} />
      <Lightformer form="rect" intensity={0.8} color="#ffe6c4" position={[6, 2, 0]} rotation-y={-Math.PI / 2} scale={[12, 3, 1]} />
      <Lightformer form="rect" intensity={0.5} color="#ffffff" position={[0, 2, 8]} rotation-y={Math.PI} scale={[10, 3, 1]} />
    </Environment>
  )
}

function PresetEnvironment() {
  const local = <LocalEnvironment />
  if (!ASSETS.envPreset) return local
  return (
    <AssetBoundary name="env preset" fallback={local}>
      <Environment preset={ASSETS.envPreset} environmentIntensity={ENV_INTENSITY} />
    </AssetBoundary>
  )
}

/** HDRI -> drei preset -> lokal Lightformer. Yuklanayotganda lokal muhit ko'rinadi. */
export function SceneEnvironment() {
  if (!ASSETS.hdri) return <PresetEnvironment />
  return (
    <AssetBoundary name="hdri" fallback={<PresetEnvironment />}>
      <Environment files={ASSETS.hdri} environmentIntensity={ENV_INTENSITY} />
    </AssetBoundary>
  )
}

/** Yumshoq asosiy yorug'lik + raislik qiluvchiga bitta iliq projektor (spotLight) */
export function SceneLights() {
  const spot = useRef<THREE.SpotLight>(null)
  const judge = SPEAKERS.judge.position

  useEffect(() => {
    const s = spot.current
    if (!s) return
    s.target.position.set(judge[0], judge[1] + 1.1, judge[2])
    s.target.updateMatrixWorld()
  }, [judge])

  return (
    <>
      <hemisphereLight args={['#fff6e8', '#4a3626', 0.55]} />
      <directionalLight position={[-4, 7, 5]} intensity={1.1} color="#fff1dc" />
      <directionalLight position={[5, 5, -2]} intensity={0.35} color="#dfe8ff" />
      <spotLight
        ref={spot}
        position={[0, 4.4, -2.6]}
        angle={0.55}
        penumbra={0.7}
        intensity={14}
        distance={10}
        decay={1.6}
        color="#ffd9a3"
      />
    </>
  )
}
