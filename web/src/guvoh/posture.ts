// Guvoh qaddi (posture) qatlami — TIK TURGAN guvoh uchun ("osilib qolgan latta" emas, real odamdek tik).
// Manba: web/src/intro/scene/posture.ts (kirish qismi egaligida — import qilinmaydi, NUSXALAB moslashtirilgan).
// O'tirgan personajlarga (characters/**) qo'llanmaydi.
//
// Barcha burilishlar PERSONAJ RAMKASIDA (oldi +Z, yuqori +Y, chap qo'l +X) — suyak o'qlariga bog'liq emas:
//   local' = (P⁻¹ · R · Q · R⁻¹ · P) · local,  P — ota suyak dunyo kvaternioni, R — personaj ildizi, Q — delta.
// Hamma tuzatish ADDITIVE va MOSLASHUVCHAN: klip pozasi o'lchanadi va nishonga tortiladi (cheklangan, gain bilan).
// three.js mixer suyakka faqat qiymat o'zgarganda yozadi, shuning uchun chaqiruvchi mixer.update dan OLDIN
// restorePosture() bilan klip pozasini tiklaydi — tuzatishlar to'planmaydi.
//
// Ikki bosqich (Witness.tsx tartibi): klip → applyPostureBody (umurtqa/o'mrov/bosh/tizza) → arms.ts clamp →
// applyPostureArms (yuqori qo'l, tirsak, bilak, kaft songa) → nigoh/chayqash. Qo'l bosqichi clamp dan KEYIN, chunki
// arms.ts bilak burilishini (twist) 60% ga qisadi — kaftni songa burish aks holda yo'qolib ketardi.
// Ierarxiya (GLB): Hips > Spine02 > Spine01 > Spine > {neck > Head > headfront, L/R Shoulder > Arm > ForeArm > Hand}
import * as THREE from 'three'

const DEG = Math.PI / 180

/** Sozlash jadvali (gradus). Intro qiymatlari + guvoh roli (ROLE_POSTURE.guvoh) birlashtirilgan. */
export const POSTURE = {
  /** Spine02→neck vektorining oldinga og'ishi nishoni — BIND ga nisbatan (manfiy = orqaga, ko'krak yuqoriga) */
  leanTarget: -2,
  leanFixMin: -10,
  leanFixMax: 2,
  /** og'ish tuzatishining qancha qismi qo'llanadi (qolgani — klipning tabiiy nafasi) */
  leanGain: 0.95,
  /** Bosh: bind dagi (tekis nigoh) pitch ga nisbatan shuncha yuqoriga; tuzatish chegarasi */
  headUp: 1.5,
  headFixMin: -4,
  headFixMax: 14,
  headGain: 0.9,
  /** tuzatishning bo'yin ulushi (qolgani bosh) */
  neckShare: 0.4,
  /** O'mrov (Shoulder): orqaga va pastga (yelka ochiq, ko'tarilmagan) */
  clavBack: 4,
  clavDown: 1.5,
  /** Yelka (UpperArm) tanadan og'ishi (frontal tekislikda) nishoni; faqat KAMAYTIRILADI */
  armAbdTarget: 11,
  armAbdFixMax: 26,
  /** Tirsak: oldinga tabiiy bukilish nishoni (sagittal), faqat qo'shiladi */
  elbowBend: 12,
  elbowFixMax: 14,
  /** Bilak (ForeArm→Hand) frontal og'ishi nishoni ("qanot"), faqat kamaytiriladi */
  foreAbdTarget: 5,
  foreAbdFixMax: 24,
  /** Kaft ramkasi topilmasa — bilak o'qi atrofida shuncha burish (chap/o'ng) */
  palmTwistL: 75,
  palmTwistR: 90,
  /** kaft burilishining bilakka o'tadigan ulushi (bilak bo'g'imi "o'ralib" ketmasin) */
  palmForeShare: 0.55,
  /** "erkin yon": barmoqlar bilak davomidan biroz ichkariga/oldinga, kaft songa va biroz orqaga */
  sideFingerIn: 0.06,
  sideFingerFwd: 0.1,
  sidePalmBack: 0.25,
  /** idle klip tezligi ko'paytiruvchisi (tebranishni tinchlantirish; guvoh biroz tarang — 0,75) */
  idleTimeScale: 0.75,
  /** Tizza: bind ga nisbatan bukilish shundan oshsa to'g'rilanadi; ildiz o'lchab ko'tariladi */
  kneeTarget: 6,
  kneeFixMax: 20,
  /** Son yaw (gradus): tos biroz buriladi, ko'krak ~60% qaytadi — "manekendek" turmasin */
  hipYaw: -3,
}
export type PostureTuning = typeof POSTURE

