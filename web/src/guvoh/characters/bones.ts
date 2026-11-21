// Suyakni personaj ramkasidagi (yaw — yuqori o'q, pitch — o'ng o'q) burchakka qo'shimcha (additive) burish.
// Witness.tsx dagi bilan bir xil formula:  local' = (P⁻¹ · R · Q · R⁻¹ · P) · local
//   P — ota suyakning dunyo kvaternioni, R — personaj ildizi, Q — delta. Suyak o'qlariga bog'liq emas.
import * as THREE from 'three'

const _p = new THREE.Quaternion()
const _d = new THREE.Quaternion()
const _pi = new THREE.Quaternion()
const _e = new THREE.Euler(0, 0, 0, 'YXZ')

export function turnBone(bone: THREE.Object3D, yaw: number, pitch: number, qRoot: THREE.Quaternion) {
  if (!bone.parent || (yaw === 0 && pitch === 0)) return
  _e.set(pitch, yaw, 0, 'YXZ')
  _d.setFromEuler(_e)
  _d.premultiply(qRoot).multiply(_p.copy(qRoot).invert())
  bone.parent.getWorldQuaternion(_p)
  _d.premultiply(_pi.copy(_p).invert()).multiply(_p)
  bone.quaternion.premultiply(_d)
  bone.updateMatrixWorld(true)
}
