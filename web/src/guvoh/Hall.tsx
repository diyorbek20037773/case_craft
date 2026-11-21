// Sud zali — haqiqiy 3D geometriya (rasm/panorama emas): yong'oq panelli devorlar, parket, kesson shift,
// derazalar (quyosh nuri shu teshiklardan tushadi), ko'tarilgan supa, past to'siq. Ustiga: Meshy jihozlari (layout.ts PROPS),
// gerb va bayroq (props/Emblems), shisha kabina (props/GlassBooth), ekran (props/CourtScreen), skameykalar va shift
// chiroqlari (props/Instanced, instancing). Bir xil materialli bo'laklar bitta geometriyaga birlashtiriladi (kam draw call).
import { useGLTF, useTexture } from '@react-three/drei'
import { useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BARRIER, BENCHES, DAIS, LAMPS, PROPS, ROOM, STAND_ROT_Y, WITNESS_PLATFORM, type PropSpec } from './layout'
import { CourtScreen } from './props/CourtScreen'
import { Flag, Gerb } from './props/Emblems'
import { GlassBooth } from './props/GlassBooth'
import { InstancedProp, propUrl, type Placed } from './props/Instanced'
import type { Tier } from './Scene'

type MatKey = 'walnut' | 'walnutDark' | 'plaster' | 'marble' | 'brass' | 'leather' | 'frame' | 'sky'

const BENCH_ITEMS: Placed[] = BENCHES.map(([x, z]) => ({ pos: [x, 0, z], rotY: Math.PI }))
/** chiroq.glb tagi y=0, balandligi 0,216 — tepasi shiftga tegadi */
const LAMP_ITEMS: Placed[] = LAMPS.map(([x, z]) => ({ pos: [x, ROOM.height - 0.216, z], rotY: 0 }))
const lampTweak = (m: THREE.MeshStandardMaterial) => {
  // chiroq korpusi yorug' (o'zi nur sochadi) — bloom ushlaydi
  m.emissive = new THREE.Color('#ffe2b8')
  m.emissiveMap = m.map
  m.emissiveIntensity = 0.9
}

/** Tekstura zichligi doimiy bo'lishi uchun quti UV larini o'lchamga moslab cho'zadi (1 UV = `scale` metr) */
function box(w: number, h: number, d: number, scale = 1.2) {
  const g = new THREE.BoxGeometry(w, h, d)
  const uv = g.attributes.uv as THREE.BufferAttribute
  // BoxGeometry yuzlari tartibi: +x, -x, +y, -y, +z, -z (har biri 4 verteks)
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ]
  for (let f = 0; f < 6; f++)
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / scale, (uv.getY(k) * dims[f][1]) / scale)
    }
  return g
}

class Builder {
  parts = new Map<MatKey, THREE.BufferGeometry[]>()
  private m = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private e = new THREE.Euler()
  add(mat: MatKey, g: THREE.BufferGeometry, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0]) {
    this.q.setFromEuler(this.e.set(rot[0], rot[1], rot[2]))
    this.m.compose(new THREE.Vector3(...pos), this.q, new THREE.Vector3(1, 1, 1))
    const geo = g.index ? g.toNonIndexed() : g
    geo.applyMatrix4(this.m)
    // birlashtirish uchun atributlar bir xil bo'lsin
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k)
    if (!this.parts.has(mat)) this.parts.set(mat, [])
    this.parts.get(mat)!.push(geo)
  }
  /** Markazi pos, o'lchami size bo'lgan quti */
  box(mat: MatKey, pos: [number, number, number], size: [number, number, number], rotY = 0, scale = 1.2) {
    this.add(mat, box(size[0], size[1], size[2], scale), pos, [0, rotY, 0])
  }
}

/**
 * Devor bo'ylab panel (wainscot): pastki plintus, ramka va bo'rtma (raised) panellar.
 * Devor yuzasi lokal z=0 da; panellar +z tomonga chiqadi. Natijani transform bilan devorga qo'yamiz.
 */
