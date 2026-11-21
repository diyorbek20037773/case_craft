import { Html, useAnimations, useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { AssetBoundary } from './AssetBoundary'
import { ASSETS, DRACO_PATH } from './assets'
import { SPEAKERS, type SpeakerId } from './layout'

interface CharacterProps {
  id: SpeakerId
  speaking: boolean
  /** Ism plashkasini ko'rsatish (kamera juda uzoqda bo'lsa o'chirish mumkin) */
  showLabel?: boolean
}

const RING_COLOR = '#fbbf24'
/** Quaternius SitDown pozasi past o'rindiqqa mo'ljallangan — stulga moslash uchun ko'tariladi */
const GLB_SEAT_LIFT = 0.22

/** Bosh va qo'l balandliklari (personajning pol nuqtasidan) */
function heights(seated: boolean) {
  return seated ? { ring: 1.05, label: 1.72, head: 1.3 } : { ring: 1.3, label: 1.98, head: 1.55 }
}

export function Character({ id, speaking, showLabel = true }: CharacterProps) {
  const cfg = SPEAKERS[id]
  const model = ASSETS.characters[id]
  const h = heights(cfg.seated)
  const speakingRef = useRef(speaking)
  useEffect(() => {
    speakingRef.current = speaking
  }, [speaking])

  const placeholder = <PlaceholderBody id={id} speakingRef={speakingRef} />

  return (
    <group position={cfg.position} rotation-y={cfg.rotationY}>
      {model ? (
        <AssetBoundary name={`personaj ${id}`} fallback={placeholder}>
          <GlbBody id={id} speakingRef={speakingRef} />
        </AssetBoundary>
      ) : (
        placeholder
      )}
      <SpeakingRing active={speaking} y={h.ring} />
      {showLabel && <NameTag label={cfg.label} speaking={speaking} y={h.label} />}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Gapirish halqasi                                                     */
/* ------------------------------------------------------------------ */

function SpeakingRing({ active, y }: { active: boolean; y: number }) {
  const ring = useRef<THREE.Mesh>(null)
  const ripple = useRef<THREE.Mesh>(null)
  const light = useRef<THREE.PointLight>(null)
  const level = useRef(0)

  useFrame((state, dt) => {
    const target = active ? 1 : 0
    level.current = THREE.MathUtils.damp(level.current, target, 8, Math.min(dt, 0.1))
    const l = level.current
    const t = state.clock.elapsedTime
    const visible = l > 0.01
    if (ring.current) {
      ring.current.visible = visible
      const pulse = 1 + Math.sin(t * 7) * 0.06
      ring.current.scale.setScalar(pulse * (0.85 + 0.15 * l))
      ;(ring.current.material as THREE.MeshBasicMaterial).opacity = l * (0.75 + 0.25 * Math.sin(t * 7))
    }
    if (ripple.current) {
      ripple.current.visible = visible
      const p = (t * 1.2) % 1
      ripple.current.scale.setScalar(1 + p * 0.9)
      ;(ripple.current.material as THREE.MeshBasicMaterial).opacity = l * (1 - p) * 0.6
    }
    if (light.current) light.current.intensity = l * (1.6 + Math.sin(t * 7) * 0.4)
  })

  return (
    <group position={[0, y, 0]}>
      <mesh ref={ring} rotation-x={Math.PI / 2} visible={false}>
        <torusGeometry args={[0.42, 0.028, 12, 64]} />
        <meshBasicMaterial color={RING_COLOR} transparent opacity={0} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh ref={ripple} rotation-x={Math.PI / 2} visible={false}>
        <torusGeometry args={[0.42, 0.012, 8, 64]} />
        <meshBasicMaterial color={RING_COLOR} transparent opacity={0} toneMapped={false} depthWrite={false} />
      </mesh>
      <pointLight ref={light} color={RING_COLOR} intensity={0} distance={2.2} decay={2} position={[0, 0.25, 0.35]} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Ism plashkasi                                                        */
/* ------------------------------------------------------------------ */

function NameTag({ label, speaking, y }: { label: string; speaking: boolean; y: number }) {
  // Barqaror DOM nishon: drei Html ildizini qayta yaratmasin (aks holda konsolda React ogohlantirishi)
  const parent = useThree((s) => s.gl.domElement.parentElement)
  const portal = useMemo(() => ({ current: parent as HTMLElement }), [parent])
  return (
    <Html position={[0, y, 0]} center portal={portal} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div
        className={[
          'flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-lg backdrop-blur-sm transition-colors duration-300 select-none',
          speaking
            ? 'border-amber-300 bg-amber-400/95 text-slate-950 shadow-amber-500/40'
            : 'border-white/15 bg-slate-950/70 text-white',
        ].join(' ')}
      >
        {speaking && (
          <span className="flex h-3 items-end gap-[2px]" aria-hidden>
            <span className="speak-bar h-full w-[3px] rounded bg-slate-950" />
            <span className="speak-bar h-full w-[3px] rounded bg-slate-950 [animation-delay:120ms]" />
            <span className="speak-bar h-full w-[3px] rounded bg-slate-950 [animation-delay:240ms]" />
          </span>
        )}
        {label}
      </div>
    </Html>
  )
}

/* ------------------------------------------------------------------ */
/* GLB personaj (Quaternius)                                            */
/* ------------------------------------------------------------------ */

function recolorMaterial(material: THREE.Material, map: Record<string, string>) {
  const mat = material.clone() as THREE.MeshStandardMaterial
  const tex = mat.map
  const image = tex?.image as CanvasImageSource & { width: number; height: number } | undefined
  if (!tex || !image || !image.width) return mat
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return mat
  ctx.drawImage(image, 0, 0)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = data.data
  const pairs = Object.entries(map).map(([from, to]) => [hexToRgb(from), hexToRgb(to)] as const)
  for (let i = 0; i < px.length; i += 4) {
    for (const [from, to] of pairs) {
      if (Math.abs(px[i] - from[0]) < 6 && Math.abs(px[i + 1] - from[1]) < 6 && Math.abs(px[i + 2] - from[2]) < 6) {
        px[i] = to[0]
        px[i + 1] = to[1]
        px[i + 2] = to[2]
        break
      }
    }
  }
  ctx.putImageData(data, 0, 0)
  const next = new THREE.CanvasTexture(canvas)
  next.flipY = tex.flipY
  next.colorSpace = tex.colorSpace
  next.magFilter = tex.magFilter
  next.minFilter = tex.minFilter
  next.wrapS = tex.wrapS
  next.wrapT = tex.wrapT
  next.generateMipmaps = tex.generateMipmaps
  mat.map = next
  return mat
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

interface BodyProps {
  id: SpeakerId
  speakingRef: React.RefObject<boolean>
}

function GlbBody({ id, speakingRef }: BodyProps) {
  const model = ASSETS.characters[id]!
  const seated = SPEAKERS[id].seated
  const gltf = useGLTF(model.url, DRACO_PATH)
  const root = useRef<THREE.Group>(null)

  const { object, scale, bones } = useMemo(() => {
    const obj = cloneSkinned(gltf.scene) as THREE.Object3D
    let part = -1
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        part++
        if (model.hideParts?.includes(part)) mesh.visible = false
        mesh.frustumCulled = false // skinlangan mesh animatsiyada kesilib qolmasin
        if (model.recolor) mesh.material = recolorMaterial(mesh.material as THREE.Material, model.recolor)
      }
    })
    obj.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(obj)
    const height = box.max.y - box.min.y
    const k = height > 0.01 ? model.height / height : 1
    return {
      object: obj,
      scale: k,
      bones: {
        head: obj.getObjectByName('Head') ?? null,
        neck: obj.getObjectByName('Neck') ?? null,
        armR: obj.getObjectByName('LowerArm.R') ?? null,
        armL: obj.getObjectByName('LowerArm.L') ?? null,
      },
    }
  }, [gltf.scene, model])

  const { actions } = useAnimations(gltf.animations, root)

  useEffect(() => {
    if (seated) {
      const sit = actions['SitDown']
      if (sit) {
        sit.reset()
        sit.setLoop(THREE.LoopOnce, 1)
        sit.clampWhenFinished = true
        sit.play()
        sit.time = sit.getClip().duration // darhol o'tirgan holat
        return () => {
          sit.stop()
        }
      }
    }
    const idle = actions['Idle']
    idle?.reset().play()
    return () => {
      idle?.stop()
    }
  }, [actions, seated])

  // Gapirish: boshni ohista qimirlatish va qo'l imosi (mixer yangilangandan keyin qo'shiladi)
  const amount = useRef(0)
  const phase = useMemo(() => [...id].reduce((n, c) => n + c.charCodeAt(0), 0) % 10, [id])
  useFrame((state, dt) => {
    amount.current = THREE.MathUtils.damp(amount.current, speakingRef.current ? 1 : 0, 6, Math.min(dt, 0.1))
    const a = amount.current
    if (a < 0.001) return
    const t = state.clock.elapsedTime + phase
    if (bones.head) {
      bones.head.rotation.x += Math.sin(t * 5.3) * 0.06 * a
      bones.head.rotation.y += Math.sin(t * 2.1) * 0.12 * a
      bones.head.rotation.z += Math.sin(t * 3.7) * 0.04 * a
    }
    if (bones.neck) bones.neck.rotation.x += Math.sin(t * 4.1 + 1) * 0.03 * a
    if (bones.armR) bones.armR.rotation.z += (Math.sin(t * 3.2) * 0.18 - 0.1) * a
    if (bones.armL) bones.armL.rotation.z += Math.sin(t * 2.6 + 2) * 0.08 * a
  })

  return (
    <group ref={root} scale={scale} position-y={seated ? GLB_SEAT_LIFT : 0}>
      <primitive object={object} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Placeholder: kapsula + bosh                                          */
/* ------------------------------------------------------------------ */

function PlaceholderBody({ id, speakingRef }: BodyProps) {
  const cfg = SPEAKERS[id]
  const head = useRef<THREE.Group>(null)
  const amount = useRef(0)
  const torsoY = cfg.seated ? 0.82 : 1.1
  const headY = torsoY + 0.55

  useFrame((state, dt) => {
    amount.current = THREE.MathUtils.damp(amount.current, speakingRef.current ? 1 : 0, 6, Math.min(dt, 0.1))
    if (!head.current) return
    const t = state.clock.elapsedTime
    head.current.rotation.x = Math.sin(t * 5.3) * 0.08 * amount.current
    head.current.rotation.y = Math.sin(t * 2.1) * 0.15 * amount.current
    head.current.position.y = headY + Math.sin(t * 1.3) * 0.005
  })

  return (
    <group>
      {!cfg.seated && (
        <>
          <mesh position={[-0.11, 0.45, 0]}>
            <capsuleGeometry args={[0.09, 0.7, 6, 12]} />
            <meshStandardMaterial color="#2a2c33" roughness={0.8} />
          </mesh>
          <mesh position={[0.11, 0.45, 0]}>
            <capsuleGeometry args={[0.09, 0.7, 6, 12]} />
            <meshStandardMaterial color="#2a2c33" roughness={0.8} />
          </mesh>
        </>
      )}
      <mesh position={[0, torsoY, 0]}>
        <capsuleGeometry args={[0.22, 0.4, 8, 20]} />
        <meshStandardMaterial color={cfg.body} roughness={0.75} />
      </mesh>
      {/* yoqa */}
      <mesh position={[0, torsoY + 0.36, 0.06]} rotation-x={0.35}>
        <torusGeometry args={[0.1, 0.03, 8, 20]} />
        <meshStandardMaterial color={cfg.accent} roughness={0.6} />
      </mesh>
      <group ref={head} position={[0, headY, 0]}>
        <mesh>
          <sphereGeometry args={[0.16, 24, 18]} />
          <meshStandardMaterial color="#d6a47c" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.05, -0.02]} scale={[1.05, 0.75, 1.05]}>
          <sphereGeometry args={[0.16, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#2b211c" roughness={0.9} />
        </mesh>
        <mesh position={[-0.055, 0.02, 0.145]}>
          <sphereGeometry args={[0.02, 8, 6]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
        <mesh position={[0.055, 0.02, 0.145]}>
          <sphereGeometry args={[0.02, 8, 6]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
      </group>
    </group>
  )
}
