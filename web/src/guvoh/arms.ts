// Qo'l/yelka yumshatish qatlami (Blender/Mixamo'siz, faqat kodda).
// Sabab: Meshy auto-rig — 24 suyak, bilak burilish (twist) suyagi yo'q, yelka/qo'ltiq skin og'irliklari yomon.
// Kliplarda Hand o'z o'qi (+Y, bola suyaklar shu o'qda yotadi) atrofida bind ga nisbatan ±90–110° buriladi
// (talk_both 1,0–1,7 s, talk_right 0,8–2,0 s) — bilakda "konfet o'rami" bo'lib, qo'l o'ralib ketgandek ko'rinadi.
//
// Hamma tuzatish suyakning LOKAL kvaternionida (ota suyak fazosi), bind (rest) pozaga nisbatan swing-twist bilan:
//   q = rest · E,  E = S · T  (T — suyak o'qi +Y atrofida burilish, S — o'qni og'dirish)
// Har kadr klip pozasidan boshlanadi (Witness.tsx mixer.update dan oldin klip pozasini tiklaydi) — to'planmaydi.
// Barcha chegaralar pose.json "arms" bo'limida.
import * as THREE from 'three'

export interface ArmsConfig {
  /** UpperArm (LeftArm/RightArm) bind ga nisbatan og'ish (ko'tarilish) chegarasi, gradus */
  upperArmMaxDeg: number
  /** shu burchakdan boshlab chegaraga yumshoq (tanh) yaqinlashadi */
  upperArmSoftDeg: number
  /** UpperArm o'z o'qi bo'yicha burilishi (roll) bind dan shu burchakdan oshmaydi (talk_both da −55° edi) */
  upperArmTwistMaxDeg: number
  upperArmTwistSoftDeg: number
  /** Tirsak bukilishi (ForeArm ning bind dan og'ishi) chegarasi — talk_right da 107° gacha, yelka "eriydi" */
  elbowMaxDeg: number
  elbowSoftDeg: number
  /** ForeArm o'z o'qi bo'yicha burilishining qolgan ulushi */
  foreArmTwistKeep: number
  /** Hand o'z o'qi bo'yicha burilishi: shu burchakkacha tegilmaydi */
  handTwistFreeDeg: number
  /** ... undan ortig'ining qolgan ulushi */
  handTwistKeep: number
  /** qolgan bilak burilishining qancha qismi ForeArm ga o'tkaziladi (tirsakdan buriladi, kaft holati o'zgarmaydi) */
  handTwistToForeArm: number
  /** Shoulder (clavicle) bind dan og'ishi chegarasi (kliplarda 35–37° gacha) */
  shoulderMaxDeg: number
  shoulderSoftDeg: number
  /** Shoulder (clavicle): tez harakatning qolgan ulushi (0,5 = keskin harakat 50% kamayadi) */
  shoulderKeep: number
  /** Shoulder sekin (doimiy) holatni qanchalik tez kuzatadi, 1/s */
  shoulderFollow: number
}

const DEG = Math.PI / 180
const Y = new THREE.Vector3(0, 1, 0)

// kadr ichida obyekt yaratilmasin
const _E = new THREE.Quaternion()
const _S = new THREE.Quaternion()
const _T = new THREE.Quaternion()
const _ri = new THREE.Quaternion()
const _tw = new THREE.Quaternion()
const _tw2 = new THREE.Quaternion()
const _H = new THREE.Quaternion()
const _A = new THREE.Quaternion()

/** Chegaraga yumshoq yaqinlashish: soft gacha o'zgarmaydi, max dan oshmaydi, uzluksiz va silliq */
export function softLimit(a: number, soft: number, max: number) {
  if (a <= soft || max <= soft) return Math.min(a, Math.max(max, soft))
  return soft + (max - soft) * Math.tanh((a - soft) / (max - soft))
}

/** |tw| <= free — o'zgarmaydi; ortig'i keep ulushida qoladi (uzluksiz) */
export function softTwist(tw: number, free: number, keep: number) {
  const a = Math.abs(tw)
  if (a <= free) return tw
  return Math.sign(tw) * (free + (a - free) * keep)
}

/** E = rest⁻¹·q ni S·T ga ajratadi (T — +Y atrofida). Natija _S, _T da; qaytaradi: [swing burchagi, twist burchagi] */
function decompose(q: THREE.Quaternion, rest: THREE.Quaternion): [number, number] {
  _E.copy(_ri.copy(rest).invert()).multiply(q)
  if (_E.w < 0) _E.set(-_E.x, -_E.y, -_E.z, -_E.w)
  const len = Math.hypot(_E.y, _E.w)
  if (len < 1e-6) _T.identity() // 180° swing — twist aniqlanmaydi
  else _T.set(0, _E.y / len, 0, _E.w / len)
  _S.copy(_E).multiply(_ri.copy(_T).invert())
  const twist = 2 * Math.atan2(_T.y, _T.w)
  const swing = 2 * Math.acos(Math.min(1, Math.abs(_S.w)))
  return [swing, twist]
}

export interface ArmSide {
  shoulder: THREE.Object3D | null
  arm: THREE.Object3D | null
  fore: THREE.Object3D | null
  hand: THREE.Object3D | null
  /** bind (rest) lokal kvaternionlari */
  rest: { shoulder: THREE.Quaternion; arm: THREE.Quaternion; fore: THREE.Quaternion; hand: THREE.Quaternion }
  /** Shoulder ning sekin (past chastotali) holati */
  shoulderSlow: THREE.Quaternion
  hasSlow: boolean
}