function wainscot(b: Builder, length: number, height: number, place: (x: number, y: number, z: number) => [number, number, number], rotY: number, panelW = 0.95) {
  const n = Math.max(1, Math.round(length / panelW))
  const pw = length / n
  b.box('walnut', place(0, height / 2, 0.02), [length, height, 0.04], rotY)
  b.box('walnutDark', place(0, 0.09, 0.05), [length, 0.18, 0.06], rotY) // plintus
  b.box('walnutDark', place(0, height - 0.06, 0.06), [length, 0.12, 0.08], rotY) // yuqori karniz
  b.box('walnut', place(0, height - 0.15, 0.05), [length, 0.06, 0.05], rotY)
  b.box('walnut', place(0, 0.95, 0.05), [length, 0.07, 0.05], rotY) // o'rta reyka
  const rows: [number, number][] = [
    [0.22, 0.88],
    [1.02, height - 0.2],
  ]
  for (let i = 0; i < n; i++) {
    const cx = -length / 2 + pw * (i + 0.5)
    b.box('walnutDark', place(-length / 2 + pw * i, height / 2, 0.05), [0.07, height - 0.2, 0.05], rotY) // tik ustun
    for (const [y0, y1] of rows) {
      const h = y1 - y0 - 0.1
      if (h < 0.1) continue
      // ramka ichidagi bo'rtma panel (ikki qatlam — qirra soyasi uchun)
      b.box('walnut', place(cx, (y0 + y1) / 2, 0.05), [pw - 0.2, h, 0.03], rotY, 0.9)
      b.box('walnut', place(cx, (y0 + y1) / 2, 0.065), [pw - 0.32, h - 0.12, 0.03], rotY, 0.9)
    }
  }
  b.box('walnutDark', place(length / 2, height / 2, 0.05), [0.07, height - 0.2, 0.05], rotY)
}

function useHallTextures(mobile: boolean) {
  const sfx = mobile ? '-m' : ''
  const p = (n: string) => `/models/meshy/zal/${n}${sfx}.webp`
  const tex = useTexture({
    walnutMap: p('walnut_diff'),
    walnutNor: p('walnut_nor'),
    walnutRough: p('walnut_rough'),
    parquetMap: p('parquet_diff'),
    parquetNor: p('parquet_nor'),
    parquetRough: p('parquet_rough'),
    plasterMap: p('plaster_diff'),
    plasterNor: p('plaster_nor'),
    plasterRough: p('plaster_rough'),
    marbleMap: p('marble_diff'),
    marbleRough: p('marble_rough'),
  })
  useLayoutEffect(() => {
    for (const [k, t] of Object.entries(tex)) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.anisotropy = mobile ? 4 : 8
      t.colorSpace = k.endsWith('Map') ? THREE.SRGBColorSpace : THREE.NoColorSpace
      t.needsUpdate = true
    }
  }, [tex, mobile])
  return tex
}

