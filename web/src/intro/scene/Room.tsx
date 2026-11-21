// Kirish zali: tantanali, iliq. Yaltiroq parket pol, yo'lak bo'ylab navy gilam, yong'oq panelli devorlar va bra
// chiroqlar, tepada plaster, supadagi sudya stoli. Bir xil materialli bo'laklar bitta geometriyaga birlashtiriladi
// (kam draw call). Teksturalar: /models/meshy/zal (lite — "-m" mobil variantlari).
import { useGLTF, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { getState } from '../state'
import { propUrl, texUrl } from './assets'
import { ModelBoundary } from './Boundary'
import { BENCH_POS, CARPET, DAIS, PLAQUE, ROOM, SCONCES } from './layout'
import { live, reducedMotion } from './live'

type MatKey = 'walnut' | 'walnutDark' | 'plaster' | 'ceiling' | 'marble' | 'gold' | 'shade'
type V3 = [number, number, number]

/** Tekstura zichligi doimiy bo'lsin: quti UV lari o'lchamga moslab cho'ziladi (1 UV = scale metr) */
function box(w: number, h: number, d: number, scale = 1.2) {
  const g = new THREE.BoxGeometry(w, h, d)
  const uv = g.attributes.uv as THREE.BufferAttribute
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
  add(mat: MatKey, g: THREE.BufferGeometry, pos: V3, rot: V3 = [0, 0, 0]) {
    this.q.setFromEuler(this.e.set(rot[0], rot[1], rot[2]))
    this.m.compose(new THREE.Vector3(...pos), this.q, new THREE.Vector3(1, 1, 1))
    const geo = g.index ? g.toNonIndexed() : g
    geo.applyMatrix4(this.m)
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k)
    if (!this.parts.has(mat)) this.parts.set(mat, [])
    this.parts.get(mat)!.push(geo)
  }
  box(mat: MatKey, pos: V3, size: V3, rotY = 0, scale = 1.2) {
    this.add(mat, box(size[0], size[1], size[2], scale), pos, [0, rotY, 0])
  }
}

/** Devor paneli (wainscot): plintus, karniz, bo'rtma panellar. Devor yuzasi lokal z=0, panellar +z ga chiqadi. */
function wainscot(b: Builder, length: number, height: number, place: (x: number, y: number, z: number) => V3, rotY: number, panelW = 1.0) {
  const n = Math.max(1, Math.round(length / panelW))
  const pw = length / n
  b.box('walnut', place(0, height / 2, 0.02), [length, height, 0.04], rotY)
  b.box('walnutDark', place(0, 0.09, 0.05), [length, 0.18, 0.06], rotY)
  b.box('walnutDark', place(0, height - 0.06, 0.06), [length, 0.12, 0.08], rotY)
  b.box('walnut', place(0, 0.95, 0.05), [length, 0.07, 0.05], rotY)
  const rows: [number, number][] = [
    [0.22, 0.88],
    [1.02, height - 0.2],
  ]
  for (let i = 0; i < n; i++) {
    const cx = -length / 2 + pw * (i + 0.5)
    b.box('walnutDark', place(-length / 2 + pw * i, height / 2, 0.05), [0.07, height - 0.2, 0.05], rotY)
    for (const [y0, y1] of rows) {
      const h = y1 - y0 - 0.1
      if (h < 0.1) continue
      b.box('walnut', place(cx, (y0 + y1) / 2, 0.05), [pw - 0.2, h, 0.03], rotY, 0.9)
      b.box('walnut', place(cx, (y0 + y1) / 2, 0.065), [pw - 0.32, h - 0.12, 0.03], rotY, 0.9)
    }
  }
  b.box('walnutDark', place(length / 2, height / 2, 0.05), [0.07, height - 0.2, 0.05], rotY)
}

/** mobile — "-m" teksturalar (sessiya boshida bir marta aniqlanadi; sifat pasayganda qayta yuklanmaydi) */
function useRoomTextures(mobile: boolean) {
  const tex = useTexture({
    walnutMap: texUrl('walnut_diff', mobile),
    walnutNor: texUrl('walnut_nor', mobile),
    walnutRough: texUrl('walnut_rough', mobile),
    parquetMap: texUrl('parquet_diff', mobile),
    parquetNor: texUrl('parquet_nor', mobile),
    parquetRough: texUrl('parquet_rough', mobile),
    plasterMap: texUrl('plaster_diff', mobile),
    plasterNor: texUrl('plaster_nor', mobile),
    marbleMap: texUrl('marble_diff', mobile),
  })
  useLayoutEffect(() => {
    for (const [k, t] of Object.entries(tex)) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.anisotropy = mobile ? 2 : 8
      t.colorSpace = k.endsWith('Map') ? THREE.SRGBColorSpace : THREE.NoColorSpace
      t.needsUpdate = true
    }
  }, [tex, mobile])
  return tex
}