export function makeSide(get: (n: string) => THREE.Object3D | null, side: 'Left' | 'Right'): ArmSide {
  const b = (n: string) => get(side + n)
  const shoulder = b('Shoulder')
  const arm = b('Arm')
  const fore = b('ForeArm')
  const hand = b('Hand')
  // bind pozasi: sahna birinchi yuklanganda saqlanadi (useGLTF keshida sahna qayta ishlatilsa ham asl qiymat qoladi)
  const rest = (o: THREE.Object3D | null) => {
    if (!o) return new THREE.Quaternion()
    if (!o.userData.restQ) o.userData.restQ = o.quaternion.clone()
    return (o.userData.restQ as THREE.Quaternion).clone()
  }
  return {
    shoulder,
    arm,
    fore,
    hand,
    rest: { shoulder: rest(shoulder), arm: rest(arm), fore: rest(fore), hand: rest(hand) },
    shoulderSlow: new THREE.Quaternion(),
    hasSlow: false,
  }
}

/**
 * Bir tomon qo'lini yumshatish. Klip pozasi suyaklarda turgan holda, mixer.update DAN KEYIN chaqiriladi.
 * k — burchak cheklovlarining kuchi (0..1): think (qo'l boshga) klipida 0 ga yaqin — aks holda qo'l boshga yetmaydi.
 * Bilak burilishini kamaytirish va Shoulder silliqlash k ga bog'liq emas.
 */
export function softenArm(s: ArmSide, c: ArmsConfig, dt: number, k: number) {
  // 1) Shoulder: sekin komponent saqlanadi, tez (keskin) qismi shoulderKeep ulushida
  if (s.shoulder) {
    const q = s.shoulder.quaternion
    if (!s.hasSlow) {
      s.shoulderSlow.copy(q)
      s.hasSlow = true
    } else s.shoulderSlow.slerp(q, 1 - Math.exp(-c.shoulderFollow * dt))
    q.slerpQuaternions(s.shoulderSlow, q, c.shoulderKeep)
    if (k > 0) {
      // bind dan umumiy og'ish burchagini yumshoq cheklash (o'q bo'yicha emas — butun burilish kichrayadi)
      _E.copy(_ri.copy(s.rest.shoulder).invert()).multiply(q)
      if (_E.w < 0) _E.set(-_E.x, -_E.y, -_E.z, -_E.w)
      const a = 2 * Math.acos(Math.min(1, _E.w))
      const lim = softLimit(a, c.shoulderSoftDeg * DEG, c.shoulderMaxDeg * DEG)
      const a2 = a + (lim - a) * k
      if (a > 1e-5 && a2 !== a) q.copy(s.rest.shoulder).multiply(_A.identity().slerp(_E, a2 / a))
    }
  }

  // 2) UpperArm: og'ishni bind dan upperArmMaxDeg gacha yumshoq cheklash + o'z o'qi burilishini kamaytirish
  if (s.arm && k > 0) {
    const q = s.arm.quaternion
    const [sw, tw] = decompose(q, s.rest.arm)
    const swLim = softLimit(sw, c.upperArmSoftDeg * DEG, c.upperArmMaxDeg * DEG)
    const sw2 = sw + (swLim - sw) * k
    const twLim = Math.sign(tw) * softLimit(Math.abs(tw), c.upperArmTwistSoftDeg * DEG, c.upperArmTwistMaxDeg * DEG)
    const tw2 = tw + (twLim - tw) * k
    if (sw > 1e-5 && sw2 !== sw) _S.copy(_A.identity().slerp(_S, sw2 / sw))
    _tw.setFromAxisAngle(Y, tw2)
    q.copy(s.rest.arm).multiply(_S).multiply(_tw)
  }

  // 3) ForeArm + Hand: bilak burilishini kamaytirish va qolganining bir qismini tirsakka taqsimlash
  if (s.fore && s.hand) {
    const qh = s.hand.quaternion
    const [, th] = decompose(qh, s.rest.hand)
    const hS = _H.copy(_S)
    const th2 = softTwist(th, c.handTwistFreeDeg * DEG, c.handTwistKeep)
    const phi = th2 * c.handTwistToForeArm

    const qf = s.fore.quaternion
    const [sf, tf] = decompose(qf, s.rest.fore)
    // tirsak bukilishi (swing) cheklovi
    const sfLim = softLimit(sf, c.elbowSoftDeg * DEG, c.elbowMaxDeg * DEG)
    const sf2 = sf + (sfLim - sf) * k
    if (sf > 1e-5 && sf2 !== sf) _S.copy(_A.identity().slerp(_S, sf2 / sf))
    _tw.setFromAxisAngle(Y, tf * c.foreArmTwistKeep + phi)
    qf.copy(s.rest.fore).multiply(_S).multiply(_tw)

    // qo'l: rest·S·T(th2), so'ng ForeArm ga berilgan phi ni ForeArm fazosida qaytarib olish — kaftning dunyo holati
    // (th2 bilan) saqlanadi, bilakdagi o'ralish esa th2·(1 − handTwistToForeArm) ga tushadi
    _tw.setFromAxisAngle(Y, th2)
    _tw2.setFromAxisAngle(Y, -phi)
    qh.copy(s.rest.hand).multiply(hS).multiply(_tw).premultiply(_tw2)
  }
}

/** Diagnostika: suyakning bind ga nisbatan [swing, twist] (gradus) */
export function swingTwistDeg(q: THREE.Quaternion, rest: THREE.Quaternion): [number, number] {
  const [s, t] = decompose(q, rest)
  return [s / DEG, t / DEG]
}