export function Hall({ mobile, tier, stageName }: { mobile: boolean; tier: Tier; stageName: string }) {
  const tex = useHallTextures(mobile)

  const materials = useMemo(() => {
    // Standart PBR (clearcoat li Physical noutbuk iGPU da katta devor yuzalarida qimmat — farqi deyarli ko'rinmadi)
    const walnut = new THREE.MeshStandardMaterial({
      map: tex.walnutMap,
      normalMap: tex.walnutNor,
      roughnessMap: tex.walnutRough,
      color: new THREE.Color('#7a5236'),
      roughness: 0.75,
      normalScale: new THREE.Vector2(0.6, 0.6),
      envMapIntensity: 0.8,
    })
    const walnutDark = walnut.clone()
    walnutDark.color = new THREE.Color('#4a2e1c')
    return {
      walnut,
      walnutDark,
      plaster: new THREE.MeshStandardMaterial({
        map: tex.plasterMap,
        normalMap: tex.plasterNor,
        roughnessMap: tex.plasterRough,
        color: new THREE.Color('#efe3cf'),
        normalScale: new THREE.Vector2(0.5, 0.5),
        envMapIntensity: 0.6,
      }),
      marble: new THREE.MeshStandardMaterial({ map: tex.marbleMap, roughnessMap: tex.marbleRough, color: '#e9e4dc', roughness: 0.5, envMapIntensity: 0.8 }),
      brass: new THREE.MeshStandardMaterial({ color: '#c79a4a', metalness: 1, roughness: 0.32 }),
      leather: new THREE.MeshStandardMaterial({ color: '#3b1f17', roughness: 0.55, envMapIntensity: 0.7 }),
      frame: new THREE.MeshStandardMaterial({ color: '#efe8dc', roughness: 0.55 }),
      // deraza ortidagi yorug' osmon: tone mapping siz, bloom ushlaydi
      sky: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.75, 3.0), toneMapped: false }),
      floor: new THREE.MeshStandardMaterial({
        map: tex.parquetMap,
        normalMap: tex.parquetNor,
        roughnessMap: tex.parquetRough,
        color: new THREE.Color('#b58a66'),
        normalScale: new THREE.Vector2(0.7, 0.7),
        envMapIntensity: 0.7,
      }),
    } satisfies Record<MatKey | 'floor', THREE.Material>
  }, [tex, mobile])

  // Parket teksturasi zalga moslab takrorlanadi (alohida nusxa — boshqa materiallarga ta'sir qilmasin)
  useLayoutEffect(() => {
    const W = ROOM.xMax - ROOM.xMin
    const D = ROOM.zFront - ROOM.zBack
    for (const k of ['map', 'normalMap', 'roughnessMap'] as const) {
      const t = materials.floor[k]
      if (t) {
        const c = t.clone()
        c.repeat.set(W / 2.2, D / 2.2)
        c.needsUpdate = true
        materials.floor[k] = c
      }
    }
    materials.floor.needsUpdate = true
  }, [materials])

  const merged = useMemo(() => {
    const b = new Builder()
    const { xMin, xMax, zBack, zFront, height: H, wainscot: WH } = ROOM
    const W = xMax - xMin
    const cx = (xMin + xMax) / 2

    // ---- Orqa devor (z = zBack) ----
    wainscot(b, W, WH, (x, y, z) => [cx + x, y, zBack + z], 0)
    b.box('plaster', [cx, (WH + H) / 2, zBack - 0.05], [W, H - WH, 0.1], 0, 2.5)
    // pilyastrlar (tik yog'och ustunlar) — zalga salobat
    for (const px of [-3.45, -2.05, 2.6]) {
      b.box('walnutDark', [px, H / 2, zBack + 0.1], [0.34, H, 0.2])
      b.box('walnut', [px, H / 2, zBack + 0.21], [0.24, H - 0.6, 0.04])
      b.box('walnutDark', [px, 0.15, zBack + 0.13], [0.42, 0.3, 0.26])
    }
    // karniz (shift ostida)
    b.box('walnutDark', [cx, H - 0.12, zBack + 0.1], [W, 0.24, 0.22])
    b.box('walnut', [cx, H - 0.3, zBack + 0.06], [W, 0.08, 0.12])

    // ---- Chap devor (x = xMin), ikki baland deraza ----
    const winZ = [-1.55, 1.55]
    const winW = 1.5
    const sill = 1.05
    const top = 3.75
    const T = 0.45 // devor qalinligi (deraza chuqurligi)
    const wx = xMin - T / 2
    // derazalar orasidagi va chetidagi devor bo'laklari
    const zs = [zBack, winZ[0] - winW / 2, winZ[0] + winW / 2, winZ[1] - winW / 2, winZ[1] + winW / 2, zFront]
    for (let i = 0; i < zs.length - 1; i += 2) {
      const z0 = zs[i]
      const z1 = zs[i + 1]
      b.box('plaster', [wx, H / 2, (z0 + z1) / 2], [T, H, z1 - z0], 0, 2.5)
    }
    for (const z of winZ) {
      b.box('plaster', [wx, sill / 2, z], [T, sill, winW], 0, 2.5) // deraza osti
      b.box('plaster', [wx, (top + H) / 2, z], [T, H - top, winW], 0, 2.5) // tepasi
      // marmar tokcha
      b.box('marble', [xMin + 0.02, sill - 0.03, z], [0.16, 0.06, winW + 0.14], 0, 1.5)
      // rom: tashqi ramka + kesishgan to'sinlar
      const fx = xMin - T + 0.08
      b.box('frame', [fx, (sill + top) / 2, z - winW / 2 + 0.04], [0.1, top - sill, 0.08])
      b.box('frame', [fx, (sill + top) / 2, z + winW / 2 - 0.04], [0.1, top - sill, 0.08])
      b.box('frame', [fx, sill + 0.04, z], [0.1, 0.08, winW])
      b.box('frame', [fx, top - 0.04, z], [0.1, 0.08, winW])
      b.box('frame', [fx, (sill + top) / 2, z], [0.07, top - sill, 0.05])
      for (const y of [sill + (top - sill) * 0.36, sill + (top - sill) * 0.72]) b.box('frame', [fx, y, z], [0.07, 0.05, winW])
      // shisha ortidagi yorug'lik (soya bermaydi — alohida mesh)
      b.box('sky', [xMin - T - 0.05, (sill + top) / 2, z], [0.02, top - sill, winW])
      // deraza yonidagi og'ir pardalar uchun yog'och karniz
      b.box('walnutDark', [xMin + 0.08, top + 0.18, z], [0.1, 0.1, winW + 0.6])
    }
    // chap devor pastki paneli (derazalar ostida)
    wainscot(b, zFront - zBack, 1.0, (x, y, z) => [xMin + z, y, (zBack + zFront) / 2 - x], Math.PI / 2, 0.9)

    // ---- O'ng devor (x = xMax): to'liq panel + plaster (eshik — Meshy eshik.glb, layout.ts PROPS) ----
    const D = zFront - zBack
    wainscot(b, D, WH, (x, y, z) => [xMax - z, y, (zBack + zFront) / 2 + x], -Math.PI / 2)
    b.box('plaster', [xMax + 0.05, (WH + H) / 2, (zBack + zFront) / 2], [0.1, H - WH, D], 0, 2.5)
    b.box('walnutDark', [xMax - 0.1, H - 0.12, (zBack + zFront) / 2], [0.22, 0.24, D])
    // ---- Old devor (kamera ortida) ----
    b.box('plaster', [cx, H / 2, zFront + 0.05], [W, H, 0.1], 0, 2.5)

    // ---- Shift: plaster + yog'och kesson to'sinlari ----
    b.box('plaster', [cx, H + 0.05, (zBack + zFront) / 2], [W, 0.1, D], 0, 2.5)
    for (let x = xMin + 1.15; x < xMax - 0.5; x += 1.85) b.box('walnutDark', [x, H - 0.14, (zBack + zFront) / 2], [0.24, 0.28, D])
    for (let z = zBack + 1.6; z < zFront - 0.5; z += 2.0) b.box('walnutDark', [cx, H - 0.1, z], [W, 0.2, 0.18])
    // ---- Sudya supasi (stol — Meshy prop, layout.ts PROPS) ----
    const dcx = (DAIS.x0 + DAIS.x1) / 2
    const dw = DAIS.x1 - DAIS.x0
    const dd = DAIS.z1 - DAIS.z0
    const dz = (DAIS.z0 + DAIS.z1) / 2
    b.box('walnutDark', [dcx, DAIS.h / 2, dz], [dw, DAIS.h, dd])
    // old yuzadagi bo'rtma panellar
    const np = 5
    for (let i = 0; i < np; i++) {
      const px = DAIS.x0 + dw * ((i + 0.5) / np)
      b.box('walnut', [px, DAIS.h * 0.5, DAIS.z1 + 0.012], [dw / np - 0.12, DAIS.h - 0.14, 0.025], 0, 0.9)
    }
    // marmar qirra (supa usti) va zinapoya
    b.box('marble', [dcx, DAIS.h + 0.015, dz], [dw + 0.06, 0.03, dd + 0.06], 0, 1.4)
    b.box('walnutDark', [dcx, DAIS.h / 4, DAIS.z1 + 0.22], [dw * 0.5, DAIS.h / 2, 0.44])
    b.box('marble', [dcx, DAIS.h / 2 + 0.01, DAIS.z1 + 0.22], [dw * 0.5 + 0.04, 0.02, 0.46], 0, 1.4)

    // ---- Past to'siq (barerka): ishtirokchilar va jamoatchilik orasida, o'rtada yo'lak ----
    for (const [a, c] of BARRIER.segments) {
      const L = c - a
      const mx = (a + c) / 2
      b.box('walnutDark', [mx, BARRIER.h - 0.03, BARRIER.z], [L, 0.06, 0.1]) // tutqich
      b.box('walnut', [mx, BARRIER.h / 2, BARRIER.z], [L, BARRIER.h - 0.14, 0.035], 0, 0.9) // panel
      b.box('walnutDark', [mx, 0.05, BARRIER.z], [L, 0.1, 0.07]) // plintus
      const n = Math.max(1, Math.round(L / 1.1))
      for (let i = 0; i <= n; i++) b.box('walnutDark', [a + (L * i) / n, BARRIER.h / 2, BARRIER.z], [0.08, BARRIER.h, 0.08])
    }

    // ---- Guvoh supachasi (minbar ostida, yengil ko'tarilgan) ----
    b.box('walnutDark', [WITNESS_PLATFORM.x, 0.05, WITNESS_PLATFORM.z], [1.3, 0.1, 1.4], STAND_ROT_Y)
    b.box('walnut', [WITNESS_PLATFORM.x, 0.105, WITNESS_PLATFORM.z], [1.26, 0.012, 1.36], STAND_ROT_Y)

    const out: { key: MatKey; geo: THREE.BufferGeometry }[] = []
    for (const [key, geos] of b.parts) {
      const geo = mergeGeometries(geos, false)
      if (geo) {
        geo.computeBoundingSphere()
        out.push({ key, geo })
      }
      for (const g of geos) g.dispose()
    }
    return out
  }, [])

  useLayoutEffect(() => () => merged.forEach((m) => m.geo.dispose()), [merged])

  const W = ROOM.xMax - ROOM.xMin
  const D = ROOM.zFront - ROOM.zBack

  return (
    <group>
      {/* Parket pol */}
      <mesh rotation-x={-Math.PI / 2} position={[(ROOM.xMin + ROOM.xMax) / 2, 0, (ROOM.zBack + ROOM.zFront) / 2]} receiveShadow material={materials.floor}>
        <planeGeometry args={[W, D]} />
      </mesh>
      {merged.map(({ key, geo }) => (
        <mesh
          key={key}
          geometry={geo}
          material={materials[key]}
          castShadow={key !== 'sky'}
          receiveShadow={key !== 'sky'}
        />
      ))}
      <Gerb mobile={mobile} />
      <Flag animate={tier > 0} />
      <GlassBooth tier={tier} />
      {/* uzoqdagi takroriy jihozlar — doim 1024 teksturali fayl (GPU xotira, layout.ts PropSpec.hq) */}
      <CourtScreen mobile stageName={stageName} />
      <InstancedProp name="skameyka" mobile items={BENCH_ITEMS} />
      <InstancedProp name="chiroq" mobile items={LAMP_ITEMS} castShadow={false} tweak={lampTweak} />
      {/* chiroq tagidagi yorug' disk (opal shisha) */}
      {LAMPS.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, ROOM.height - 0.222, z]} rotation-x={Math.PI / 2}>
          <circleGeometry args={[0.4, 40]} />
          <meshBasicMaterial color={[2.1, 1.95, 1.7]} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <Furniture mobile={mobile} />
    </group>
  )
}

/** Meshy jihozlari (layout.ts PROPS) */
function MeshyProp({ spec, mobile }: { spec: PropSpec; mobile: boolean }) {
  const gltf = useGLTF(propUrl(spec.name, mobile || !spec.hq), false, true)
  const obj = useMemo(() => {
    const c = gltf.scene.clone(true)
    c.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.castShadow = !!spec.shadow
        m.receiveShadow = true
        const mat = m.material as THREE.MeshStandardMaterial
        // Meshy "BakedMaterial" metallic=1 omili yog'ochni metalldek yaltiratmasin
        mat.metalness = Math.min(mat.metalness, 0.2)
        mat.envMapIntensity = 0.85
      }
    })
    return c
  }, [gltf.scene, spec.shadow])
  return <primitive object={obj} name={`prop-${spec.name}`} position={spec.pos} rotation-y={spec.rotY} scale={spec.scale ?? 1} />
}

/** Meshy jihozlari (stollar, minbar, sudlanuvchi o'rni, eshik) */
function Furniture({ mobile }: { mobile: boolean }) {
  return (
    <group>
      {PROPS.filter((p) => p.enabled).map((p) => (
        <MeshyProp key={p.name} spec={p} mobile={mobile} />
      ))}
    </group>
  )
}