/** lite — arzon materiallar (normal xaritasiz); mobile — kichik teksturalar */
export function Room({ lite, mobile }: { lite: boolean; mobile: boolean }) {
  const tex = useRoomTextures(mobile)

  const materials = useMemo(() => {
    const walnut = new THREE.MeshStandardMaterial({
      map: tex.walnutMap,
      normalMap: lite ? null : tex.walnutNor,
      roughnessMap: tex.walnutRough,
      color: new THREE.Color('#6e4a31'),
      roughness: 0.7,
      normalScale: new THREE.Vector2(0.6, 0.6),
      envMapIntensity: 0.6,
    })
    const walnutDark = walnut.clone()
    walnutDark.color = new THREE.Color('#3e2617')
    const plaster = new THREE.MeshStandardMaterial({
      map: tex.plasterMap,
      normalMap: lite ? null : tex.plasterNor,
      color: new THREE.Color('#b9ad99'),
      roughness: 0.92,
      normalScale: new THREE.Vector2(0.4, 0.4),
      envMapIntensity: 0.4,
    })
    const ceiling = plaster.clone()
    ceiling.color = new THREE.Color('#4a4438')
    return {
      walnut,
      walnutDark,
      plaster,
      ceiling,
      marble: new THREE.MeshStandardMaterial({ map: tex.marbleMap, color: '#d9d2c6', roughness: 0.45, envMapIntensity: 0.7 }),
      gold: new THREE.MeshStandardMaterial({ color: '#c9a45c', metalness: 1, roughness: 0.3, envMapIntensity: 1.2 }),
      // bra abajuri: ichidan yonayotgan iliq mato (tone mapping bilan — oq kvadrat emas, amber)
      shade: new THREE.MeshStandardMaterial({
        color: '#e9cf9f',
        emissive: new THREE.Color('#ffb25e'),
        emissiveIntensity: 1.7,
        roughness: 0.9,
        side: THREE.DoubleSide,
        envMapIntensity: 0.2,
      }),
      // roughness roughnessMap ni ko'paytiradi: <1 — spot va bra nurlari parketda yaltiraydi (konseptdagi yaltiroq pol)
      // parket takrorlanishi zalga moslab — alohida nusxalar (boshqa materiallarga ta'sir qilmasin; cleanup da dispose)
      floor: new THREE.MeshStandardMaterial({
        map: floorTex(tex.parquetMap, true, mobile),
        normalMap: lite ? null : floorTex(tex.parquetNor, false, mobile),
        roughnessMap: floorTex(tex.parquetRough, false, mobile),
        roughness: 0.62,
        color: new THREE.Color('#9c7756'),
        normalScale: new THREE.Vector2(0.7, 0.7),
        envMapIntensity: 0.85,
      }),
    } satisfies Record<MatKey | 'floor', THREE.Material>
  }, [tex, lite, mobile])

  // materiallar va parket tekstura nusxalari (keshdagi asl teksturalar emas) almashganda/unmountda bo'shatiladi.
  // Avval nusxalar layout-effektda yaratilib, dispose qilinmas edi — har lite almashuvida GPU teksturasi oqardi.
  useEffect(
    () => () => {
      for (const m of Object.values(materials)) m.dispose()
      for (const k of ['map', 'normalMap', 'roughnessMap'] as const) materials.floor[k]?.dispose()
    },
    [materials],
  )

  const merged = useMemo(() => {
    const b = new Builder()
    const { xMin, xMax, zBack, zFront, height: H, wainscot: WH } = ROOM
    const W = xMax - xMin
    const D = zFront - zBack
    const cz = (zBack + zFront) / 2

    // ---- Orqa devor ----
    wainscot(b, W, WH, (x, y, z) => [x, y, zBack + z], 0)
    b.box('plaster', [0, (WH + H) / 2, zBack - 0.05], [W, H - WH, 0.1], 0, 2.5)
    for (const px of [-4.3, -2.7, 2.7, 4.3]) {
      b.box('walnutDark', [px, H / 2, zBack + 0.11], [0.36, H, 0.22])
      b.box('walnut', [px, H / 2, zBack + 0.23], [0.24, H - 0.7, 0.04])
      b.box('walnutDark', [px, 0.16, zBack + 0.14], [0.44, 0.32, 0.28])
    }
    b.box('walnutDark', [0, H - 0.13, zBack + 0.11], [W, 0.26, 0.22])
    b.box('walnut', [0, H - 0.32, zBack + 0.07], [W, 0.08, 0.14])
    // gerb ramkasi — alohida <Plaque/> (rejim/lobbida yashiriladi)

    // ---- Yon devorlar: panel + plaster + pilyastrlar + devor chiroqlari ----
    for (const side of [-1, 1] as const) {
      const x = side < 0 ? xMin : xMax
      const rot = side < 0 ? Math.PI / 2 : -Math.PI / 2
      wainscot(b, D, WH, (lx, y, lz) => [x - side * lz, y, cz + (side < 0 ? -lx : lx)], rot)
      b.box('plaster', [x + side * 0.05, (WH + H) / 2, cz], [0.1, H - WH, D], 0, 2.5)
      b.box('walnutDark', [x - side * 0.11, H - 0.13, cz], [0.22, 0.26, D])
      for (let z = zBack + 2.4; z < zFront - 0.5; z += 3.2) {
        b.box('walnutDark', [x - side * 0.1, H / 2, z], [0.2, H, 0.36])
        b.box('walnut', [x - side * 0.21, H / 2, z], [0.04, H - 0.7, 0.24])
      }
    }
    // ---- Devor chiroqlari (bra): yong'oq taglik, oltin tirgak va kosa, mato abajur ----
    for (const { pos, n } of SCONCES) {
      const rotY = Math.atan2(n.x, n.z) // lokal +z -> devordan zalga
      const at = (out: number, dy: number): V3 => [pos.x + n.x * out, pos.y + dy, pos.z + n.z * out]
      b.box('walnutDark', at(0.1, -0.06), [0.2, 0.44, 0.04], rotY)
      b.box('gold', at(0.125, -0.06), [0.07, 0.07, 0.015], rotY)
      b.box('gold', at(0.19, -0.15), [0.025, 0.025, 0.15], rotY)
      b.add('gold', new THREE.CylinderGeometry(0.04, 0.02, 0.05, 16), at(0.26, -0.12))
      b.add('shade', new THREE.CylinderGeometry(0.06, 0.1, 0.17, 24, 1, true), at(0.26, 0))
    }

    // ---- Shift: to'q plaster + yog'och to'sinlar ----
    b.box('ceiling', [0, H + 0.05, cz], [W, 0.1, D], 0, 2.5)
    for (let z = zBack + 1.8; z < zFront - 0.5; z += 2.4) b.box('walnutDark', [0, H - 0.1, z], [W, 0.2, 0.2])
    for (const x of [-3.3, 3.3]) b.box('walnutDark', [x, H - 0.12, cz], [0.24, 0.24, D])

    // ---- Sudya supasi ----
    const dw = DAIS.x1 - DAIS.x0
    const dd = DAIS.z1 - DAIS.z0
    const dcx = (DAIS.x0 + DAIS.x1) / 2
    const dz = (DAIS.z0 + DAIS.z1) / 2
    b.box('walnutDark', [dcx, DAIS.h / 2, dz], [dw, DAIS.h, dd])
    const np = 5
    for (let i = 0; i < np; i++) {
      const px = DAIS.x0 + dw * ((i + 0.5) / np)
      b.box('walnut', [px, DAIS.h * 0.5, DAIS.z1 + 0.012], [dw / np - 0.12, DAIS.h - 0.14, 0.025], 0, 0.9)
    }
    b.box('marble', [dcx, DAIS.h + 0.015, dz], [dw + 0.06, 0.03, dd + 0.06], 0, 1.4)
    b.box('walnutDark', [dcx, 0.1, DAIS.z1 + 0.24], [dw * 0.45, 0.2, 0.48])
    b.box('marble', [dcx, 0.21, DAIS.z1 + 0.24], [dw * 0.45 + 0.04, 0.02, 0.5], 0, 1.4)

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

  // zal ko'rindi — titul chiroqlarining yonish ketma-ketligi shundan boshlanadi (Lights.useIgnition)
  useLayoutEffect(() => {
    if (!live.roomReadyAt) live.roomReadyAt = performance.now()
  }, [])

  // bra abajurlari tashqi bosqich bilan yonadi
  useFrame(() => {
    materials.shade.emissiveIntensity = 1.7 * (0.04 + 0.96 * live.ignite[0])
  })

  const W = ROOM.xMax - ROOM.xMin
  const D = ROOM.zFront - ROOM.zBack

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, (ROOM.zBack + ROOM.zFront) / 2]} material={materials.floor} raycast={() => null}>
        <planeGeometry args={[W, D]} />
      </mesh>
      {merged.map(({ key, geo }) => (
        <mesh key={key} geometry={geo} material={materials[key]} raycast={() => null} />
      ))}
      <Carpet mobile={mobile} />
      <SconceGlow lite={lite} />
      <Plaque gold={materials.gold} />
    </group>
  )
}