/** Kaft ramkasi qo'l suyagi LOKAL fazosida: f — barmoqlar yo'nalishi, n — kaft normali */
type PalmFrame = { f: THREE.Vector3; n: THREE.Vector3 }
type Leg = { up: THREE.Object3D | null; leg: THREE.Object3D | null; foot: THREE.Object3D | null; knee0: number }
type Side = { sign: 1 | -1; clav: THREE.Object3D | null; arm: THREE.Object3D | null; fore: THREE.Object3D | null; hand: THREE.Object3D | null; palm: PalmFrame | null }

export type PostureRig = {
  root: THREE.Object3D
  hips: THREE.Object3D | null
  spine: THREE.Object3D[] // pastdan yuqoriga: Spine02, Spine01, Spine
  neck: THREE.Object3D | null
  head: THREE.Object3D | null
  headfront: THREE.Object3D | null
  sides: Side[]
  legs: Leg[]
  rootY0: number
  headPitch0: number
  lean0: number
  touched: THREE.Object3D[]
  clipQ: THREE.Quaternion[]
  hasClip: boolean
  tune: PostureTuning
  /** oxirgi o'lchovlar (klip pozasi, tuzatishdan OLDIN), gradus */
  measured: Record<string, number>
}

// kadr ichida obyekt yaratilmasin
const _qR = new THREE.Quaternion()
const _qRi = new THREE.Quaternion()
const _qP = new THREE.Quaternion()
const _qD = new THREE.Quaternion()
const _qI = new THREE.Quaternion()
const _qH = new THREE.Quaternion()
const _qF = new THREE.Quaternion()
const _qB = new THREE.Quaternion()
const _qT = new THREE.Quaternion()
const _m = new THREE.Matrix4()
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _v = new THREE.Vector3()
const _u = new THREE.Vector3()
const _x3 = new THREE.Vector3()
const _fT = new THREE.Vector3()
const _nT = new THREE.Vector3()
const _a2 = new THREE.Vector3()
const _b3 = new THREE.Vector3()
const _ank = new THREE.Vector3()
const AX = new THREE.Vector3(1, 0, 0)
const AY = new THREE.Vector3(0, 1, 0)
const AZ = new THREE.Vector3(0, 0, 1)

function frame(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  root.getWorldQuaternion(_qR)
  _qRi.copy(_qR).invert()
}

/** b - a, personaj ramkasida */
function charVec(a: THREE.Object3D, b: THREE.Object3D, out: THREE.Vector3) {
  a.getWorldPosition(_a)
  b.getWorldPosition(_b)
  return out.subVectors(_b, _a).applyQuaternion(_qRi)
}

/** suyakni personaj ramkasidagi o'q atrofida burish (bolalari bilan matritsalar yangilanadi) */
function turn(bone: THREE.Object3D | null, axisChar: THREE.Vector3, angle: number) {
  if (!bone || !bone.parent || Math.abs(angle) < 1e-5) return
  _qD.setFromAxisAngle(axisChar, angle)
  _qD.premultiply(_qR).multiply(_qI.copy(_qR).invert())
  bone.parent.getWorldQuaternion(_qP)
  _qD.premultiply(_qI.copy(_qP).invert()).multiply(_qP)
  bone.quaternion.premultiply(_qD)
  bone.updateMatrixWorld(true)
}

