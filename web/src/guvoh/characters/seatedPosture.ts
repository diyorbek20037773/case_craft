// O'tirgan personajlar (sudya, prokuror, kotib, sudlanuvchi) uchun yelka qaddi.
// Muammo: Meshy sit_idle/sit_talk kliplarida o'mrov (Shoulder) bind holatidan ~30° pastga egilgan — yelka bo'g'imi
// o'mrov boshidan ~8 sm pastda (bind da bir balandlikda). Mesh tekis o'mrov uchun modellashtirilgan, shuning uchun
// yelka "osilib", deltasimon qism shishib, yuqori qo'l yonga chiqib turadi (odamnikidek emas).
// arms.ts bu yerda yordam bermaydi: o'tirganlar uchun uning "rest"i — sit_idle pozasining o'zi.
//
// Yechim (har kadr, klip pozasi ustidan, MOSLASHUVCHAN — o'lchab nishonga tortadi, to'planmaydi):
//  1) o'mrov egilishini (Shoulder→Arm vektorining gorizontaldan pastga burchagi) clavDroopDeg ga ko'tarish;
//  2) yuqori qo'l yo'nalishi o'mrovdan oldingi holatiga qaytariladi va tanadan og'ishi (abduction) armAbdDeg gacha
//     kamaytiriladi — tirsak tanaga yaqin, qo'l o'z joyida qoladi.
// Barcha burilishlar PERSONAJ RAMKASIDA (oldi +Z, yuqori +Y, chap +X).
import * as THREE from 'three'

export interface SeatedPostureConfig {
  /** o'mrovning gorizontaldan pastga nishon burchagi, gradus (bind ≈ 0) */
  clavDroopDeg: number
  /** o'mrov tuzatishining ulushi (0..1) */
  clavGain: number
  /** bir kadrdagi o'mrov tuzatishining chegarasi, gradus */
  clavFixMaxDeg: number
  /** yuqori qo'lning tanadan og'ishi (frontal tekislik) nishoni, gradus; faqat kamaytiriladi */
  armAbdDeg: number
  armAbdGain: number
}

export const SEATED_POSTURE: SeatedPostureConfig = {
  clavDroopDeg: 6,
  clavGain: 0.9,
  clavFixMaxDeg: 34,
  armAbdDeg: 7,
  armAbdGain: 0.85,
}

export interface PostureSide {
  /** +1 — chap (+X), −1 — o'ng */
  sign: 1 | -1
  shoulder: THREE.Object3D
  arm: THREE.Object3D
  fore: THREE.Object3D
}

const DEG = Math.PI / 180
const Z = new THREE.Vector3(0, 0, 1)
const _qRi = new THREE.Quaternion()
const _qP = new THREE.Quaternion()
const _qPi = new THREE.Quaternion()
const _qD = new THREE.Quaternion()
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _d0 = new THREE.Vector3()
const _d1 = new THREE.Vector3()

/** a→b vektori personaj ramkasida */
function charVec(a: THREE.Object3D, b: THREE.Object3D, out: THREE.Vector3) {
  a.getWorldPosition(_a)
  b.getWorldPosition(_b)
  return out.copy(_b).sub(_a).applyQuaternion(_qRi)
}

/** Suyakni personaj ramkasidagi delta kvaternion bilan burish: local' = (P⁻¹ · R · Q · R⁻¹ · P) · local */
function rotateInCharFrame(bone: THREE.Object3D, q: THREE.Quaternion, qRoot: THREE.Quaternion) {
  if (!bone.parent) return
  _qD.copy(q).premultiply(qRoot).multiply(_qP.copy(qRoot).invert())
  bone.parent.getWorldQuaternion(_qP)
  _qD.premultiply(_qPi.copy(_qP).invert()).multiply(_qP)
  bone.quaternion.premultiply(_qD)
  bone.updateMatrixWorld(true)
}

/** Klip pozasi (va arms.ts) DAN KEYIN, nigohdan oldin chaqiriladi. qRoot — personaj ildizining dunyo kvaternioni */
export function applySeatedPosture(sides: PostureSide[], c: SeatedPostureConfig, qRoot: THREE.Quaternion) {
  _qRi.copy(qRoot).invert()
  for (const s of sides) {
    // yuqori qo'lning o'mrov tuzatishidan oldingi yo'nalishi
    charVec(s.arm, s.fore, _d0).normalize()

    // 1) o'mrov: pastga egilishini nishonga ko'tarish (Z o'qi atrofida; chapda +, o'ngda −)
    const clav = charVec(s.shoulder, s.arm, _d1)
    const droop = Math.atan2(-clav.y, Math.abs(clav.x))
    const fix = THREE.MathUtils.clamp((droop - c.clavDroopDeg * DEG) * c.clavGain, 0, c.clavFixMaxDeg * DEG)
    if (fix > 1e-4) rotateInCharFrame(s.shoulder, _qD.setFromAxisAngle(Z, s.sign * fix), qRoot)

    // 2) yuqori qo'l: avvalgi yo'nalish, tanadan og'ishi kamaytirilgan
    const abd = Math.atan2(s.sign * _d0.x, -_d0.y)
    const less = Math.max(0, abd - c.armAbdDeg * DEG) * c.armAbdGain
    if (less > 1e-4) _d0.applyAxisAngle(Z, -s.sign * less)
    charVec(s.arm, s.fore, _d1).normalize()
    if (_d1.dot(_d0) < 0.99999) rotateInCharFrame(s.arm, _qD.setFromUnitVectors(_d1, _d0), qRoot)
  }
}