// ---------- Yo'lak gilami: navy, oltin hoshiya va 8 qirrali yulduzlar (CanvasTexture, fayl kerak emas) ----------
/** tekstura bir takrorlanishi (m) — 256×1024 px, 1.7 m kenglik */
const CARPET_TILE_M = 6.8

/** Parket teksturasining zalga moslangan nusxasi (manba rasm umumiy; GPU da alohida tekstura) */
function floorTex(t: THREE.Texture, color: boolean, mobile: boolean) {
  const c = t.clone()
  // useMemo render paytida ishlaydi — useRoomTextures layout-effekti hali qo'llanmagan bo'lishi mumkin: sozlamalar shu yerda
  c.wrapS = c.wrapT = THREE.RepeatWrapping
  c.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace
  c.anisotropy = mobile ? 2 : 8
  c.repeat.set((ROOM.xMax - ROOM.xMin) / 2.2, (ROOM.zFront - ROOM.zBack) / 2.2)
  c.needsUpdate = true
  return c
}

/** 8 qirrali yulduz: ikki 45° burilgan kvadrat (CaseCraft motivi) */
function star8(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath()
  for (const a0 of [0, Math.PI / 4]) {
    for (let i = 0; i < 4; i++) {
      const a = a0 + Math.PI / 4 + (i * Math.PI) / 2
      const px = x + Math.cos(a) * r
      const py = y + Math.sin(a) * r
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
  }
  ctx.fill('nonzero')
}

function makeCarpetTexture(mobile: boolean) {
  const W = 256
  const H = 1024
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#16244a'
  ctx.fillRect(0, 0, W, H)
  // ichki maydon: juda xira oltin romb to'r (64 px qadam — tekstura chokida uzilmaydi)
  ctx.strokeStyle = 'rgba(201,164,92,0.10)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let k = -H; k < W + H; k += 64) {
    ctx.moveTo(k, 0)
    ctx.lineTo(k + H, H)
    ctx.moveTo(k, 0)
    ctx.lineTo(k - H, H)
  }
  ctx.stroke()
  // romblar markazida mayda yulduzlar
  ctx.fillStyle = 'rgba(201,164,92,0.16)'
  for (let y = 32; y < H; y += 64) for (let x = 64; x < W - 40; x += 64) star8(ctx, x, y, 5)
  // to'qima: mayda tasodifiy chiziqchalar (deterministik — har yuklashda bir xil)
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.09)'
    ctx.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H), 1, 2)
  }
  // hoshiya (ikki tomonda ko'zgu)
  for (const side of [0, 1]) {
    const X = (x: number, w: number) => (side === 0 ? x : W - x - w)
    ctx.fillStyle = '#0c1530'
    ctx.fillRect(X(0, 12), 0, 12, H)
    ctx.fillStyle = 'rgba(201,164,92,0.92)'
    ctx.fillRect(X(12, 3), 0, 3, H)
    ctx.fillStyle = '#0f1a38'
    ctx.fillRect(X(15, 24), 0, 24, H)
    ctx.fillStyle = 'rgba(201,164,92,0.7)'
    ctx.fillRect(X(39, 2), 0, 2, H)
    // bordyur ichida yulduz + nuqta navbati
    const cx = side === 0 ? 27 : W - 27
    for (let y = 0; y < H; y += 64) {
      ctx.fillStyle = 'rgba(214,178,104,0.85)'
      star8(ctx, cx, y + 32, 8)
      ctx.fillStyle = '#0f1a38'
      ctx.beginPath()
      ctx.arc(cx, y + 32, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(214,178,104,0.7)'
      ctx.beginPath()
      ctx.arc(cx, y, 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.ClampToEdgeWrapping
  t.wrapT = THREE.RepeatWrapping
  t.anisotropy = mobile ? 4 : 8
  return t
}

/** mobile ga bog'liq (sessiyada o'zgarmaydi) — sifat pasayganda 5000 chiziqli kanvas qayta chizilmaydi */
function Carpet({ mobile }: { mobile: boolean }) {
  const len = CARPET.z1 - CARPET.z0
  const mat = useMemo(() => {
    const map = makeCarpetTexture(mobile)
    map.repeat.set(1, len / CARPET_TILE_M)
    return new THREE.MeshStandardMaterial({ map, roughness: 0.93, metalness: 0, envMapIntensity: 0.35 })
  }, [mobile, len])
  useEffect(
    () => () => {
      mat.map?.dispose()
      mat.dispose()
    },
    [mat],
  )
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, CARPET.y, (CARPET.z0 + CARPET.z1) / 2]} material={mat} raycast={() => null}>
      <planeGeometry args={[CARPET.width, len]} />
    </mesh>
  )
}