const pitchOf = (v: THREE.Vector3) => Math.atan2(v.y, Math.hypot(v.x, v.z))

/**
 * Rig yasash. useGLTF sahnasi keshda umumiy (klonlanmagan), shuning uchun bind pozasi suyak userData.bindQ/bindP da
 * birinchi marta saqlanadi va o'lchovdan oldin tiklanadi — qayta mount (HMR) da ham bind o'lchovlari to'g'ri.
 */
export function makePostureRig(root: THREE.Object3D): PostureRig {
  const by = new Map<string, THREE.Object3D>()
  root.traverse((o) => {
    by.set(o.name.toLowerCase(), o)
    if (!o.userData.bindQ) {
      o.userData.bindQ = o.quaternion.clone()
      o.userData.bindP = o.position.clone()
    } else {
      o.quaternion.copy(o.userData.bindQ as THREE.Quaternion)
      o.position.copy(o.userData.bindP as THREE.Vector3)
    }
  })
  const g = (n: string) => by.get(n.toLowerCase()) ?? null
  const side = (s: 'Left' | 'Right', sign: 1 | -1): Side => ({ sign, clav: g(s + 'Shoulder'), arm: g(s + 'Arm'), fore: g(s + 'ForeArm'), hand: g(s + 'Hand'), palm: null })
  const rig: PostureRig = {
    root,
    hips: g('Hips'),
    spine: ['Spine02', 'Spine01', 'Spine'].map(g).filter((o): o is THREE.Object3D => !!o),
    neck: g('neck'),
    head: g('Head'),
    headfront: g('headfront'),
    sides: [side('Left', 1), side('Right', -1)],
    legs: (['Left', 'Right'] as const).map((sd) => ({ up: g(sd + 'UpLeg'), leg: g(sd + 'Leg'), foot: g(sd + 'Foot'), knee0: 0 })),
    rootY0: root.position.y,
    headPitch0: 0,
    lean0: 0,
    touched: [],
    clipQ: [],
    hasClip: false,
    tune: { ...POSTURE },
    measured: {},
  }
  rig.touched = [rig.hips, ...rig.spine, rig.neck, rig.head, ...rig.sides.flatMap((s) => [s.clav, s.arm, s.fore, s.hand]), ...rig.legs.flatMap((l) => [l.up, l.leg, l.foot])].filter(
    (o): o is THREE.Object3D => !!o,
  )
  rig.clipQ = rig.touched.map(() => new THREE.Quaternion())
  frame(root)
  if (rig.head && rig.headfront) rig.headPitch0 = pitchOf(charVec(rig.head, rig.headfront, _v))
  const top = rig.neck ?? rig.spine[rig.spine.length - 1]
  if (rig.spine.length && top) rig.lean0 = Math.atan2(charVec(rig.spine[0], top, _v).z, _v.y) / DEG
  for (const s of rig.sides) if (s.hand) s.palm = detectPalm(root, s.hand, s.sign > 0)
  for (const l of rig.legs) l.knee0 = kneeBend(l)
  return rig
}

/**
 * Kaft ramkasini qo'l mesh geometriyasidan aniqlash (bir marta, bind pozada). Barmoqlar yo'nalishi — qo'lga bog'langan
 * cho'qqilar markazi; kaft tekisligi — perpendikulyar kesimdagi eng katta yoyilish; normal ishorasi — bosh barmoq tomoni.
 */
