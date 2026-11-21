import { RoundedBox, useGLTF, useTexture } from '@react-three/drei'
import { useMemo, type ReactNode } from 'react'
import * as THREE from 'three'
import { AssetBoundary } from './AssetBoundary'
import { ASSETS, DRACO_PATH, type PropConfig, type TextureSet } from './assets'
import { BENCH_HEIGHT, SPEAKERS, type SpeakerId, type Vec3 } from './layout'

// Zal o'lchamlari (metr)
const W = 14
const Z_BACK = -8
const Z_FRONT = 9
const D = Z_FRONT - Z_BACK
const H = 4.6

const COLORS = {
  wood: '#6d4428',
  woodTop: '#4a2c19',
  wall: '#e7dfd0',
  floor: '#9a6c47',
  ceiling: '#efe9de',
  cloth: '#1e4a3d',
  navy: '#1b2b47',
  gold: '#c9a24c',
  paper: '#f4f0e6',
  dark: '#1d1f24',
}

interface RoomMaterials {
  floor: THREE.Material
  wall: THREE.Material
  ceiling: THREE.Material
  wood: THREE.Material
  woodTop: THREE.Material
  cloth: THREE.Material
  navy: THREE.Material
  gold: THREE.Material
  paper: THREE.Material
  dark: THREE.Material
  flagBlue: THREE.Material
  flagWhite: THREE.Material
  flagGreen: THREE.Material
  flagRed: THREE.Material
}

interface LoadedTextures {
  floor?: { map: THREE.Texture; normalMap?: THREE.Texture }
  wall?: { map: THREE.Texture; normalMap?: THREE.Texture }
  wood?: { map: THREE.Texture; normalMap?: THREE.Texture }
}

function std(color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  // undefined qiymatlar three.js ogohlantirishini chiqarmasin
  const clean = Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined))
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...clean })
}

function useRoomMaterials(tex: LoadedTextures | null): RoomMaterials {
  return useMemo(() => {
    const t = tex ?? {}
    return {
      floor: std(t.floor ? '#ffffff' : COLORS.floor, {
        roughness: 0.55,
        map: t.floor?.map,
        normalMap: t.floor?.normalMap,
      }),
      wall: std(t.wall ? '#f4eee4' : COLORS.wall, { roughness: 0.9, map: t.wall?.map, normalMap: t.wall?.normalMap }),
      ceiling: std(COLORS.ceiling, { roughness: 0.95 }),
      wood: std(t.wood ? '#d9b496' : COLORS.wood, {
        roughness: 0.5,
        map: t.wood?.map,
        normalMap: t.wood?.normalMap,
      }),
      woodTop: std(t.wood ? '#8a6248' : COLORS.woodTop, { roughness: 0.35, map: t.wood?.map }),
      cloth: std(COLORS.cloth, { roughness: 0.95 }),
      navy: std(COLORS.navy, { roughness: 0.85 }),
      gold: std(COLORS.gold, { roughness: 0.3, metalness: 0.8 }),
      paper: std(COLORS.paper, { roughness: 0.9 }),
      dark: std(COLORS.dark, { roughness: 0.4, metalness: 0.2 }),
      flagBlue: std('#0099b5', { roughness: 0.9, side: THREE.DoubleSide }),
      flagWhite: std('#f7f7f2', { roughness: 0.9, side: THREE.DoubleSide }),
      flagGreen: std('#1eb53a', { roughness: 0.9, side: THREE.DoubleSide }),
      flagRed: std('#ce1126', { roughness: 0.9, side: THREE.DoubleSide }),
    }
  }, [tex])
}

/* ------------------------------------------------------------------ */
/* Kichik qurilish bloklari                                           */
/* ------------------------------------------------------------------ */

function Block({
  size,
  position,
  material,
  radius = 0.03,
  rotation,
}: {
  size: Vec3
  position: Vec3
  material: THREE.Material
  radius?: number
  rotation?: Vec3
}) {
  return (
    <RoundedBox
      args={size}
      radius={Math.min(radius, Math.min(...size) / 2 - 0.001)}
      smoothness={2}
      position={position}
      rotation={rotation}
      material={material}
    />
  )
}

function Slab({ size, position, material }: { size: Vec3; position: Vec3; material: THREE.Material }) {
  return (
    <mesh position={position} material={material}>
      <boxGeometry args={size} />
    </mesh>
  )
}

