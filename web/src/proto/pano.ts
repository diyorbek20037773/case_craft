// 360 panorama (zal-360-1) va undagi narsalarning 3D joylashuvi.
// Kamera panorama olingan nuqtada turadi — shunda pol, minbar va personaj bir xil perspektivada bo'ladi.
// Dunyo o'qlari: sudya stoli (panorama markazi, u=0.5) -Z yo'nalishida, u oshgani sari o'ngga (+X tomon) buriladi.
import * as THREE from 'three'

/** Panorama olingan kamera balandligi (metr). Minbar asosi va ustining burchaklaridan hisoblangan. */
export const CAMERA_HEIGHT = 1.32

/** Panorama koordinatasi (u: 0..1 chapdan o'ngga, v: 0..1 yuqoridan pastga) -> dunyodagi birlik yo'nalish */
export function panoDir(u: number, v: number, out = new THREE.Vector3()): THREE.Vector3 {
  const az = (u - 0.5) * Math.PI * 2
  const el = (0.5 - v) * Math.PI
  const c = Math.cos(el)
  return out.set(Math.sin(az) * c, Math.sin(el), -Math.cos(az) * c)
}

/** Pol (y=0) dagi nuqta: kameradan panoramaning (u, v) yo'nalishi bo'yicha */
export function panoFloor(u: number, v: number): THREE.Vector3 {
  const d = panoDir(u, v)
  const t = CAMERA_HEIGHT / Math.max(-d.y, 1e-3)
  return new THREE.Vector3(d.x * t, 0, d.z * t)
}

/** Kameradan berilgan azimut (u) va gorizontal masofada joylashgan pol nuqtasi */
export function panoAt(u: number, dist: number, y = 0): THREE.Vector3 {
  const d = panoDir(u, 0.5)
  return new THREE.Vector3(d.x * dist, y, d.z * dist)
}

// 4096x2048 nusxadagi piksel -> (u, v). Minbar siluyeti kesilgan rasm (u0=0.62, v0=0.40) bo'yicha olingan.
const px = (x: number, y: number): [number, number] => [0.62 + x / 4096, 0.4 + y / 2048]

/** Guvoh minbarining siluyeti (soat mili bo'yicha). Shu shakl bo'yicha ko'rinmas "to'siq" yasaladi. */
export const LECTERN_OUTLINE: [number, number][] = [
  px(146, 262),
  px(252, 221),
  px(420, 214),
  px(423, 272),
  px(411, 284),
  px(411, 590),
  px(420, 596),
  px(419, 616),
  px(262, 670),
  px(150, 626),
  px(150, 604),
  px(157, 598),
  px(157, 286),
  px(146, 280),
]
/** Minbarning old yuzigacha masofa (m) */
export const LECTERN_DIST = 1.55

/** Mikrofon (ingichka bo'yin + boshcha) — guvoh uning ortida turadi */
export const MIC_OUTLINE: [number, number][] = [
  px(207, 118),
  px(214, 116),
  px(222, 121),
  px(231, 131),
  px(246, 139),
  px(262, 150),
  px(282, 166),
  px(298, 181),
  px(306, 193),
  px(312, 206),
  px(313, 216),
  px(309, 216),
  px(308, 207),
  px(302, 195),
  px(294, 184),
  px(279, 170),
  px(260, 155),
  px(244, 144),
  px(230, 137),
  px(219, 135),
  px(210, 131),
  px(206, 125),
]
export const MIC_DIST = 1.75

/** Guvoh turgan joy: minbar ortida */
export const WITNESS_U = 0.69
export const WITNESS_DIST = 2.02

/** Bo'sh sudya kursisi (nigoh qaytadigan nuqta) */
export const JUDGE_U = 0.5
export const JUDGE_LOOK = panoDir(JUDGE_U, 0.455).multiplyScalar(4).add(new THREE.Vector3(0, CAMERA_HEIGHT, 0))

/** O'ng tomondagi deraza (asosiy yorug'lik manbai) */
export const WINDOW_U = 0.75