function detectPalm(root: THREE.Object3D, hand: THREE.Object3D, isLeft: boolean): PalmFrame | null {
  hand.updateWorldMatrix(true, false)
  const inv = new THREE.Matrix4().copy(hand.matrixWorld).invert()
  const pts: number[] = []
  const v = new THREE.Vector3()
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh
    if (!m.isSkinnedMesh || !m.skeleton) return
    const bi = m.skeleton.bones.indexOf(hand as THREE.Bone)
    if (bi < 0) return
    const si = m.geometry.getAttribute('skinIndex')
    const sw = m.geometry.getAttribute('skinWeight')
    const count = m.geometry.getAttribute('position')?.count ?? 0
    if (!si || !sw) return
    m.updateWorldMatrix(true, false)
    for (let i = 0; i < count; i++) {
      let best = -1
      let bw = -1
      for (let k = 0; k < 4; k++) {
        const wk = sw.getComponent(i, k)
        if (wk > bw) {
          bw = wk
          best = si.getComponent(i, k)
        }
      }
      if (best !== bi || bw < 0.6) continue
      m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld).applyMatrix4(inv)
      pts.push(v.x, v.y, v.z)
    }
  })
  const n = pts.length / 3
  if (n < 60) return null
  const c = new THREE.Vector3()
  for (let i = 0; i < pts.length; i += 3) c.add(v.set(pts[i], pts[i + 1], pts[i + 2]))
  c.divideScalar(n)
  const f = c.clone().normalize()
  if (!Number.isFinite(f.x) || f.lengthSq() < 0.5) return null
  const e1 = new THREE.Vector3(1, 0, 0)
  if (Math.abs(e1.dot(f)) > 0.9) e1.set(0, 0, 1)
  orthoTo(e1, f)
  const e2 = new THREE.Vector3().crossVectors(f, e1)
  let sxx = 0
  let syy = 0
  let sxy = 0
  let dmin = Infinity
  let dmax = -Infinity
  for (let i = 0; i < pts.length; i += 3) {
    v.set(pts[i] - c.x, pts[i + 1] - c.y, pts[i + 2] - c.z)
    const x = v.dot(e1)
    const y = v.dot(e2)
    sxx += x * x
    syy += y * y
    sxy += x * y
    const d = pts[i] * f.x + pts[i + 1] * f.y + pts[i + 2] * f.z
    dmin = Math.min(dmin, d)
    dmax = Math.max(dmax, d)
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const wide = e1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(e2, Math.sin(ang))
  const nrm = new THREE.Vector3().crossVectors(f, wide).normalize()
  const thumb = isLeft ? new THREE.Vector3().crossVectors(nrm, f) : new THREE.Vector3().crossVectors(f, nrm)
  let prox = 0
  let np = 0
  let far = 0
  let nf = 0
  const span = dmax - dmin
  for (let i = 0; i < pts.length; i += 3) {
    const d = pts[i] * f.x + pts[i + 1] * f.y + pts[i + 2] * f.z
    const t = (pts[i] - c.x) * thumb.x + (pts[i + 1] - c.y) * thumb.y + (pts[i + 2] - c.z) * thumb.z
    if (d < dmin + 0.5 * span) {
      prox += t
      np++
    } else if (d > dmin + 0.75 * span) {
      far += t
      nf++
    }
  }
  if (!np || !nf) return null
  if (prox / np - far / nf < 0) nrm.negate()
  return { f, n: orthoTo(nrm, f) }
}

/** n ni f ga perpendikulyar qilib normallash */
function orthoTo(n: THREE.Vector3, f: THREE.Vector3) {
  return n.addScaledVector(f, -n.dot(f)).normalize()
}

/** Tizza bukilishi (gradus, oldinga musbat): son va boldirning sagittal og'ishlari farqi */
function kneeBend(l: Leg) {
  if (!l.up || !l.leg || !l.foot) return 0
  charVec(l.up, l.leg, _a2)
  charVec(l.leg, l.foot, _b3)
  return (Math.atan2(_a2.z, -_a2.y) - Math.atan2(_b3.z, -_b3.y)) / DEG
}

function ankleY(rig: PostureRig) {
  let y = 0
  let n = 0
  for (const l of rig.legs)
    if (l.foot) {
      l.foot.getWorldPosition(_ank)
      y += _ank.y
      n++
    }
  return n ? y / n : 0
}

