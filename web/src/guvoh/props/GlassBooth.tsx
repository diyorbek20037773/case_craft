// Sudlanuvchi uchun SHISHA KABINA ("akvarium", Yunusobod tuman sudi fotosi H-Z1/H-Z2): oq metall ramka profillari +
// shisha (MeshPhysicalMaterial, roughness past, HDRI aks-sadosi; ?glass=real — haqiqiy transmission). Eshikchasi chap (zal) devorining orqa qismida, dastagi bilan.
import { useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BOOTH } from '../layout'
import type { Tier } from '../Scene'

const P = 0.055 // profil qalinligi
const KICK = 0.12 // pastki metall plintus
const REAL_GLASS = new URLSearchParams(window.location.search).get('glass') === 'real'

function boxAt(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  return g
}

export function GlassBooth({ tier }: { tier: Tier }) {
  const { frame, glass, handle } = useMemo(() => {
    const { x0, x1, z0, z1, h } = BOOTH
    const f: THREE.BufferGeometry[] = []
    const gl: THREE.BufferGeometry[] = []
    // tik ustunlar: har ~0,8 m da (old va orqa devor bo'ylab X da, chap devor bo'ylab Z da)
    const posts = (a: number, b: number) => {
      const n = Math.max(1, Math.round((b - a) / 0.8))
      return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n)
    }
    const xs = posts(x0, x1)
    const zs = posts(z0, z1)
    for (const x of xs) {
      f.push(boxAt(P, h, P, x, h / 2, z0))
      f.push(boxAt(P, h, P, x, h / 2, z1))
    }
    for (const z of zs) f.push(boxAt(P, h, P, x0, h / 2, z))
    // gorizontal: yuqori, pastki plintus va 1,05 m dagi tutqich-reyka
    const W = x1 - x0
    const D = z1 - z0
    for (const [y, hh] of [
      [h - P / 2, P],
      [KICK / 2, KICK],
      [1.05, 0.035],
    ] as const) {
      f.push(boxAt(W, hh, P, (x0 + x1) / 2, y, z0))
      f.push(boxAt(W, hh, P, (x0 + x1) / 2, y, z1))
      f.push(boxAt(P, hh, D, x0, y, (z0 + z1) / 2))
    }
    // tom: yengil panjara to'sinlari (yopiq qafas emas — yuqori ochiq ramka)
    for (const z of zs) f.push(boxAt(W, 0.04, 0.04, (x0 + x1) / 2, h - 0.02, z))
    // eshikcha: chap devorning orqa bo'lagida, alohida ramka
    const dz0 = zs[zs.length - 2]
    const dz1 = zs[zs.length - 1]
    f.push(boxAt(P * 1.3, h - KICK, P * 1.3, x0 - 0.01, (h + KICK) / 2, dz0 + 0.04))
    f.push(boxAt(P * 0.8, 0.05, dz1 - dz0 - 0.1, x0 - 0.02, 2.0, (dz0 + dz1) / 2))
    const hd = [boxAt(0.04, 0.26, 0.03, x0 - 0.06, 1.05, dz0 + 0.14), boxAt(0.07, 0.03, 0.03, x0 - 0.045, 1.16, dz0 + 0.14), boxAt(0.07, 0.03, 0.03, x0 - 0.045, 0.94, dz0 + 0.14)]

    // shisha panellar (ustunlar orasida, plintus ustidan)
    const gh = h - KICK - P
    const gy = KICK + gh / 2
    for (let i = 0; i < xs.length - 1; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2
      const w = xs[i + 1] - xs[i] - P
      gl.push(boxAt(w, gh, 0.012, cx, gy, z0))
      gl.push(boxAt(w, gh, 0.012, cx, gy, z1))
    }
    for (let i = 0; i < zs.length - 1; i++) {
      const cz = (zs[i] + zs[i + 1]) / 2
      const d = zs[i + 1] - zs[i] - P
      gl.push(boxAt(0.012, gh, d, x0, gy, cz))
    }
    const strip = (gs: THREE.BufferGeometry[]) => gs.map((g) => (g.index ? g.toNonIndexed() : g))
    return { frame: mergeGeometries(strip(f), false)!, glass: mergeGeometries(strip(gl), false)!, handle: mergeGeometries(strip(hd), false)! }
  }, [])
  useLayoutEffect(
    () => () => {
      frame.dispose()
      glass.dispose()
      handle.dispose()
    },
    [frame, glass, handle],
  )

  // Haqiqiy transmission o'lchovda kabina kadrda bo'lganda ~15 fps yeydi (sahna ikki marta chiziladi) — shuning uchun
  // faqat ?glass=real bilan. Odatiy: shaffof fizik shisha — HDRI aks-sadosi va ko'k-yashil tus bilan (arzon).
  const realGlass = tier === 2 && REAL_GLASS
  const glassMat = useMemo(() => {
    if (realGlass) {
      return new THREE.MeshPhysicalMaterial({
        color: '#eef8f8',
        metalness: 0,
        roughness: 0.03,
        transmission: 0.96,
        thickness: 0.012,
        ior: 1.5,
        specularIntensity: 1,
        envMapIntensity: 1.4,
      })
    }
    return new THREE.MeshPhysicalMaterial({
      color: '#cfe6e6',
      metalness: 0,
      roughness: 0.03,
      transparent: true,
      opacity: 0.17,
      depthWrite: false,
      specularIntensity: 1,
      envMapIntensity: 2.2,
    })
  }, [realGlass])
  useLayoutEffect(() => () => glassMat.dispose(), [glassMat])

  return (
    <group name="glass-booth">
      <mesh geometry={frame} castShadow receiveShadow>
        <meshStandardMaterial color="#f1f1ee" metalness={0.55} roughness={0.32} envMapIntensity={1} />
      </mesh>
      <mesh geometry={handle}>
        <meshStandardMaterial color="#b9bcc0" metalness={1} roughness={0.25} />
      </mesh>
      <mesh geometry={glass} material={glassMat} renderOrder={3} />
    </group>
  )
}