// ---------- Bra nuri: bloom'siz ham yonadi — additive radial "dog'"lar (bitta draw call) ----------
let glowTex: THREE.Texture | null = null
function getGlowTexture() {
  if (glowTex) return glowTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.12, 'rgba(255,255,255,0.75)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.28)')
  g.addColorStop(0.65, 'rgba(255,255,255,0.08)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  glowTex = new THREE.CanvasTexture(c)
  glowTex.colorSpace = THREE.SRGBColorSpace
  return glowTex
}

/** Bra atrofidagi nur: abajur oldida yorqin "halo" (kameraga qaragan) + devorda cho'zinchoq iliq dog' */
function SconceGlow({ lite }: { lite: boolean }) {
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = []
    const o = new THREE.Object3D()
    const add = (w: number, h: number, pos: THREE.Vector3, lookAt: THREE.Vector3, rgb: [number, number, number]) => {
      const g = new THREE.PlaneGeometry(w, h)
      o.position.copy(pos)
      o.rotation.set(0, 0, 0)
      o.lookAt(lookAt) // Object3D (kamera emas): +Z shu nuqtaga qaraydi
      o.updateMatrix()
      g.applyMatrix4(o.matrix)
      const n = g.attributes.position.count
      const col = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) col.set(rgb, i * 3)
      g.setAttribute('color', new THREE.BufferAttribute(col, 3))
      parts.push(g)
    }
    const eye = new THREE.Vector3(0, 2.2, 9) // kameralar o'rtacha shu tomonda
    for (const { pos, n } of SCONCES) {
      // devordagi dog' (abajurdan yuqoriga va pastga tushgan nur); pilyastrlar chetini o'zi yopadi
      const wash = pos.clone().addScaledVector(n, 0.13)
      wash.y += 0.08
      add(1.3, 2.0, wash, wash.clone().add(n), [0.34, 0.22, 0.11])
      // abajur halosi
      const shade = pos.clone().addScaledVector(n, 0.26)
      add(0.8, 0.8, shade, eye, [1.0, 0.74, 0.44])
    }
    const merged = mergeGeometries(parts, false)!
    parts.forEach((g) => g.dispose())
    return merged
  }, [])
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: getGlowTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: false,
      }),
    [],
  )
  useEffect(
    () => () => {
      geo.dispose()
      mat.dispose()
    },
    [geo, mat],
  )
  useFrame(() => {
    const t = live.time
    // juda yengil "jonli" tebranish (elektr bra), reduced-motion va lite da yo'q
    const flick = reducedMotion || lite ? 1 : 1 + 0.02 * Math.sin(t * 7.3) + 0.012 * Math.sin(t * 13.7 + 1.1)
    // lite: bloom yo'q — nur dog'i biroz kuchliroq
    mat.color.setScalar((lite ? 1.2 : 1) * live.ignite[0] * flick)
  })
  return <mesh geometry={geo} material={mat} raycast={() => null} renderOrder={6} />
}