function fixKnees(rig: PostureRig, gain: number) {
  const T = rig.tune
  rig.root.position.y = rig.rootY0
  rig.root.updateMatrixWorld(true)
  const before = ankleY(rig)
  let any = false
  for (const l of rig.legs) {
    if (!l.up || !l.leg || !l.foot) continue
    const fix = THREE.MathUtils.clamp(kneeBend(l) - l.knee0 - T.kneeTarget, 0, T.kneeFixMax) * DEG * gain
    if (fix < 1e-4) continue
    // son orqaga, boldir oldinga, tovon — taglik polga parallel qolsin
    turn(l.up, AX, fix * 0.5)
    turn(l.leg, AX, -fix)
    turn(l.foot, AX, fix * 0.5)
    any = true
  }
  if (!any) return
  const drop = before - ankleY(rig)
  if (Math.abs(drop) > 1e-5) {
    rig.root.position.y = rig.rootY0 + drop
    rig.root.updateMatrixWorld(true)
  }
}

/** mixer.update DAN OLDIN: o'tgan kadrdagi tuzatishlarni olib tashlash (klip pozasini tiklash) */
export function restorePosture(rig: PostureRig) {
  if (rig.hasClip) rig.touched.forEach((o, i) => o.quaternion.copy(rig.clipQ[i]))
}

/**
 * 1-bosqich, mixer.update DAN KEYIN: klip pozasini saqlaydi va qaddni tuzatadi (son yaw, tizza, umurtqa, o'mrov, bosh).
 * gain 0..1 — tuzatish kuchi (talk/think da yumshoqroq). gain 0 da ham klip pozasi saqlanadi (to'planmaslik uchun).
 */
export function applyPostureBody(rig: PostureRig, gain: number) {
  const T = rig.tune
  rig.touched.forEach((o, i) => rig.clipQ[i].copy(o.quaternion))
  rig.hasClip = true
  frame(rig.root)
  // o'lchov (klip pozasi) — hisobot/dev uchun
  const top = rig.neck ?? rig.spine[rig.spine.length - 1]
  const lean = rig.spine.length && top ? Math.atan2(charVec(rig.spine[0], top, _v).z, _v.y) / DEG : 0
  rig.measured.lean = lean - rig.lean0
  if (rig.head && rig.headfront) rig.measured.headPitch = (pitchOf(charVec(rig.head, rig.headfront, _v)) - rig.headPitch0) / DEG
  if (gain <= 0) {
    rig.root.position.y = rig.rootY0
    return
  }

  // 0) son yaw, ko'krak ~60% qaytadi
  if (rig.hips && T.hipYaw) {
    turn(rig.hips, AY, T.hipYaw * DEG * gain)
    const back = (-T.hipYaw * 0.6 * DEG * gain) / Math.max(1, rig.spine.length)
    for (const b of rig.spine) turn(b, AY, back)
  }
  // 0b) tizza (idle_a da ~10–15° bukilgan) — oyoq polda qolishi uchun ildiz ko'tariladi
  fixKnees(rig, gain)

  // 1) umurtqa: oldinga og'ishni tikka tortish (X atrofida manfiy = orqaga/ko'krak yuqoriga)
  if (rig.spine.length && top) {
    const cur = Math.atan2(charVec(rig.spine[0], top, _v).z, _v.y) / DEG
    const fix = THREE.MathUtils.clamp(rig.lean0 + T.leanTarget - cur, T.leanFixMin, T.leanFixMax) * T.leanGain * gain
    const per = (fix * DEG) / rig.spine.length
    for (const b of rig.spine) turn(b, AX, per)
  }

  // 2) o'mrov: orqaga (Y) va pastga (Z)
  for (const s of rig.sides) {
    turn(s.clav, AY, s.sign * T.clavBack * DEG * gain)
    turn(s.clav, AZ, -s.sign * T.clavDown * DEG * gain)
  }

  // 3) bo'yin/bosh: nigoh tekis (bind pitch + headUp). Pitch yuqoriga = X atrofida manfiy
  if (rig.head && rig.headfront) {
    const p = pitchOf(charVec(rig.head, rig.headfront, _v))
    const want = rig.headPitch0 + T.headUp * DEG
    const fix = THREE.MathUtils.clamp((want - p) / DEG, T.headFixMin, T.headFixMax) * T.headGain * DEG * gain
    turn(rig.neck, AX, -fix * T.neckShare)
    turn(rig.head, AX, -fix * (1 - T.neckShare))
  }
}