/** Uzun stol: oldi (+X yoki -X) tomonda yashil mato paneli */
function CounselTable({ position, facing, m }: { position: Vec3; facing: 1 | -1; m: RoomMaterials }) {
  const [x, , z] = position
  return (
    <group>
      <Block size={[0.78, 0.76, 2.2]} position={[x, 0.38, z]} material={m.wood} radius={0.04} />
      <Slab size={[0.9, 0.05, 2.35]} position={[x, 0.785, z]} material={m.woodTop} />
      <Slab size={[0.02, 0.48, 1.9]} position={[x + facing * 0.4, 0.4, z]} material={m.cloth} />
      {/* hujjatlar */}
      <Slab size={[0.24, 0.012, 0.32]} position={[x - facing * 0.12, 0.817, z + 0.35]} material={m.paper} />
      <Slab size={[0.26, 0.03, 0.34]} position={[x - facing * 0.1, 0.825, z - 0.4]} material={m.navy} />
    </group>
  )
}

function FallbackChair({ position, rotationY, tall, m }: { position: Vec3; rotationY: number; tall?: boolean; m: RoomMaterials }) {
  const backH = tall ? 1.15 : 0.55
  return (
    <group position={position} rotation-y={rotationY}>
      <Block size={[0.5, 0.08, 0.48]} position={[0, 0.46, 0]} material={tall ? m.navy : m.wood} radius={0.03} />
      <Block size={[0.5, backH, 0.07]} position={[0, 0.5 + backH / 2, -0.22]} material={tall ? m.navy : m.wood} radius={0.03} />
      <Slab size={[0.42, 0.42, 0.4]} position={[0, 0.21, 0]} material={m.woodTop} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Kod bilan yig'ilgan zal                                             */
/* ------------------------------------------------------------------ */

function Room({ m }: { m: RoomMaterials }) {
  const wit = SPEAKERS.witness
  const wFacing: [number, number] = [Math.sin(wit.rotationY), Math.cos(wit.rotationY)]
  const lectern: Vec3 = [wit.position[0] + wFacing[0] * 0.55, 0, wit.position[2] + wFacing[1] * 0.55]

  const benchRows = [5.3, 6.7, 8.1]
  const benchBlocks: { x: number; len: number }[] = [
    { x: -3.4, len: 4.4 },
    { x: 2.4, len: 2.8 },
  ]

  return (
    <group>
      {/* pol, shift, devorlar */}
      <Slab size={[W, 0.1, D]} position={[0, -0.05, (Z_BACK + Z_FRONT) / 2]} material={m.floor} />
      <Slab size={[W, 0.1, D]} position={[0, H + 0.05, (Z_BACK + Z_FRONT) / 2]} material={m.ceiling} />
      <Slab size={[W, H, 0.2]} position={[0, H / 2, Z_BACK - 0.1]} material={m.wall} />
      <Slab size={[W, H, 0.2]} position={[0, H / 2, Z_FRONT + 0.1]} material={m.wall} />
      <Slab size={[0.2, H, D]} position={[-W / 2 - 0.1, H / 2, (Z_BACK + Z_FRONT) / 2]} material={m.wall} />
      <Slab size={[0.2, H, D]} position={[W / 2 + 0.1, H / 2, (Z_BACK + Z_FRONT) / 2]} material={m.wall} />

      {/* yog'och pastki panel (lambri) va shift karnizi */}
      <Slab size={[0.06, 1.1, D]} position={[-W / 2 + 0.03, 0.55, (Z_BACK + Z_FRONT) / 2]} material={m.wood} />
      <Slab size={[0.06, 1.1, D]} position={[W / 2 - 0.03, 0.55, (Z_BACK + Z_FRONT) / 2]} material={m.wood} />
      <Slab size={[W, 1.1, 0.06]} position={[0, 0.55, Z_FRONT - 0.03]} material={m.wood} />
      <Slab size={[W, 1.1, 0.06]} position={[0, 0.55, Z_BACK + 0.03]} material={m.wood} />
      <Slab size={[W, 0.16, 0.12]} position={[0, H - 0.08, Z_BACK + 0.06]} material={m.wood} />
      <Slab size={[0.12, 0.16, D]} position={[-W / 2 + 0.06, H - 0.08, (Z_BACK + Z_FRONT) / 2]} material={m.wood} />
      <Slab size={[0.12, 0.16, D]} position={[W / 2 - 0.06, H - 0.08, (Z_BACK + Z_FRONT) / 2]} material={m.wood} />

      {/* raislik qiluvchi orqasidagi panel, gerb va bayroq */}
      <Block size={[7.2, 3.7, 0.14]} position={[0, BENCH_HEIGHT + 1.85, Z_BACK + 0.09]} material={m.wood} radius={0.05} />
      <Block size={[6.6, 3.2, 0.06]} position={[0, BENCH_HEIGHT + 1.85, Z_BACK + 0.17]} material={m.navy} radius={0.03} />
      <group position={[0, 3.45, Z_BACK + 0.22]} rotation-x={Math.PI / 2}>
        <mesh material={m.gold}>
          <cylinderGeometry args={[0.46, 0.46, 0.05, 48]} />
        </mesh>
        <mesh material={m.navy} position={[0, 0.03, 0]}>
          <cylinderGeometry args={[0.36, 0.36, 0.03, 48]} />
        </mesh>
        {/* sakkiz qirrali yulduz */}
        {[0, Math.PI / 4].map((a) => (
          <mesh key={a} material={m.gold} position={[0, 0.05, 0]} rotation-y={a}>
            <boxGeometry args={[0.3, 0.02, 0.3]} />
          </mesh>
        ))}
      </group>
      <Flag position={[-2.75, BENCH_HEIGHT, -7.45]} m={m} />

      {/* raislik qiluvchi minbari */}
      <Block size={[8.2, BENCH_HEIGHT, 2.9]} position={[0, BENCH_HEIGHT / 2, -6.65]} material={m.wood} radius={0.04} />
      <Block size={[1.4, 0.3, 0.45]} position={[3.4, 0.15, -5.0]} material={m.wood} radius={0.03} />
      <Block size={[6.2, 0.9, 0.8]} position={[0, BENCH_HEIGHT + 0.45, -5.75]} material={m.wood} radius={0.05} />
      <Slab size={[6.45, 0.06, 0.98]} position={[0, BENCH_HEIGHT + 0.93, -5.75]} material={m.woodTop} />
      {[-2.1, 0, 2.1].map((x) => (
        <Slab key={x} size={[1.7, 0.52, 0.02]} position={[x, BENCH_HEIGHT + 0.45, -5.34]} material={m.cloth} />
      ))}
      <mesh position={[0, BENCH_HEIGHT + 0.45, -5.32]} rotation-x={Math.PI / 2} material={m.gold}>
        <cylinderGeometry args={[0.13, 0.13, 0.02, 32]} />
      </mesh>
      {/* sudya stolidagi hujjatlar */}
      <Slab size={[0.4, 0.015, 0.3]} position={[0.55, BENCH_HEIGHT + 0.97, -5.85]} material={m.paper} />
      <Slab size={[0.32, 0.04, 0.24]} position={[-0.6, BENCH_HEIGHT + 0.98, -5.85]} material={m.navy} />

      {/* kotib stoli + noutbuk */}
      <Block size={[0.7, 0.76, 1.5]} position={[-4.4, 0.38, SPEAKERS.clerk.position[2]]} material={m.wood} radius={0.04} />
      <Slab size={[0.82, 0.05, 1.62]} position={[-4.4, 0.785, SPEAKERS.clerk.position[2]]} material={m.woodTop} />
      <Slab size={[0.26, 0.015, 0.36]} position={[-4.5, 0.82, SPEAKERS.clerk.position[2]]} material={m.dark} />
      <Slab
        size={[0.015, 0.24, 0.36]}
        position={[-4.38, 0.94, SPEAKERS.clerk.position[2]]}
        material={m.dark}
      />

      {/* prokuror va himoyachi stollari */}
      <CounselTable position={[-4.35, 0, SPEAKERS.prosecutor.position[2]]} facing={1} m={m} />
      <CounselTable position={[4.35, 0, -0.5]} facing={-1} m={m} />

      {/* guvoh minbari */}
      <group position={lectern} rotation-y={wit.rotationY}>
        <Block size={[0.85, 1.05, 0.42]} position={[0, 0.525, 0]} material={m.wood} radius={0.04} />
        <Slab size={[0.6, 0.6, 0.02]} position={[0, 0.55, 0.22]} material={m.cloth} />
        <mesh position={[0, 1.1, -0.02]} rotation-x={-0.25} material={m.woodTop}>
          <boxGeometry args={[0.95, 0.05, 0.5]} />
        </mesh>
      </group>
      <Block size={[1.3, 0.08, 1.3]} position={[wit.position[0] + 0.1, 0.04, wit.position[2] + 0.1]} material={m.woodTop} radius={0.03} />

      {/* sudlanuvchi o'rni: skameyka va past to'siq */}
      <Block size={[0.5, 0.45, 1.8]} position={[5.95, 0.225, 3.6]} material={m.wood} radius={0.04} />
      <Block size={[0.08, 0.7, 1.8]} position={[6.25, 0.75, 3.6]} material={m.wood} radius={0.03} />
      <Block size={[0.08, 1.0, 2.6]} position={[4.95, 0.5, 3.6]} material={m.wood} radius={0.03} />
      <Block size={[2.05, 1.0, 0.08]} position={[5.95, 0.5, 2.3]} material={m.wood} radius={0.03} />
      <Block size={[2.05, 1.0, 0.08]} position={[5.95, 0.5, 4.9]} material={m.wood} radius={0.03} />

      {/* zal va tinglovchilar orasidagi to'siq */}
      <Block size={[5.9, 0.95, 0.08]} position={[-4.05, 0.475, 4.4]} material={m.wood} radius={0.03} />
      <Block size={[2.9, 0.95, 0.08]} position={[2.55, 0.475, 4.4]} material={m.wood} radius={0.03} />

      {/* tinglovchilar skameykalari */}
      {benchRows.map((z) =>
        benchBlocks.map((b) => (
          <group key={`${z}-${b.x}`}>
            <Block size={[b.len, 0.07, 0.45]} position={[b.x, 0.45, z]} material={m.wood} radius={0.025} />
            <Block size={[b.len, 0.5, 0.06]} position={[b.x, 0.78, z + 0.22]} material={m.wood} radius={0.025} />
            <Slab size={[0.06, 0.42, 0.4]} position={[b.x - b.len / 2 + 0.1, 0.21, z]} material={m.woodTop} />
            <Slab size={[0.06, 0.42, 0.4]} position={[b.x + b.len / 2 - 0.1, 0.21, z]} material={m.woodTop} />
          </group>
        )),
      )}
    </group>
  )
}

function Flag({ position, m }: { position: Vec3; m: RoomMaterials }) {
  const w = 1.25
  const s = 0.2
  const r = 0.025
  return (
    <group position={position}>
      <mesh position={[0, 1.4, 0]} material={m.gold}>
        <cylinderGeometry args={[0.025, 0.035, 2.8, 12]} />
      </mesh>
      <mesh position={[0, 2.84, 0]} material={m.gold}>
        <sphereGeometry args={[0.06, 16, 12]} />
      </mesh>
      <group position={[w / 2 + 0.03, 2.35, 0]}>
        <Slab size={[w, s, 0.01]} position={[0, s + r, 0]} material={m.flagBlue} />
        <Slab size={[w, r, 0.01]} position={[0, s / 2 + r / 2, 0]} material={m.flagRed} />
        <Slab size={[w, s, 0.01]} position={[0, 0, 0]} material={m.flagWhite} />
        <Slab size={[w, r, 0.01]} position={[0, -s / 2 - r / 2, 0]} material={m.flagRed} />
        <Slab size={[w, s, 0.01]} position={[0, -s - r, 0]} material={m.flagGreen} />
        {/* yarim oy */}
        <mesh position={[-w / 2 + 0.17, s + r, 0.008]} material={m.flagWhite}>
          <circleGeometry args={[0.07, 24]} />
        </mesh>
        <mesh position={[-w / 2 + 0.195, s + r + 0.005, 0.01]} material={m.flagBlue}>
          <circleGeometry args={[0.062, 24]} />
        </mesh>
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Teksturalar                                                         */
/* ------------------------------------------------------------------ */

function prepTexture(src: THREE.Texture, repeat: [number, number], color: boolean) {
  const t = src.clone()
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat[0], repeat[1])
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = 4
  t.needsUpdate = true
  return t
}

function flatten(set: { floor: TextureSet; wood: TextureSet; wall: TextureSet }) {
  const urls: Record<string, string> = {}
  for (const key of ['floor', 'wood', 'wall'] as const) {
    urls[`${key}Map`] = set[key].map
    const n = set[key].normalMap
    if (n) urls[`${key}Normal`] = n
  }
  return urls
}

function TexturedRoom({ set }: { set: { floor: TextureSet; wood: TextureSet; wall: TextureSet } }) {
  const urls = useMemo(() => flatten(set), [set])
  const raw = useTexture(urls) as Record<string, THREE.Texture>
  const tex = useMemo<LoadedTextures>(() => {
    const pair = (key: string, repeat: [number, number]) => ({
      map: prepTexture(raw[`${key}Map`], repeat, true),
      normalMap: raw[`${key}Normal`] ? prepTexture(raw[`${key}Normal`], repeat, false) : undefined,
    })
    return { floor: pair('floor', [5, 6]), wall: pair('wall', [4, 1.4]), wood: pair('wood', [1.5, 1]) }
  }, [raw])
  const m = useRoomMaterials(tex)
  return (
    <>
      <Room m={m} />
      <Chairs m={m} />
    </>
  )
}

function PlainRoom() {
  const m = useRoomMaterials(null)
  return (
    <>
      <Room m={m} />
      <Chairs m={m} />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* GLB mebel                                                           */
/* ------------------------------------------------------------------ */

/** GLB ni o'lchamga moslab, polga qo'yib, markazlab qaytaradi */
function useFittedClone(url: string, axis: 'x' | 'y' | 'z', size: number) {
  const { scene } = useGLTF(url, DRACO_PATH)
  return useMemo(() => {
    const obj = scene.clone(true)
    obj.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(obj)
    const dims = box.getSize(new THREE.Vector3())
    const k = dims[axis] > 0 ? size / dims[axis] : 1
    obj.scale.multiplyScalar(k)
    obj.updateMatrixWorld(true)
    box.setFromObject(obj)
    const c = box.getCenter(new THREE.Vector3())
    obj.position.x -= c.x
    obj.position.z -= c.z
    obj.position.y -= box.min.y
    const wrapper = new THREE.Group()
    wrapper.add(obj)
    return wrapper
  }, [scene, axis, size])
}

function GlbProp({ config }: { config: PropConfig }) {
  const obj = useFittedClone(config.url, config.fit.axis, config.fit.size)
  return <primitive object={obj} position={config.position} rotation-y={config.rotationY ?? 0} />
}

function GlbChair({ url, height, position, rotationY }: { url: string; height: number; position: Vec3; rotationY: number }) {
  const obj = useFittedClone(url, 'y', height)
  return <primitive object={obj} position={position} rotation-y={rotationY} />
}

const CHAIR_SEATS: { id: SpeakerId | 'defense'; position: Vec3; rotationY: number }[] = [
  ...(['judge', 'prosecutor', 'clerk'] as const).map((id) => ({
    id,
    position: SPEAKERS[id].position,
    rotationY: SPEAKERS[id].rotationY,
  })),
  { id: 'defense', position: [5.05, 0, -0.5], rotationY: -Math.PI / 2 },
]

function Chairs({ m }: { m: RoomMaterials }) {
  const c = ASSETS.chairs
  return (
    <>
      {CHAIR_SEATS.map((s) => {
        const tall = s.id === 'judge'
        // stul suyanchig'i personaj orqasida bo'lishi uchun biroz orqaga suriladi
        const back = -0.12
        const pos: Vec3 = [
          s.position[0] + Math.sin(s.rotationY) * back,
          s.position[1],
          s.position[2] + Math.cos(s.rotationY) * back,
        ]
        const fallback = <FallbackChair position={pos} rotationY={s.rotationY} tall={tall} m={m} />
        return (
          <AssetBoundary key={s.id} name={`stul ${s.id}`} fallback={fallback}>
            <GlbChair
              url={tall ? c.judgeUrl : c.url}
              height={tall ? c.judgeHeight : c.height}
              position={pos}
              rotationY={s.rotationY}
            />
          </AssetBoundary>
        )
      })}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* To'liq zal GLB (keyin)                                              */
/* ------------------------------------------------------------------ */

function GlbCourt() {
  const cfg = ASSETS.court
  const { scene } = useGLTF(cfg.url as string, DRACO_PATH)
  return <primitive object={scene} position={cfg.position} rotation-y={cfg.rotationY} scale={cfg.scale} />
}

function CodeBuiltCourt() {
  const room: ReactNode = ASSETS.textures ? (
    <AssetBoundary name="teksturalar" fallback={<PlainRoom />}>
      <TexturedRoom set={ASSETS.textures} />
    </AssetBoundary>
  ) : (
    <PlainRoom />
  )
  return (
    <>
      {room}
      {ASSETS.props.map((p, i) => (
        <AssetBoundary key={`${p.url}-${i}`} name={p.url} fallback={null}>
          <GlbProp config={p} />
        </AssetBoundary>
      ))}
    </>
  )
}

/** Sud zali: GLB berilgan bo'lsa o'sha, aks holda (yoki xatoda) kod bilan yig'ilgan zal. */
export function Courtroom() {
  if (!ASSETS.court.url) return <CodeBuiltCourt />
  return (
    <AssetBoundary name="zal modeli" fallback={<CodeBuiltCourt />}>
      <GlbCourt />
    </AssetBoundary>
  )
}