// ---------- Orqa devordagi gerb ramkasi: oltin halqa + navy disk ----------
/** Rejim va lobbi ekranlarida kartalar ortida "suzayotgan halqa" bo'lib ko'rinmasin (T-15) — so'nib yo'qoladi */
function Plaque({ gold }: { gold: THREE.MeshStandardMaterial }) {
  const group = useRef<THREE.Group>(null)
  const { goldMat, navyMat } = useMemo(() => {
    const goldMat = gold.clone()
    goldMat.transparent = true
    const navyMat = new THREE.MeshStandardMaterial({ color: '#0f1b33', roughness: 0.65, envMapIntensity: 0.5, transparent: true })
    return { goldMat, navyMat }
  }, [gold])
  const geos = useMemo(
    () => ({
      outer: new THREE.TorusGeometry(PLAQUE.r, 0.035, 14, 72),
      inner: new THREE.TorusGeometry(PLAQUE.r - 0.08, 0.012, 8, 72),
      disk: new THREE.CylinderGeometry(PLAQUE.r - 0.02, PLAQUE.r - 0.02, 0.05, 64),
    }),
    [],
  )
  useEffect(
    () => () => {
      goldMat.dispose()
      navyMat.dispose()
    },
    [goldMat, navyMat],
  )
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos])
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const ph = getState().phase
    const want = ph === 'mode' || ph === 'lobby' ? 0 : 1
    live.plaque = THREE.MathUtils.damp(live.plaque, want, reducedMotion ? 30 : 4, dt)
    goldMat.opacity = navyMat.opacity = live.plaque
    if (group.current) group.current.visible = live.plaque > 0.01
  })
  const z = ROOM.zBack
  return (
    <group ref={group}>
      <mesh geometry={geos.outer} material={goldMat} position={[PLAQUE.x, PLAQUE.y, z + 0.09]} raycast={() => null} />
      <mesh geometry={geos.inner} material={goldMat} position={[PLAQUE.x, PLAQUE.y, z + 0.09]} raycast={() => null} />
      <mesh geometry={geos.disk} material={navyMat} position={[PLAQUE.x, PLAQUE.y, z + 0.05]} rotation-x={Math.PI / 2} raycast={() => null} />
    </group>
  )
}