/**
 * 2-bosqich, arms.ts clamp DAN KEYIN: yuqori qo'l tanaga (faqat kamaytirish), tirsak yengil bukik, bilak "qanoti"
 * ichkariga, kaft songa. gain 0..1 — think da 0 (qo'l boshga yetsin), talk da kichik (imo-ishora o'lmasin).
 */
export function applyPostureArms(rig: PostureRig, gain: number) {
  if (gain <= 0) return
  const T = rig.tune
  frame(rig.root)
  for (const s of rig.sides) {
    if (!s.arm || !s.fore) continue
    const k = s.sign > 0 ? 'L' : 'R'
    // 4a) yelka: tanaga yaqin. Chap (+X) qo'lni pastga = Z atrofida manfiy
    charVec(s.arm, s.fore, _v)
    const abd = Math.atan2(s.sign * _v.x, -_v.y) / DEG
    rig.measured['abd' + k] = abd
    const drop = THREE.MathUtils.clamp(abd - T.armAbdTarget, 0, T.armAbdFixMax) * gain
    turn(s.arm, AZ, -s.sign * drop * DEG)
    if (!s.hand) continue
    // 4b) tirsak: oldinga yengil bukilish. Qo'lni oldinga = X atrofida manfiy
    charVec(s.arm, s.fore, _u)
    charVec(s.fore, s.hand, _v)
    rig.measured['fore' + k] = Math.atan2(s.sign * _v.x, -_v.y) / DEG
    const bend = (Math.atan2(_v.z, -_v.y) - Math.atan2(_u.z, -_u.y)) / DEG
    const add = THREE.MathUtils.clamp(T.elbowBend - bend, 0, T.elbowFixMax) * gain
    turn(s.fore, AX, -add * DEG)
    // 4b') bilak "qanoti": ichkariga (frontal), faqat kamaytirish
    charVec(s.fore, s.hand, _v)
    const foreAbd = Math.atan2(s.sign * _v.x, -_v.y) / DEG
    const inward = THREE.MathUtils.clamp(foreAbd - T.foreAbdTarget, 0, T.foreAbdFixMax) * gain
    turn(s.fore, AZ, -s.sign * inward * DEG)
    // 4c) kaft songa: kaft ramkasi bo'lsa — aniq orientatsiya (gain bo'yicha slerp), aks holda bilak o'qi atrofida
    if (s.palm) {
      charVec(s.fore, s.hand, _fT).normalize()
      _fT.x += -s.sign * T.sideFingerIn
      _fT.z += T.sideFingerFwd
      _fT.normalize()
      orthoTo(_nT.set(-s.sign, 0, -T.sidePalmBack), _fT)
      orientHand(s, _fT, _nT, T.palmForeShare, gain)
      continue
    }
    charVec(s.hand, s.fore, _u).normalize()
    const tw = -s.sign * (s.sign > 0 ? T.palmTwistL : T.palmTwistR) * DEG * gain
    turn(s.fore, _u, tw * T.palmForeShare)
    charVec(s.hand, s.fore, _u).normalize()
    turn(s.hand, _u, tw * (1 - T.palmForeShare))
  }
}

