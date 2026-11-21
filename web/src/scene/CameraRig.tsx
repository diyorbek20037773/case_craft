import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { VIEWS, type ViewId } from './layout'

/** O'tish davomiyligi (soniya) */
export const CAMERA_TRANSITION = 0.6

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/**
 * Sobit kamera nuqtalari orasida silliq o'tish (~0,6 s).
 * Telefon tik holatda ekran tor bo'lgani uchun vertikal FOV kattalashtiriladi — sahna kesilib qolmaydi.
 */
export function CameraRig({ view }: { view: ViewId }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)

  const anim = useRef({
    fromPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    toTarget: new THREE.Vector3(),
    target: new THREE.Vector3(),
    t: 1,
    ready: false,
  })

  useEffect(() => {
    const a = anim.current
    const v = VIEWS[view]
    if (!a.ready) {
      camera.position.set(...v.position)
      a.target.set(...v.target)
      camera.lookAt(a.target)
      a.ready = true
      return
    }
    a.fromPos.copy(camera.position)
    a.fromTarget.copy(a.target)
    a.toPos.set(...v.position)
    a.toTarget.set(...v.target)
    a.t = 0
  }, [view, camera])

  useEffect(() => {
    const aspect = width / Math.max(height, 1)
    const hfov = THREE.MathUtils.degToRad(68)
    const vfov = aspect >= 1.2 ? 48 : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / aspect))
    camera.fov = THREE.MathUtils.clamp(vfov, 45, 80)
    camera.updateProjectionMatrix()
  }, [width, height, camera])

  useFrame((_, dt) => {
    const a = anim.current
    if (a.t >= 1) return
    a.t = Math.min(1, a.t + Math.min(dt, 0.05) / CAMERA_TRANSITION)
    const e = easeInOutCubic(a.t)
    camera.position.lerpVectors(a.fromPos, a.toPos, e)
    // yo'l o'rtasida biroz ko'tarilish — stol va personajlar orasidan o'tib ketmaslik uchun
    camera.position.y += Math.sin(Math.PI * a.t) * 0.35
    a.target.lerpVectors(a.fromTarget, a.toTarget, e)
    camera.lookAt(a.target)
  })

  return null
}