/** Meshy jihozi (sudya stoli va h.k.) — mobil variant lite da */
export function Prop({ name, lite, position, rotY }: { name: string; lite: boolean; position: V3 | THREE.Vector3; rotY: number }) {
  const gltf = useGLTF(propUrl(name, lite), false, true)
  const obj = useMemo(() => {
    const c = gltf.scene.clone(true)
    c.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.raycast = () => null
        const mat = m.material as THREE.MeshStandardMaterial
        if (mat?.isMeshStandardMaterial) {
          // Meshy "BakedMaterial" metallic=1 yog'ochni metalldek yaltiratmasin
          mat.metalness = Math.min(mat.metalness, 0.2)
          mat.envMapIntensity = 0.7
        }
      }
    })
    return c
  }, [gltf.scene])
  const p = position instanceof THREE.Vector3 ? position.toArray() : position
  return <primitive object={obj} position={p} rotation-y={rotY} />
}

/** Bitta jihoz: o'z Suspense/xato chegarasi bilan — biri yuklanmasa qolganlari va butun sahna yiqilmaydi */
function SafeProp(props: { name: string; lite: boolean; position: V3 | THREE.Vector3; rotY: number }) {
  return (
    <ModelBoundary fallback={null} label={propUrl(props.name, props.lite)}>
      <Suspense fallback={null}>
        <Prop {...props} />
      </Suspense>
    </ModelBoundary>
  )
}

/** Sudya stoli va yon stollar (zal chuqurligi uchun). mobile — "-mobile" GLB lar.
 *  Nomlar IntroCanvas dagi useGLTF.preload ro'yxati bilan bir xil bo'lsin. */
export function Furniture({ mobile }: { mobile: boolean }) {
  return (
    <group>
      {/* Meshy da kreslo old tomonda — 180° (old panel kameraga qaraydi) */}
      <SafeProp name="sudya-stoli" lite={mobile} position={BENCH_POS} rotY={Math.PI} />
      <SafeProp name="prokuror-stoli" lite={mobile} position={[-4.35, 0, -0.6]} rotY={Math.PI / 2} />
      <SafeProp name="himoyachi-stoli" lite={mobile} position={[4.35, 0, -0.6]} rotY={-Math.PI / 2} />
    </group>
  )
}