/** ortonormal bazis (f, n, f×n) dan kvaternion */
function basisQuat(f: THREE.Vector3, n: THREE.Vector3, out: THREE.Quaternion) {
  _x3.crossVectors(f, n)
  _m.makeBasis(f, n, _x3)
  return out.setFromRotationMatrix(_m)
}

/** suyakning personaj ramkasidagi kvaternioni */
function charQuat(o: THREE.Object3D, out: THREE.Quaternion) {
  o.getWorldQuaternion(out)
  return out.premultiply(_qRi)
}

/** suyakka personaj ramkasidagi orientatsiyani berish (bolalari yangilanadi) */
function setCharQuat(o: THREE.Object3D, q: THREE.Quaternion) {
  if (!o.parent) return
  o.parent.getWorldQuaternion(_qP)
  o.quaternion.copy(_qP).invert().multiply(_qR).multiply(q)
  o.updateMatrixWorld(true)
}

/** Kaftni nishonga: barmoqlar fT, kaft normali nT (personaj ramkasida); gain — joriy holatdan nishongacha ulush */
function orientHand(s: Side, fT: THREE.Vector3, nT: THREE.Vector3, twistShare: number, gain: number) {
  if (!s.palm || !s.fore || !s.hand) return
  // q · fL = fT, q · nL = nT  =>  q = B(fT, nT) · B(fL, nL)⁻¹
  basisQuat(fT, nT, _qT)
  basisQuat(s.palm.f, s.palm.n, _qB)
  _qT.multiply(_qB.invert())
  if (gain < 1) _qT.copy(charQuat(s.hand, _qH).slerp(_qT, gain))
  // bilak o'qi atrofidagi burilishning bir qismi bilakka o'tadi (bo'g'im o'ralmasin)
  charQuat(s.fore, _qF)
  _qB.copy(_qF).invert().multiply(_qT)
  const twist = 2 * Math.atan2(_qB.y, _qB.w)
  const tw = Math.atan2(Math.sin(twist), Math.cos(twist)) * twistShare
  if (Math.abs(tw) > 1e-4) {
    s.fore.quaternion.multiply(_qB.setFromAxisAngle(AY, tw))
    s.fore.updateMatrixWorld(true)
  }
  setCharQuat(s.hand, _qT)
}

/** Joriy pozani o'lchash (o'zgartirmaydi) — dev/hisobot uchun, gradus. Bind ga nisbatan: lean, headPitch. */
export function measurePosture(rig: PostureRig) {
  frame(rig.root)
  const out: Record<string, number> = {}
  const top = rig.neck ?? rig.spine[rig.spine.length - 1]
  if (rig.spine.length && top) out.lean = Math.atan2(charVec(rig.spine[0], top, _v).z, _v.y) / DEG - rig.lean0
  if (rig.head && rig.headfront) out.headPitch = (pitchOf(charVec(rig.head, rig.headfront, _v)) - rig.headPitch0) / DEG
  for (const s of rig.sides) {
    if (!s.arm || !s.fore || !s.hand) continue
    const k = s.sign > 0 ? 'L' : 'R'
    charVec(s.arm, s.fore, _u)
    out['abd' + k] = Math.atan2(s.sign * _u.x, -_u.y) / DEG
    charVec(s.fore, s.hand, _v)
    out['elbow' + k] = (Math.atan2(_v.z, -_v.y) - Math.atan2(_u.z, -_u.y)) / DEG
    out['fore' + k] = Math.atan2(s.sign * _v.x, -_v.y) / DEG
    // kaft normali X bo'yicha: +1 — tanaga (songa), 0 — oldinga/orqaga
    if (s.palm) {
      charQuat(s.hand, _qH)
      _v.copy(s.palm.n).applyQuaternion(_qH)
      out['palmIn' + k] = -s.sign * _v.x
      out['palmFwd' + k] = _v.z
    }
  }
  for (const l of rig.legs) out['knee' + (l === rig.legs[0] ? 'L' : 'R')] = kneeBend(l) - l.knee0
  return out
}
