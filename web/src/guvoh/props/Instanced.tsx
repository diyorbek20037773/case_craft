// Takrorlanadigan Meshy jihozlari (skameykalar, shift chiroqlari) — har mesh bitta InstancedMesh (kam draw call).
import { useGLTF } from '@react-three/drei'
import { useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'

export const propUrl = (name: string, mobile: boolean) => `/models/meshy/props/${name}${mobile ? '-mobile' : ''}.glb`

export interface Placed {
  pos: [number, number, number]
  rotY: number
  scale?: number
}

interface Props {
  name: string
  mobile: boolean
  items: Placed[]
  castShadow?: boolean
  /** material sozlash (masalan, chiroq yorug'ligi) */
  tweak?: (m: THREE.MeshStandardMaterial) => void
}

export function InstancedProp({ name, mobile, items, castShadow = true, tweak }: Props) {
  const gltf = useGLTF(propUrl(name, mobile), false, true)
  const meshes = useMemo(() => {
    gltf.scene.updateMatrixWorld(true)
    const out: THREE.InstancedMesh[] = []
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone()
      // Meshy "BakedMaterial" metallic=1 omili yog'ochni metalldek yaltiratmasin
      mat.metalness = Math.min(mat.metalness, 0.2)
      mat.envMapIntensity = 0.85
      tweak?.(mat)
      const im = new THREE.InstancedMesh(mesh.geometry, mat, items.length)
      items.forEach((it, i) => {
        const s = it.scale ?? 1
        m.compose(new THREE.Vector3(...it.pos), q.setFromAxisAngle(up, it.rotY), new THREE.Vector3(s, s, s)).multiply(mesh.matrixWorld)
        im.setMatrixAt(i, m)
      })
      im.instanceMatrix.needsUpdate = true
      im.computeBoundingSphere()
      im.castShadow = castShadow
      im.receiveShadow = true
      im.name = `inst-${name}`
      out.push(im)
    })
    return out
  }, [gltf.scene, items, castShadow, tweak, name])
  useLayoutEffect(() => () => meshes.forEach((im) => (im.material as THREE.Material).dispose()), [meshes])
  return (
    <>
      {meshes.map((im) => (
        <primitive key={im.uuid} object={im} />
      ))}
    </>
  )
}
